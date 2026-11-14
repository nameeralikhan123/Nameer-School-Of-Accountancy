/* rd-dash: Dashboard redesign.
 * Renders a new student home into #view-dashboard and hides (but keeps) the
 * original markup, so every id the app writes to (stat-*, streak-*, subj-*,
 * dash-welcome-*) still exists and keeps working.
 *
 * Data sources (all read the same way the app reads them):
 *   pc_sessions             practice sessions  -> questions, accuracy, per-day activity
 *   prc_mock_exam_history   mock attempts      -> mocks, accuracy, per-day activity
 *   nsa_study_log           chapters opened    -> topics, "continue", per-day activity
 *   getProfile()            student name
 *   planTracksOrdered() / trackSubjects() / activeTrack()  tracks + subjects
 *   mmDataStore[sid]        chapter totals per subject
 *   practiceMistakeBookFull()  open mistakes
 *   nsa_rd_prefs            (own) {dailyGoal, examDate}
 * Hooks: wraps window.renderRealStats and window.renderProfileUI (original runs
 * first, then we repaint), plus a cross-tab `storage` listener.
 */
(function () {
    'use strict';

    var PREF_KEY = 'nsa_rd_prefs';
    var DAY = 86400000;
    var LEVELS = [
        ['Trainee', 0], ['Journal Clerk', 250], ['Ledger Keeper', 600], ['Trial Balancer', 1200],
        ['Reconciler', 2000], ['Accruals Analyst', 3200], ['Auditor-in-Making', 4800],
        ['Statement Preparer', 7000], ['Exam Strategist', 10000], ['Chartered Ready', 14000]
    ];
    var HEAT_WEEKS = 18;
    var state = { track: null, root: null, pending: false };

    /* ------------------------------------------------------------ helpers */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    function fn(name) { return typeof window[name] === 'function' ? window[name] : null; }
    function call(name) {
        var f = fn(name);
        if (!f) return undefined;
        try { return f.apply(window, Array.prototype.slice.call(arguments, 1)); }
        catch (e) { try { console.warn('[rd-dash] ' + name + ' failed', e); } catch (x) { /* */ } }
        return undefined;
    }
    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var v = JSON.parse(raw);
            return v == null ? fallback : v;
        } catch (e) { return fallback; }
    }
    function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
    function plural(n, w, p) { return n + ' ' + (n === 1 ? w : (p || w + 's')); }

    /* Pakistan calendar day key, matching the app's own streak maths. */
    function pkParts(ts) {
        var d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
        return d;
    }
    function dayKey(ts) {
        if (!ts) return '';
        var d = pkParts(ts);
        if (isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function keyToDate(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function dateToKey(d) {
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function todayKey() { return dayKey(Date.now()); }
    function addDays(k, n) { var d = keyToDate(k); d.setDate(d.getDate() + n); return dateToKey(d); }
    function tsOf(v) {
        if (!v) return 0;
        var n = Number(v);
        if (!isNaN(n) && n > 0) return n;
        var d = new Date(String(v));
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }

    function getPrefs() {
        var p = readJSON(PREF_KEY, {}) || {};
        var g = parseInt(p.dailyGoal, 10);
        return {
            dailyGoal: g > 0 ? Math.min(500, g) : 30,
            examDate: /^\d{4}-\d{2}-\d{2}$/.test(p.examDate || '') ? p.examDate : null
        };
    }
    function setPrefs(p) {
        try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* quota */ }
    }

    function subjectsAll() {
        try { if (typeof mmSubjectsList !== 'undefined') return mmSubjectsList; } catch (e) { /* */ }
        return [];
    }
    function subjectMeta(sid) {
        var list = subjectsAll();
        for (var i = 0; i < list.length; i++) if (list[i].id === sid) return list[i];
        if (sid === 'caf4v1') return subjectMeta('caf4');
        return { id: sid, code: String(sid || '').toUpperCase(), name: sid, shortName: sid };
    }
    function chapterTotal(sid) {
        try {
            if (typeof mmDataStore !== 'undefined' && mmDataStore[sid]) return mmDataStore[sid].length;
        } catch (e) { /* */ }
        return 0;
    }
    function chapterTitle(sid, chId) {
        try {
            var list = (typeof mmDataStore !== 'undefined' && mmDataStore[sid]) || [];
            for (var i = 0; i < list.length; i++) if (list[i].id === chId) return list[i].title || '';
        } catch (e) { /* */ }
        return '';
    }
    function levelOf(sid) {
        var f = fn('planLevelOf');
        return f ? f(sid) : String(sid || '').replace(/[^a-z].*$/, '');
    }
    function trackLabel(t) {
        var f = fn('planTrackMeta');
        var m = f ? f(t) : null;
        return m && m.label ? m.label : String(t || '').toUpperCase();
    }
    function trackShort(t) {
        return ({ prc: 'PRC', caf: 'CAF', acf: 'ACCA Foundation', acs: 'ACCA Skills' })[t] || String(t).toUpperCase();
    }

    /* ------------------------------------------------------------ data model */
    function collect() {
        var sessions = (readJSON('pc_sessions', []) || []);
        if (!Array.isArray(sessions)) sessions = [];
        sessions = sessions.filter(function (s) { return s && (s.results || []).length; });
        var mocks = readJSON('prc_mock_exam_history', []);
        if (!Array.isArray(mocks)) mocks = [];
        var log = (fn('getStudyLog') ? call('getStudyLog') : readJSON('nsa_study_log', [])) || [];
        if (!Array.isArray(log)) log = [];

        var today = todayKey();
        var wk0 = addDays(today, -6), wk1 = addDays(today, -13);
        function inThisWeek(k) { return k && k >= wk0 && k <= today; }
        function inLastWeek(k) { return k && k >= wk1 && k < wk0; }

        var d = {
            attempted: 0, correct: 0, awarded: 0, marks: 0,
            mocks: mocks.length, today: 0,
            days: {},           /* dayKey -> activity units */
            qdays: {},          /* dayKey -> questions answered */
            subj: {},           /* sid -> {q, awarded, marks, chapters:Set, last} */
            wk: { q: 0, aw: 0, mk: 0, mocks: 0, topics: 0 },
            pw: { q: 0, aw: 0, mk: 0, mocks: 0, topics: 0 },
            lastSession: null, lastLog: null
        };
        function subj(sid) {
            if (!sid) return null;
            if (!d.subj[sid]) d.subj[sid] = { q: 0, aw: 0, mk: 0, chapters: {}, last: 0 };
            return d.subj[sid];
        }
        function bump(k, n) { if (k) d.days[k] = (d.days[k] || 0) + n; }

        var chapterFirstSeen = {}; /* sid|chapter -> first ts, for weekly topic delta */
        function seenChapter(sid, ch, ts) {
            var s = subj(sid);
            if (!s || !ch) return;
            s.chapters[ch] = true;
            var key = sid + '|' + ch;
            if (ts && (!chapterFirstSeen[key] || ts < chapterFirstSeen[key])) chapterFirstSeen[key] = ts;
            if (!ts && !chapterFirstSeen[key]) chapterFirstSeen[key] = 0;
        }

        sessions.forEach(function (s) {
            var ts = tsOf(s.finishedAt || s.startedAt);
            var k = dayKey(ts);
            var n = 0, aw = 0, mk = 0;
            (s.results || []).forEach(function (r) {
                if (!r) return;
                n++;
                aw += (r.awarded || 0);
                mk += (r.maxMarks || 0);
            });
            d.attempted += n; d.awarded += aw; d.marks += mk;
            d.correct += mk > 0 ? n * (aw / mk) : 0;
            bump(k, n);
            if (k) d.qdays[k] = (d.qdays[k] || 0) + n;
            if (k === today) d.today += n;
            if (inThisWeek(k)) { d.wk.q += n; d.wk.aw += aw; d.wk.mk += mk; }
            else if (inLastWeek(k)) { d.pw.q += n; d.pw.aw += aw; d.pw.mk += mk; }
            var sid0 = s.subjectId || '';
            (s.questions || []).forEach(function (q) {
                if (q && q.subjectId) seenChapter(q.subjectId, q.chapter || q.id, ts);
            });
            var sidUse = sid0 || ((s.questions || [])[0] || {}).subjectId || '';
            var so = subj(sidUse);
            if (so) { so.q += n; so.aw += aw; so.mk += mk; so.last = Math.max(so.last, ts); }
            if (!d.lastSession || ts > d.lastSession.ts) d.lastSession = { ts: ts, s: s, sid: sidUse };
        });

        mocks.forEach(function (m) {
            if (!m) return;
            var ts = tsOf(m.date);
            var k = dayKey(ts);
            var mk = m.totalMarks || 100, sc = m.score || 0;
            d.attempted += 60; d.awarded += sc; d.marks += mk; d.correct += sc / 2;
            bump(k, 60);
            if (k) d.qdays[k] = (d.qdays[k] || 0) + 60;
            if (k === today) d.today += 60;
            if (inThisWeek(k)) { d.wk.q += 60; d.wk.aw += sc; d.wk.mk += mk; d.wk.mocks++; }
            else if (inLastWeek(k)) { d.pw.q += 60; d.pw.aw += sc; d.pw.mk += mk; d.pw.mocks++; }
            if (m.subjectId) {
                seenChapter(m.subjectId, 'mock-exam', ts);
                var so = subj(m.subjectId);
                so.q += 60; so.aw += sc; so.mk += mk; so.last = Math.max(so.last, ts);
            }
        });

        log.forEach(function (e) {
            var ts = tsOf(e.at);
            bump(dayKey(ts), 1);
            seenChapter(e.subjectId, e.chapter, ts);
            var so = subj(e.subjectId);
            if (so) so.last = Math.max(so.last, ts);
            if (!d.lastLog || ts > d.lastLog.ts) d.lastLog = { ts: ts, e: e };
        });

        /* Topics: distinct chapters per subject, capped at the syllabus size (as the app does). */
        d.topics = 0;
        Object.keys(d.subj).forEach(function (sid) {
            var s = d.subj[sid];
            var total = chapterTotal(sid);
            var n = Object.keys(s.chapters).length;
            s.done = total ? Math.min(total, n) : n;
            s.total = total;
            d.topics += s.done;
        });
        Object.keys(chapterFirstSeen).forEach(function (key) {
            var k = dayKey(chapterFirstSeen[key]);
            if (inThisWeek(k)) d.wk.topics++;
            else if (inLastWeek(k)) d.pw.topics++;
        });

        d.accuracy = d.marks > 0 ? Math.round(d.awarded / d.marks * 1000) / 10 : 0;
        d.wkAcc = d.wk.mk > 0 ? d.wk.aw / d.wk.mk * 100 : null;
        d.pwAcc = d.pw.mk > 0 ? d.pw.aw / d.pw.mk * 100 : null;

        /* Streaks over consecutive Pakistan-calendar days. */
        var keys = Object.keys(d.days).filter(Boolean).sort();
        var best = 0, run = 0, prev = null;
        keys.forEach(function (k) {
            run = (prev && addDays(prev, 1) === k) ? run + 1 : 1;
            if (run > best) best = run;
            prev = k;
        });
        var cur = 0, probe = d.days[today] ? today : addDays(today, -1);
        while (d.days[probe]) { cur++; probe = addDays(probe, -1); }
        d.streak = cur; d.bestStreak = best; d.activeDays = keys.length;
        d.activeToday = !!d.days[today];

        d.xp = Math.round(10 * d.correct + 2 * d.attempted + 50 * d.mocks + 25 * d.topics);
        return d;
    }

    function levelFor(xp) {
        var i = 0;
        for (var j = 0; j < LEVELS.length; j++) if (xp >= LEVELS[j][1]) i = j;
        var next = LEVELS[i + 1] || null;
        return {
            idx: i, name: LEVELS[i][0], floor: LEVELS[i][1],
            next: next ? next[0] : null, ceil: next ? next[1] : null,
            pct: next ? (xp - LEVELS[i][1]) / (next[1] - LEVELS[i][1]) : 1
        };
    }

    function mistakeCount() {
        try {
            var book = call('practiceMistakeBookFull');
            if (book) return (book.objectiveCount || 0) + (book.writtenCount || 0);
        } catch (e) { /* */ }
        return 0;
    }

    function tracks() {
        var list = fn('planTracksOrdered') ? (call('planTracksOrdered') || []) : [];
        var out = [];
        list.forEach(function (t) {
            var subs = fn('trackSubjects') ? (call('trackSubjects', t.id) || []) : [];
            if (subs.length) out.push({ id: t.id, label: t.label, subjects: subs });
        });
        if (!out.length) {
            var all = subjectsAll();
            ['prc', 'caf', 'acf'].forEach(function (t) {
                var subs = all.filter(function (s) { return levelOf(s.id) === t; });
                if (subs.length) out.push({ id: t, label: trackLabel(t), subjects: subs });
            });
        }
        return out;
    }
    function currentTrack() {
        var t = fn('activeTrack') ? call('activeTrack') : 'prc';
        return t || 'prc';
    }

    /* ------------------------------------------------------------ navigation (app functions only) */
    function goStudy(sid) {
        var t = levelOf(sid);
        call('applyTrackSwitch', t);
        if (t === 'acf') call('switchAccaBook', sid);
        else if (t === 'caf') {
            var id = sid;
            try {
                if (typeof CAF_BOOKS !== 'undefined' && !CAF_BOOKS.some(function (b) { return b.id === id; }) && sid === 'caf4') id = 'caf4v1';
            } catch (e) { /* */ }
            call('switchCafBook', id);
        }
        call('switchView', 'study');
    }
    function goPractice(sid) {
        var t = sid ? levelOf(sid) : currentTrack();
        call('applyTrackSwitch', t);
        call('switchPracticeLevel', t);
        if (sid) call('switchPracticeSubject', sid);
        call('switchView', 'practice');
    }
    function openPdf(sid) {
        var t = levelOf(sid);
        try {
            if (t === 'acf' && fn('accaBooks')) {
                var a = call('accaBooks').filter(function (b) { return b.id === sid; })[0];
                if (a) return call('openAccaBook', a.file);
            }
            if (t === 'caf' && typeof CAF_BOOKS !== 'undefined') {
                var c = CAF_BOOKS.filter(function (b) { return b.id === sid || (sid === 'caf4' && b.id === 'caf4v1'); })[0];
                if (c) return call('openCafBook', c.file);
            }
            if (t === 'prc' && typeof STUDY_BOOK_MAP !== 'undefined' && STUDY_BOOK_MAP[sid]) {
                return call('openPrcBook', STUDY_BOOK_MAP[sid].file);
            }
        } catch (e) { /* fall through */ }
        goStudy(sid);
    }
    function hasPdf(sid) {
        var t = levelOf(sid);
        try {
            if (t === 'acf') return !!fn('openAccaBook');
            if (t === 'caf') return typeof CAF_BOOKS !== 'undefined' && !!fn('openCafBook');
            if (t === 'prc') return typeof STUDY_BOOK_MAP !== 'undefined' && !!STUDY_BOOK_MAP[sid] && !!fn('openPrcBook');
        } catch (e) { /* */ }
        return false;
    }
    /* Re-open the exact chapter last studied, through the same opener the library uses. */
    function continueEntry(e) {
        var sid = e.subjectId, m = /-ch(\d+)$/.exec(e.chapter || ''), n = m ? +m[1] : 0;
        var t = levelOf(sid);
        function idxIn(chs) {
            for (var i = 0; i < (chs || []).length; i++) if (+chs[i].n === n) return i;
            return -1;
        }
        try {
            if (n && t === 'caf' && typeof CAF_BOOKS !== 'undefined') {
                var b = CAF_BOOKS.filter(function (x) { return x.id === sid; })[0];
                var i = b ? idxIn(b.chapters) : -1;
                if (i >= 0) { call('applyTrackSwitch', 'caf'); call('switchCafBook', sid); call('switchView', 'study'); return call('openCafChapter', sid, i); }
            }
            if (n && t === 'acf' && fn('accaBooks')) {
                var a = call('accaBooks').filter(function (x) { return x.id === sid; })[0];
                var j = a ? idxIn(a.chapters) : -1;
                if (j >= 0) { goStudy(sid); return call('openAccaChapter', sid, j); }
            }
            if (n && t === 'prc' && typeof STUDY_BOOK_MAP !== 'undefined' && STUDY_BOOK_MAP[sid]) {
                var p = STUDY_BOOK_MAP[sid];
                var k = idxIn(p.chapters);
                if (k >= 0 && fn('openPrcChapter')) { goStudy(sid); return call('openPrcChapter', p.file, k); }
            }
        } catch (err) { /* fall back below */ }
        goStudy(sid);
    }

    /* ------------------------------------------------------------ icons */
    var ICON = {
        arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
        flame: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.8 1.2 2.8 2.2 3.2C11 9 11.2 6 12 3z"/></svg>',
        edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
        check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
        target: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>',
        book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13z"/></svg>',
        redo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>',
        cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
        clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>'
    };
    /* Badge glyphs: one quiet line-icon per badge. */
    var GLYPH = {
        q: '<path d="M6 4h12v16H6z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
        h: '<path d="M4 18h16"/><path d="M7 18V9M12 18V5M17 18v-6"/>',
        m: '<path d="M4 18c3-7 6-11 8-11s5 4 8 11"/><path d="M4 18h16"/>',
        f: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.8 1.2 2.8 2.2 3.2C11 9 11.2 6 12 3z"/>',
        w: '<path d="M12 4v16M5 8h14"/><path d="M5 8l-2.5 6h5zM19 8l-2.5 6h5z"/>',
        e: '<circle cx="12" cy="12" r="3"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/>',
        t: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
        c: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
        r: '<path d="M5 4h14v16H5z"/><path d="M8 9l2 2 4-4M8 15h8"/>',
        s: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'
    };

    /* ------------------------------------------------------------ render parts */
    function greetingWord() {
        var h = pkParts(Date.now()).getHours();
        return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    }
    function firstName() {
        var p = fn('getProfile') ? call('getProfile') : null;
        var n = (p && p.name) ? String(p.name).trim() : '';
        if (!n || n.toLowerCase() === 'student' || n.toLowerCase() === 'preview') return '';
        return n.split(/\s+/)[0];
    }

    function continueTarget(d) {
        var log = d.lastLog, ses = d.lastSession;
        if (log && (!ses || log.ts >= ses.ts)) {
            var m = subjectMeta(log.e.subjectId);
            var title = String(log.e.title || '').replace(/^Quick revision:\s*/i, '');
            var n = /-ch(\d+)$/.exec(log.e.chapter || '');
            return {
                label: m.code + (n ? ' · Ch ' + n[1] : ''),
                sub: title,
                run: function () { continueEntry(log.e); }
            };
        }
        if (ses && ses.sid) {
            var sm = subjectMeta(ses.sid);
            var q0 = (ses.s.questions || [])[0] || {};
            var cn = /-ch(\d+)$/.exec(q0.chapter || '');
            return {
                label: sm.code + (cn ? ' · Ch ' + cn[1] : ''),
                sub: chapterTitle(ses.sid, q0.chapter) || (ses.s.mode === 'CHAPTER_QUIZ' ? 'chapter quiz' : 'practice'),
                run: function () { goPractice(ses.sid); }
            };
        }
        return null;
    }

    function headline(d, prefs) {
        var left = prefs.dailyGoal - d.today;
        if (d.today >= prefs.dailyGoal) return 'Today’s goal is done: ' + fmt(d.today) + ' questions answered. Anything more is a bonus.';
        if (d.today > 0) return 'You’re ' + plural(left, 'question') + ' from today’s goal.';
        if (d.streak > 0) return 'Answer ' + prefs.dailyGoal + ' questions today to keep your ' + d.streak + '-day streak going.';
        if (d.attempted > 0) return 'Your daily goal is ' + prefs.dailyGoal + ' questions. One chapter quiz gets you most of the way.';
        return 'Start with one chapter quiz. Your progress, streak and level build from there.';
    }

    function renderHead(d, prefs) {
        var name = firstName();
        var cont = continueTarget(d);
        var date = pkParts(Date.now()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        var t = currentTrack();
        var html = '<header class="rd-dash-head">' +
            '<div class="rd-dash-head-text">' +
            '<p class="rd-dash-eyebrow">' + esc(date) + ' <span aria-hidden="true">·</span> ' + esc(trackLabel(t)) + '</p>' +
            '<h1 class="rd-dash-title">' + esc(greetingWord()) + (name ? ', ' + esc(name) : '') + '</h1>' +
            '<p class="rd-dash-lede">' + esc(headline(d, prefs)) + '</p>' +
            '</div><div class="rd-dash-cta">';
        if (cont) {
            html += '<button type="button" class="rd-dash-btn rd-dash-btn-primary" data-rd="continue">' +
                '<span class="rd-dash-btn-stack"><span class="rd-dash-btn-k">Continue</span>' +
                '<span class="rd-dash-btn-v">' + esc(cont.label) + (cont.sub ? ' — ' + esc(cont.sub) : '') + '</span></span>' + ICON.arrow + '</button>';
        } else {
            html += '<button type="button" class="rd-dash-btn rd-dash-btn-primary" data-rd="study-start">' +
                '<span class="rd-dash-btn-stack"><span class="rd-dash-btn-k">Begin</span><span class="rd-dash-btn-v">Open the study library</span></span>' + ICON.arrow + '</button>';
        }
        html += '<button type="button" class="rd-dash-btn rd-dash-btn-ghost" data-rd="practice">Start practice</button>';
        html += '</div></header>';
        return { html: html, cont: cont };
    }

    function ring(d, prefs) {
        var r = 46, c = 2 * Math.PI * r;
        var pct = Math.min(1, d.today / prefs.dailyGoal);
        var done = d.today >= prefs.dailyGoal;
        return '<svg class="rd-dash-ring' + (done ? ' is-done' : '') + '" viewBox="0 0 120 120" width="132" height="132" role="img" aria-label="' +
            esc(fmt(d.today) + ' of ' + prefs.dailyGoal + ' questions answered today') + '">' +
            '<circle cx="60" cy="60" r="' + r + '" class="rd-dash-ring-track"/>' +
            '<circle cx="60" cy="60" r="' + r + '" class="rd-dash-ring-fill" stroke-dasharray="' + c.toFixed(2) +
            '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(2) + '" transform="rotate(-90 60 60)"/>' +
            '<text x="60" y="58" text-anchor="middle" class="rd-dash-ring-num">' + fmt(d.today) + '</text>' +
            '<text x="60" y="78" text-anchor="middle" class="rd-dash-ring-sub">of ' + prefs.dailyGoal + '</text>' +
            '</svg>';
    }

    function weekBars(d, prefs) {
        var today = todayKey(), out = '', met = 0;
        for (var i = 6; i >= 0; i--) {
            var k = addDays(today, -i);
            var v = d.qdays[k] || 0;
            if (v >= prefs.dailyGoal) met++;
            var h = Math.max(v ? 8 : 3, Math.min(1, v / prefs.dailyGoal) * 100);
            var dt = keyToDate(k);
            var lbl = dt.toLocaleDateString('en-GB', { weekday: 'short' });
            out += '<li class="' + (i === 0 ? 'is-today ' : '') + (v >= prefs.dailyGoal ? 'is-met' : '') + '" title="' + esc(lbl + ': ' + v + ' questions') + '">' +
                '<span class="rd-dash-wk-col"><span style="height:' + h.toFixed(0) + '%"></span></span><span class="rd-dash-wk-d">' + esc(lbl.charAt(0)) + '</span></li>';
        }
        return '<div class="rd-dash-week"><p class="rd-dash-fine">Last 7 days · goal met on <strong>' + met + '</strong> of 7</p>' +
            '<ol class="rd-dash-wk" aria-hidden="true">' + out + '</ol></div>';
    }

    function renderHero(d, prefs) {
        var lv = levelFor(d.xp);
        var done = d.today >= prefs.dailyGoal;
        /* goal */
        var streakTxt = d.streak > 0 ? d.streak + '-day streak' : 'No streak yet';
        var streakSub = d.streak > 0
            ? (d.activeToday ? 'Today counted' : 'Study today to keep it')
            : 'Study on consecutive days';
        var goal = '<section class="rd-dash-card rd-dash-goal" aria-labelledby="rd-dash-goal-h">' +
            '<div class="rd-dash-card-top"><h2 id="rd-dash-goal-h" class="rd-dash-h">Today</h2>' +
            '<button type="button" class="rd-dash-link" data-rd="prefs" aria-label="Edit daily goal and exam date">' + ICON.edit + '<span>Goal ' + prefs.dailyGoal + '</span></button></div>' +
            '<div class="rd-dash-goal-body">' + ring(d, prefs) +
            '<div class="rd-dash-goal-side">' +
            '<p class="rd-dash-goal-state">' + (done ? '<span class="rd-dash-tick">' + ICON.check + '</span>Goal complete' :
                esc(plural(Math.max(0, prefs.dailyGoal - d.today), 'question')) + ' to go') + '</p>' +
            '<div class="rd-dash-streak' + (d.streak > 0 ? ' is-on' : '') + '">' + ICON.flame +
            '<span><strong>' + esc(streakTxt) + '</strong><small>' + esc(streakSub) + '</small></span></div>' +
            '<p class="rd-dash-fine">Best run ' + plural(d.bestStreak, 'day') + '</p>' +
            '</div></div>' + weekBars(d, prefs) + '</section>';

        /* level */
        var toNext = lv.ceil ? lv.ceil - d.xp : 0;
        var ledger = [
            ['Correct answers', '10 × ' + fmt(d.correct), 10 * d.correct],
            ['Questions attempted', '2 × ' + fmt(d.attempted), 2 * d.attempted],
            ['Mock exams', '50 × ' + d.mocks, 50 * d.mocks],
            ['Topics covered', '25 × ' + d.topics, 25 * d.topics]
        ];
        var level = '<section class="rd-dash-card rd-dash-level" aria-labelledby="rd-dash-level-h">' +
            '<div class="rd-dash-card-top"><h2 id="rd-dash-level-h" class="rd-dash-h">Level ' + (lv.idx + 1) + ' of ' + LEVELS.length + '</h2>' +
            '<span class="rd-dash-xp"><strong>' + fmt(d.xp) + '</strong> XP</span></div>' +
            '<p class="rd-dash-level-name">' + esc(lv.name) + '</p>' +
            '<div class="rd-dash-bar rd-dash-bar-sun" role="progressbar" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(lv.pct * 100) + '">' +
            '<span style="width:' + (lv.pct * 100).toFixed(1) + '%"></span></div>' +
            '<p class="rd-dash-fine">' + (lv.next ? fmt(toNext) + ' XP to <strong>' + esc(lv.next) + '</strong>' : 'Top level reached') + '</p>' +
            '<dl class="rd-dash-ledger">' + ledger.map(function (r) {
                return '<div><dt>' + r[0] + ' <span>' + r[1] + '</span></dt><dd>' + fmt(r[2]) + '</dd></div>';
            }).join('') + '</dl></section>';

        /* countdown */
        var cd;
        if (prefs.examDate) {
            var days = Math.round((keyToDate(prefs.examDate) - keyToDate(todayKey())) / DAY);
            var when = keyToDate(prefs.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            var note = days < 0 ? 'This date has passed. Set your next sitting.' :
                (days === 0 ? 'Exam day. Read each question twice.' :
                    (days <= 14 ? 'Final stretch: favour mock exams and your mistake book.' :
                        'About ' + plural(Math.round(days / 7), 'week') + ' of preparation left.'));
            cd = '<p class="rd-dash-big">' + (days < 0 ? '—' : fmt(days)) + '<span>' + (days === 1 ? 'day' : 'days') + '</span></p>' +
                '<p class="rd-dash-fine">to your exam on <strong>' + esc(when) + '</strong></p>' +
                '<p class="rd-dash-note">' + esc(note) + '</p>' +
                '<button type="button" class="rd-dash-link" data-rd="prefs">' + ICON.edit + '<span>Change date</span></button>';
        } else {
            cd = '<p class="rd-dash-note">Add your sitting date and the countdown appears here.</p>' +
                '<button type="button" class="rd-dash-btn rd-dash-btn-ghost rd-dash-btn-sm" data-rd="prefs">Set exam date</button>';
        }
        var count = '<section class="rd-dash-card rd-dash-count" aria-labelledby="rd-dash-count-h">' +
            '<div class="rd-dash-card-top"><h2 id="rd-dash-count-h" class="rd-dash-h">Exam countdown</h2></div>' + cd + '</section>';

        return '<div class="rd-dash-hero">' + goal + level + count + '</div>';
    }

    function delta(cur, prev, unit, isPts) {
        if (prev == null || cur == null) return '';
        var diff = cur - prev;
        if (Math.abs(diff) < (isPts ? 0.05 : 0.5)) return '<span class="rd-dash-delta is-flat">level with last wk</span>';
        var up = diff > 0;
        var v = isPts ? Math.abs(diff).toFixed(1) + ' pts' : fmt(Math.abs(diff)) + (unit ? ' ' + unit : '');
        return '<span class="rd-dash-delta ' + (up ? 'is-up' : 'is-down') + '"><span aria-hidden="true">' + (up ? '▲' : '▼') + '</span> ' +
            v + ' <span class="rd-dash-sr">' + (up ? 'up' : 'down') + '</span> vs last wk</span>';
    }

    function renderKpis(d) {
        var tiles = [
            { k: 'Questions attempted', v: fmt(d.attempted), dl: '<span class="rd-dash-delta is-flat"><strong>' + fmt(d.wk.q) + '</strong> this week</span>' + (d.wk.q || d.pw.q ? delta(d.wk.q, d.pw.q, '', false) : '') },
            { k: 'Average accuracy', v: d.marks ? d.accuracy.toFixed(1) + '%' : '—', dl: (d.wkAcc != null && d.pwAcc != null) ? delta(d.wkAcc, d.pwAcc, '', true) : (d.wkAcc != null ? '<span class="rd-dash-delta is-flat">' + d.wkAcc.toFixed(1) + '% this week</span>' : '<span class="rd-dash-delta is-flat">Needs answered questions</span>') },
            { k: 'Mock exams', v: fmt(d.mocks), dl: d.wk.mocks ? '<span class="rd-dash-delta is-up">+' + d.wk.mocks + ' this week</span>' : '<span class="rd-dash-delta is-flat">' + (d.mocks ? 'None this week' : 'Sit one when ready') + '</span>' },
            { k: 'Topics covered', v: fmt(d.topics), dl: d.wk.topics || d.pw.topics ? '<span class="rd-dash-delta is-flat"><strong>' + d.wk.topics + '</strong> new this week</span>' + delta(d.wk.topics, d.pw.topics, '', false) : '<span class="rd-dash-delta is-flat">Open a chapter to begin</span>' }
        ];
        return '<section class="rd-dash-kpis" aria-label="Key figures">' + tiles.map(function (t) {
            return '<div class="rd-dash-kpi"><p class="rd-dash-kpi-k">' + t.k + '</p><p class="rd-dash-kpi-v">' + t.v + '</p><div class="rd-dash-kpi-d">' + t.dl + '</div></div>';
        }).join('') + '</section>';
    }

    function renderHeat(d) {
        var today = todayKey();
        var td = keyToDate(today);
        var dow = (td.getDay() + 6) % 7; /* Monday = 0 */
        var start = addDays(today, -(HEAT_WEEKS - 1) * 7 - dow);
        var cell = 13, gap = 3, step = cell + gap, left = 26, top = 18;
        var w = left + HEAT_WEEKS * step, h = top + 7 * step;
        var max = 0;
        Object.keys(d.days).forEach(function (k) { if (k >= start && d.days[k] > max) max = d.days[k]; });
        function lvl(v) {
            if (!v) return 0;
            if (max <= 4) return Math.min(4, v);
            var r = v / max;
            return r > 0.75 ? 4 : r > 0.45 ? 3 : r > 0.2 ? 2 : 1;
        }
        var cells = '', months = '', lastMonth = -1, active = 0, total = 0;
        var dowCount = [0, 0, 0, 0, 0, 0, 0];
        for (var wk = 0; wk < HEAT_WEEKS; wk++) {
            for (var dd = 0; dd < 7; dd++) {
                var k = addDays(start, wk * 7 + dd);
                if (k > today) continue;
                total++;
                var v = d.days[k] || 0;
                if (v) { active++; dowCount[dd] += v; }
                var dt = keyToDate(k);
                var label = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ': ' +
                    (v ? plural(v, 'activity', 'activities') : 'no activity');
                cells += '<rect x="' + (left + wk * step) + '" y="' + (top + dd * step) + '" width="' + cell + '" height="' + cell +
                    '" rx="3" class="rd-dash-h' + lvl(v) + (k === today ? ' rd-dash-today' : '') + '"><title>' + esc(label) + '</title></rect>';
                if (dd === 0 && dt.getMonth() !== lastMonth) {
                    if (wk < HEAT_WEEKS - 1 || lastMonth === -1) {
                        months += '<text x="' + (left + wk * step) + '" y="11" class="rd-dash-heat-lbl">' + dt.toLocaleDateString('en-GB', { month: 'short' }) + '</text>';
                    }
                    lastMonth = dt.getMonth();
                }
            }
        }
        var days = '';
        [['Mon', 0], ['Wed', 2], ['Fri', 4]].forEach(function (p) {
            days += '<text x="0" y="' + (top + p[1] * step + 10) + '" class="rd-dash-heat-lbl">' + p[0] + '</text>';
        });
        var busiest = -1, bv = 0;
        dowCount.forEach(function (v, i) { if (v > bv) { bv = v; busiest = i; } });
        var dn = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        return '<section class="rd-dash-card rd-dash-heat" aria-labelledby="rd-dash-heat-h">' +
            '<div class="rd-dash-card-top"><h2 id="rd-dash-heat-h" class="rd-dash-h">Study activity</h2><span class="rd-dash-fine">Last ' + HEAT_WEEKS + ' weeks</span></div>' +
            '<div class="rd-dash-heat-body"><div class="rd-dash-heat-svg">' +
            '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc('Activity heatmap: ' + active + ' active days in the last ' + HEAT_WEEKS + ' weeks') + '">' +
            months + days + cells + '</svg>' +
            '<div class="rd-dash-heat-key" aria-hidden="true"><span>Less</span><i class="rd-dash-h0"></i><i class="rd-dash-h1"></i><i class="rd-dash-h2"></i><i class="rd-dash-h3"></i><i class="rd-dash-h4"></i><span>More</span></div>' +
            '</div><dl class="rd-dash-heat-stats">' +
            '<div><dt>Active days</dt><dd>' + active + '<span> / ' + total + '</span></dd></div>' +
            '<div><dt>Current streak</dt><dd>' + d.streak + '<span> ' + (d.streak === 1 ? 'day' : 'days') + '</span></dd></div>' +
            '<div><dt>Best streak</dt><dd>' + d.bestStreak + '<span> ' + (d.bestStreak === 1 ? 'day' : 'days') + '</span></dd></div>' +
            '<div><dt>Busiest day</dt><dd class="rd-dash-dd-text">' + (busiest >= 0 ? dn[busiest] : '—') + '</dd></div>' +
            '</dl></div>' +
            '<p class="rd-dash-src">Each square counts questions answered, mock questions and chapters opened that day (Pakistan time).</p>' +
            '</section>';
    }

    function recommendations(d, prefs) {
        var recs = [];
        var cand = Object.keys(d.subj).filter(function (sid) { return d.subj[sid].mk >= 5 && levelOf(sid); })
            .map(function (sid) { var s = d.subj[sid]; return { sid: sid, acc: s.aw / s.mk * 100, q: s.q }; })
            .sort(function (a, b) { return a.acc - b.acc; });
        cand.slice(0, 2).forEach(function (c) {
            if (c.acc >= 85) return;
            var m = subjectMeta(c.sid);
            recs.push({
                icon: ICON.target, act: 'practice:' + c.sid, cta: 'Practise',
                title: 'Practise ' + m.code + ' — ' + (m.shortName || m.name),
                sub: c.acc.toFixed(0) + '% accuracy across ' + plural(c.q, 'question') + '. Your weakest subject' + (recs.length ? ' after the one above.' : '.')
            });
        });
        var mc = mistakeCount();
        if (mc > 0) {
            recs.push({ icon: ICON.redo, act: 'mistakes', cta: 'Review', title: 'Review your mistake book', sub: plural(mc, 'question') + ' still marked wrong. Re-answering them is the quickest way to lift accuracy.' });
        }
        var t = currentTrack();
        var subs = fn('trackSubjects') ? (call('trackSubjects', t) || []) : [];
        var fresh = subs.filter(function (s) { return !d.subj[s.id]; })[0];
        if (fresh && recs.length < 3) {
            recs.push({ icon: ICON.book, act: 'study:' + fresh.id, cta: 'Open', title: 'Start ' + fresh.code + ' — ' + (fresh.shortName || fresh.name), sub: 'Not opened yet. ' + (chapterTotal(fresh.id) ? plural(chapterTotal(fresh.id), 'chapter') + ' in this volume.' : '') });
        }
        if (!prefs.examDate && recs.length < 3) {
            recs.push({ icon: ICON.cal, act: 'prefs', cta: 'Set date', title: 'Add your exam date', sub: 'A countdown helps you pace the remaining chapters.' });
        }
        if (d.mocks === 0 && d.attempted >= 100 && recs.length < 3) {
            recs.push({ icon: ICON.clock, act: 'mocks', cta: 'View', title: 'Sit your first mock exam', sub: 'You have the practice volume. A timed paper shows how it holds up.' });
        }
        if (!recs.length) {
            recs.push({ icon: ICON.target, act: 'practice:', cta: 'Start', title: 'Take a chapter quiz', sub: 'Ten minutes of questions gives this page something to work with.' });
        }
        return recs.slice(0, 3);
    }

    function renderRecs(d, prefs) {
        var recs = recommendations(d, prefs);
        return '<section class="rd-dash-card rd-dash-recs" aria-labelledby="rd-dash-recs-h">' +
            '<div class="rd-dash-card-top"><h2 id="rd-dash-recs-h" class="rd-dash-h">Recommended next</h2></div>' +
            '<ol class="rd-dash-rec-list">' + recs.map(function (r, i) {
                return '<li><button type="button" class="rd-dash-rec" data-rd="' + esc(r.act) + '">' +
                    '<span class="rd-dash-rec-n" aria-hidden="true">' + (i + 1) + '</span>' +
                    '<span class="rd-dash-rec-text"><strong>' + esc(r.title) + '</strong><span>' + esc(r.sub) + '</span></span>' +
                    '<span class="rd-dash-rec-cta">' + esc(r.cta) + ICON.arrow + '</span></button></li>';
            }).join('') + '</ol></section>';
    }

    function relTime(ts) {
        if (!ts) return 'Not started';
        var days = Math.round((keyToDate(todayKey()) - keyToDate(dayKey(ts))) / DAY);
        if (days <= 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return days + ' days ago';
        if (days < 30) return Math.round(days / 7) + ' wk ago';
        return keyToDate(dayKey(ts)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    function renderSubjects(d) {
        var ts = tracks();
        if (!ts.length) return '';
        var cur = state.track && ts.some(function (t) { return t.id === state.track; }) ? state.track : currentTrack();
        if (!ts.some(function (t) { return t.id === cur; })) cur = ts[0].id;
        state.track = cur;
        var active = ts.filter(function (t) { return t.id === cur; })[0];

        var tabs = ts.length > 1 ? '<div class="rd-dash-tabs" role="tablist" aria-label="Qualification track">' + ts.map(function (t) {
            var on = t.id === cur;
            return '<button type="button" role="tab" id="rd-dash-tab-' + t.id + '" aria-controls="rd-dash-subj-panel" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" class="rd-dash-tab' + (on ? ' is-on' : '') + '" data-rd="track:' + t.id + '">' + esc(trackShort(t.id)) + '<span>' + t.subjects.length + '</span></button>';
        }).join('') + '</div>' : '';

        var rows = active.subjects.map(function (s) {
            var st = d.subj[s.id] || { q: 0, mk: 0, aw: 0, last: 0 };
            var total = chapterTotal(s.id);
            var done = st.done || 0;
            var pct = total ? Math.round(done / total * 100) : 0;
            var acc = st.mk ? Math.round(st.aw / st.mk * 100) + '%' : '—';
            return '<li class="rd-dash-subj">' +
                '<div class="rd-dash-subj-id"><span class="rd-dash-code">' + esc(s.code) + '</span>' +
                '<span class="rd-dash-subj-name">' + esc(s.name) + '</span></div>' +
                '<div class="rd-dash-subj-prog"><div class="rd-dash-bar" role="progressbar" aria-label="' + esc(s.code + ' chapters covered') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
                '<span class="rd-dash-subj-pct">' + done + '/' + (total || '–') + ' ch</span></div>' +
                '<div class="rd-dash-subj-meta"><span><small>Accuracy</small>' + acc + '</span><span><small>Last</small>' + esc(relTime(st.last)) + '</span></div>' +
                '<div class="rd-dash-subj-act">' +
                '<button type="button" class="rd-dash-btn rd-dash-btn-sm rd-dash-btn-soft" data-rd="study:' + esc(s.id) + '" aria-label="' + esc('Continue learning ' + s.code + ' ' + s.name) + '">' + (st.last ? 'Continue' : 'Start') + '</button>' +
                '<button type="button" class="rd-dash-btn rd-dash-btn-sm rd-dash-btn-ghost" data-rd="practice:' + esc(s.id) + '" aria-label="' + esc('Practise MCQs for ' + s.code) + '">MCQs</button>' +
                (hasPdf(s.id) ? '<button type="button" class="rd-dash-btn rd-dash-btn-sm rd-dash-btn-text" data-rd="pdf:' + esc(s.id) + '" aria-label="' + esc('Open the ' + s.code + ' PDF') + '">PDF</button>' : '') +
                '</div></li>';
        }).join('');

        return '<section class="rd-dash-card rd-dash-subjects" aria-labelledby="rd-dash-subj-h">' +
            '<div class="rd-dash-card-top"><div><h2 id="rd-dash-subj-h" class="rd-dash-h">Subjects</h2>' +
            '<p class="rd-dash-fine">' + esc(active.label) + ' · chapters covered from quizzes, mind maps and study texts</p></div>' + tabs + '</div>' +
            '<ul class="rd-dash-subj-list" id="rd-dash-subj-panel" role="tabpanel" aria-labelledby="rd-dash-tab-' + cur + '">' + rows + '</ul></section>';
    }

    function badges(d) {
        var closed = 0;
        Object.keys(d.subj).forEach(function (sid) { var s = d.subj[sid]; if (s.total && s.done >= s.total) closed++; });
        var accOk = d.attempted >= 50 ? d.accuracy : 0;
        return [
            { g: 'q', n: 'First Entry', h: 'Answer 10 questions', v: d.attempted, t: 10 },
            { g: 'h', n: 'Century', h: 'Answer 100 questions', v: d.attempted, t: 100 },
            { g: 'm', n: 'Marathon', h: 'Answer 500 questions', v: d.attempted, t: 500 },
            { g: 'f', n: 'Three in a Row', h: 'Study 3 days running', v: d.bestStreak, t: 3 },
            { g: 'w', n: 'Week Balanced', h: 'Study 7 days running', v: d.bestStreak, t: 7 },
            { g: 'e', n: 'Sharp Eye', h: '80% accuracy over 50+ questions', v: d.attempted >= 50 ? accOk : Math.min(d.attempted, 50) / 50 * 79, t: 80, pctOnly: true },
            { g: 't', n: 'Mock Debut', h: 'Complete a mock exam', v: d.mocks, t: 1 },
            { g: 'c', n: 'Five Chapters', h: 'Cover 5 topics', v: d.topics, t: 5 },
            { g: 'r', n: 'Mock Regular', h: 'Complete 5 mock exams', v: d.mocks, t: 5 },
            { g: 's', n: 'Closed Book', h: 'Cover every chapter of a subject', v: closed, t: 1 }
        ];
    }

    function renderBadges(d) {
        var list = badges(d);
        var got = list.filter(function (b) { return b.v >= b.t; }).length;
        return '<section class="rd-dash-card rd-dash-badges" aria-labelledby="rd-dash-badge-h">' +
            '<div class="rd-dash-card-top"><h2 id="rd-dash-badge-h" class="rd-dash-h">Badges</h2><span class="rd-dash-fine"><strong>' + got + '</strong> of ' + list.length + ' earned</span></div>' +
            '<ul class="rd-dash-badge-strip">' + list.map(function (b) {
                var ok = b.v >= b.t;
                var pct = Math.max(0, Math.min(1, b.v / b.t));
                var prog = ok ? 'Earned' : (b.pctOnly ? (d.attempted >= 50 ? d.accuracy.toFixed(0) + '% of 80%' : d.attempted + ' of 50 Qs') : fmt(Math.floor(b.v)) + ' / ' + b.t);
                return '<li class="rd-dash-badge' + (ok ? ' is-on' : '') + '" aria-label="' + esc(b.n + ': ' + b.h + '. ' + (ok ? 'Earned' : 'Locked, ' + prog)) + '">' +
                    '<span class="rd-dash-badge-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + GLYPH[b.g] + '</svg>' +
                    (ok ? '' : '<span class="rd-dash-badge-lock">' + ICON.lock + '</span>') + '</span>' +
                    '<span class="rd-dash-badge-n">' + esc(b.n) + '</span>' +
                    '<span class="rd-dash-badge-h">' + esc(b.h) + '</span>' +
                    (ok ? '<span class="rd-dash-badge-p is-on">' + ICON.check + 'Earned</span>' :
                        '<span class="rd-dash-mini" aria-hidden="true"><span style="width:' + (pct * 100).toFixed(0) + '%"></span></span><span class="rd-dash-badge-p">' + esc(prog) + '</span>') +
                    '</li>';
            }).join('') + '</ul></section>';
    }

    /* ------------------------------------------------------------ dialog */
    function ensureDialog() {
        var dlg = document.getElementById('rd-dash-dialog');
        if (dlg) return dlg;
        dlg = document.createElement('dialog');
        dlg.id = 'rd-dash-dialog';
        dlg.className = 'rd-dash-dialog';
        dlg.setAttribute('aria-labelledby', 'rd-dash-dialog-h');
        dlg.innerHTML = '<form method="dialog" class="rd-dash-form">' +
            '<h2 id="rd-dash-dialog-h">Daily goal &amp; exam date</h2>' +
            '<p class="rd-dash-fine">Saved on this device only.</p>' +
            '<label for="rd-dash-in-goal">Questions per day</label>' +
            '<input id="rd-dash-in-goal" type="number" inputmode="numeric" min="5" max="500" step="5" required>' +
            '<div class="rd-dash-chips" role="group" aria-label="Quick goal presets">' +
            [20, 30, 50, 80].map(function (n) { return '<button type="button" class="rd-dash-chip" data-goal="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
            '<label for="rd-dash-in-date">Exam date</label>' +
            '<input id="rd-dash-in-date" type="date">' +
            '<div class="rd-dash-form-actions">' +
            '<button type="button" class="rd-dash-btn rd-dash-btn-text" data-act="clear">Clear date</button>' +
            '<span></span>' +
            '<button type="button" class="rd-dash-btn rd-dash-btn-ghost rd-dash-btn-sm" data-act="cancel">Cancel</button>' +
            '<button type="submit" class="rd-dash-btn rd-dash-btn-primary rd-dash-btn-sm" data-act="save">Save</button>' +
            '</div></form>';
        document.body.appendChild(dlg);
        var goal = dlg.querySelector('#rd-dash-in-goal');
        var date = dlg.querySelector('#rd-dash-in-date');
        dlg.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('button') : null;
            if (e.target === dlg) { dlg.close(); return; }
            if (!b) return;
            if (b.getAttribute('data-goal')) { goal.value = b.getAttribute('data-goal'); goal.focus(); }
            var act = b.getAttribute('data-act');
            if (act === 'cancel') dlg.close();
            if (act === 'clear') { date.value = ''; }
        });
        dlg.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            var g = parseInt(goal.value, 10);
            if (!(g >= 1)) { goal.focus(); return; }
            setPrefs({ dailyGoal: Math.min(500, g), examDate: date.value || null });
            dlg.close();
            render();
        });
        dlg.addEventListener('close', function () {
            var back = document.querySelector('#view-dashboard [data-rd="prefs"]');
            if (back) try { back.focus(); } catch (e) { /* */ }
        });
        return dlg;
    }
    function openPrefs() {
        var dlg = ensureDialog();
        var p = getPrefs();
        dlg.querySelector('#rd-dash-in-goal').value = p.dailyGoal;
        dlg.querySelector('#rd-dash-in-date').value = p.examDate || '';
        if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
        dlg.querySelector('#rd-dash-in-goal').focus();
    }

    /* ------------------------------------------------------------ render + events */
    var lastCont = null;
    function render() {
        var sec = document.getElementById('view-dashboard');
        if (!sec) return;
        var root = sec.querySelector(':scope > .rd-dash');
        if (!root) {
            root = document.createElement('div');
            root.className = 'rd-dash';
            sec.insertBefore(root, sec.firstChild);
            root.addEventListener('click', onClick);
            root.addEventListener('keydown', onKey);
        }
        var d = collect();
        var prefs = getPrefs();
        var head = renderHead(d, prefs);
        lastCont = head.cont;
        var focusKey = null;
        var ae = document.activeElement;
        if (ae && root.contains(ae)) focusKey = ae.getAttribute('data-rd');

        root.innerHTML = head.html + renderHero(d, prefs) + renderKpis(d) +
            '<div class="rd-dash-split">' + renderHeat(d) + renderRecs(d, prefs) + '</div>' +
            renderSubjects(d) + renderBadges(d);
        sec.classList.add('rd-dash-on');
        if (focusKey) {
            var again = root.querySelector('[data-rd="' + focusKey.replace(/"/g, '') + '"]');
            if (again) try { again.focus(); } catch (e) { /* */ }
        }
    }
    function schedule() {
        if (state.pending) return;
        state.pending = true;
        setTimeout(function () {
            state.pending = false;
            try { render(); } catch (e) { fail(e); }
        }, 30);
    }
    function onClick(e) {
        var b = e.target.closest ? e.target.closest('[data-rd]') : null;
        if (!b) return;
        var a = b.getAttribute('data-rd');
        var i = a.indexOf(':');
        var kind = i < 0 ? a : a.slice(0, i), arg = i < 0 ? '' : a.slice(i + 1);
        if (kind === 'continue' && lastCont) lastCont.run();
        else if (kind === 'study-start') { call('applyTrackSwitch', currentTrack()); call('switchView', 'study'); }
        else if (kind === 'practice') goPractice(arg || '');
        else if (kind === 'study') goStudy(arg);
        else if (kind === 'pdf') openPdf(arg);
        else if (kind === 'mistakes') call('switchView', 'mistakes');
        else if (kind === 'mocks') call('switchView', 'mockexams');
        else if (kind === 'prefs') openPrefs();
        else if (kind === 'track') {
            state.track = arg;
            render();
            var t = document.getElementById('rd-dash-tab-' + arg);
            if (t) t.focus();
        }
    }
    function onKey(e) {
        var t = e.target;
        if (!t || !t.classList || !t.classList.contains('rd-dash-tab')) return;
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var tabs = Array.prototype.slice.call(t.parentNode.querySelectorAll('.rd-dash-tab'));
        var i = tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
        if (i < 0) i = tabs.length - 1;
        if (i >= tabs.length) i = 0;
        e.preventDefault();
        tabs[i].click();
    }

    function wrap(name, before) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig.__rdDash) return;
        var w = function () {
            if (before) try { before(); } catch (e) { /* */ }
            var r = orig.apply(this, arguments);
            schedule();
            return r;
        };
        w.__rdDash = true;
        w.__rdDashOrig = orig;
        window[name] = w;
    }

    function fail(e) {
        try { console.warn('[rd-dash] disabled, original dashboard kept', e); } catch (x) { /* */ }
        var sec = document.getElementById('view-dashboard');
        if (sec) {
            sec.classList.remove('rd-dash-on');
            var r = sec.querySelector(':scope > .rd-dash');
            if (r) r.parentNode.removeChild(r);
        }
    }

    function init() {
        try {
            if (!document.getElementById('view-dashboard')) return;
            render();
            wrap('renderRealStats');
            wrap('renderProfileUI');
            wrap('applyTrackSwitch', function () { state.track = null; });
            window.addEventListener('storage', function (e) {
                if (!e.key || /^(pc_sessions|prc_mock_exam_history|nsa_study_log|nsa_profile|nsa_rd_prefs|nsa_level_pref)$/.test(e.key)) schedule();
            });
            /* Re-check after the app's own boot work and when the day rolls over. */
            setTimeout(schedule, 1500);
            setTimeout(schedule, 5000);
            setInterval(function () { if (document.visibilityState === 'visible') schedule(); }, 10 * 60 * 1000);
            document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') schedule(); });
        } catch (e) { fail(e); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

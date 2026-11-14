/* =====================================================================
 * rd-prac — Practice Center + Mock Exams redesign (runtime enhancement)
 *
 * The app keeps all of its own logic: scoring, storage (pc_sessions,
 * prc_mock_exam_history), timers and navigation stay in index.html. This
 * module wraps the app's render functions, lets each one run first, then
 * re-lays out the result. Every action calls the app's own global handler
 * (startPracticeQuiz, selectQuizOption, startMockExam, submitMockExam ...).
 *
 * Wrapped globals:
 *   renderPracticeSubjectTabs, renderPracticeChapterGrid, startPracticeQuiz,
 *   renderQuizPlayer, finishQuizSession, renderMockExamsPortal,
 *   renderMockExamPlayer, renderCurrentMockQuestion, updateMockExamPalette,
 *   updateMockExamTimerDisplay, submitMockExam
 * If anything throws, the original markup the app just rendered is left as is.
 * ===================================================================== */
(function () {
    'use strict';

    var P = 'rd-prac';
    var PREF_KEY = 'rd_prac_prefs';
    var flagStore = (typeof WeakMap === 'function') ? new WeakMap() : null;
    var pendingSubset = null;       /* question ids for "retry the ones you missed" */
    var lastPracticeResult = null;  /* snapshot for the results / review screens */
    var lastMockResult = null;

    /* ---------------------------------------------------------- helpers */
    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function fn(name) { return typeof window[name] === 'function' ? window[name] : null; }
    function qs() { try { return (typeof currentQuizState !== 'undefined') ? currentQuizState : null; } catch (e) { return null; } }
    function mock() { try { return (typeof currentMockExam !== 'undefined') ? currentMockExam : null; } catch (e) { return null; } }
    function view() { try { return (typeof currentView !== 'undefined') ? currentView : ''; } catch (e) { return ''; } }
    function subjects() { try { return (typeof mmSubjectsList !== 'undefined' && mmSubjectsList) ? mmSubjectsList : []; } catch (e) { return []; } }
    function chaptersOf(sid) { try { return (typeof mmDataStore !== 'undefined' && mmDataStore[sid]) ? mmDataStore[sid] : []; } catch (e) { return []; } }
    function bankOf(sid) { try { return (typeof practiceDataStore !== 'undefined' && practiceDataStore[sid]) ? practiceDataStore[sid] : {}; } catch (e) { return {}; } }
    function subjectById(sid) { return subjects().filter(function (s) { return s.id === sid; })[0] || null; }
    function readJSON(key, dflt) {
        try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? dflt : v; } catch (e) { return dflt; }
    }
    function prefs() {
        var p = readJSON(PREF_KEY, {});
        return { count: p.count || 'all', order: p.order || 'book', sort: p.sort || 'book' };
    }
    function setPref(k, v) {
        var p = prefs(); p[k] = v;
        try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* per-viewer convenience only */ }
    }
    function pctColorClass(p) { return p == null ? '' : (p >= 70 ? ' is-good' : (p >= 50 ? ' is-mid' : ' is-weak')); }
    function fmtClock(sec) {
        sec = Math.max(0, Math.round(sec));
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        var mm = (h ? String(m).padStart(2, '0') : String(m)), ss = String(s).padStart(2, '0');
        return h ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
    }
    function fmtDur(sec) {
        sec = Math.max(0, Math.round(sec));
        var m = Math.floor(sec / 60), s = sec % 60;
        return m ? (m + 'm ' + String(s).padStart(2, '0') + 's') : (s + 's');
    }
    function fmtDate(iso) {
        var d = new Date(iso);
        if (isNaN(d)) return String(iso || '');
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
    function answered(a) { return a !== null && a !== undefined && (!Array.isArray(a) || a.length > 0); }
    function isMultiQ(q) { return q && (q.type === 'multiple' || Array.isArray(q.correct)); }
    function fullMatch(q, a) {
        if (!answered(a)) return false;
        if (Array.isArray(q.correct) && Array.isArray(a)) {
            return q.correct.length === a.length && q.correct.every(function (v) { return a.indexOf(v) !== -1; });
        }
        return a === q.correct;
    }
    function qState(q, a) { return !answered(a) ? 'skip' : (fullMatch(q, a) ? 'ok' : 'bad'); }
    function letter(i) { return String.fromCharCode(65 + i); }
    function parseArgs(onclick) {
        var m = /\(\s*'([^']*)'\s*(?:,\s*'([^']*)')?/.exec(onclick || '');
        return m ? [m[1], m[2]] : [];
    }

    var ICON = {
        check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
        cross: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
        flag: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
        left: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
        right: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
        clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
        play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
        kl: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
        kr: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
        retry: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
    };

    /* ------------------------------------------------- performance data
     * Read from pc_sessions, the same per-session records the app writes in
     * practiceCentrePersistSession() (questions[i] lines up with results[i]). */
    function sessionsFor(sid) {
        var all = readJSON('pc_sessions', []);
        if (!Array.isArray(all)) return [];
        return all.filter(function (s) { return s && s.subjectId === sid; });
    }
    function chapterStats(sid) {
        var map = {};
        sessionsFor(sid).forEach(function (s) {
            var qsArr = Array.isArray(s.questions) ? s.questions : [];
            var rs = Array.isArray(s.results) ? s.results : [];
            var seen = {};
            function add(ch, aw, mx) {
                if (!ch) return;
                var c = map[ch] || (map[ch] = { awarded: 0, marks: 0, sets: 0, last: null, answered: 0 });
                c.awarded += +aw || 0; c.marks += +mx || 0; c.answered += 1;
                if (!seen[ch]) { seen[ch] = 1; c.sets += 1; }
                var t = s.finishedAt || s.startedAt;
                if (t && (!c.last || t > c.last)) c.last = t;
            }
            if (rs.length && rs.length === qsArr.length) {
                rs.forEach(function (r, i) {
                    if (r && r.answered === false) return;
                    add(qsArr[i] && qsArr[i].chapter, r.awarded, r.maxMarks || 1);
                });
            } else if (qsArr.length && s.totals) {
                add(qsArr[0].chapter, s.totals.awarded, s.totals.marks);
            }
        });
        Object.keys(map).forEach(function (k) {
            var c = map[k]; c.pct = c.marks ? Math.round(c.awarded / c.marks * 100) : null;
        });
        return map;
    }
    function subjectStats(sid) {
        var cs = chapterStats(sid), aw = 0, mx = 0, n = 0, chs = 0;
        Object.keys(cs).forEach(function (k) { aw += cs[k].awarded; mx += cs[k].marks; n += cs[k].answered; chs += 1; });
        return { pct: mx ? Math.round(aw / mx * 100) : null, answered: n, chapters: chs };
    }
    function chapterHistory(sid, chId) {
        return sessionsFor(sid).filter(function (s) {
            return s.totals && s.totals.marks && Array.isArray(s.questions) && s.questions.length &&
                s.questions[0].chapter === chId && /^qz-/.test(s.sessionId || '');
        }).map(function (s) {
            return { at: s.finishedAt || s.startedAt, pct: Math.round(s.totals.awarded / s.totals.marks * 100) };
        });
    }
    var chapterIndexCache = null;
    function findChapter(chId) {
        if (!chId) return null;
        if (!chapterIndexCache) {
            chapterIndexCache = {};
            try {
                Object.keys(mmDataStore).forEach(function (sid) {
                    (mmDataStore[sid] || []).forEach(function (ch) {
                        if (ch && ch.id && !chapterIndexCache[ch.id]) chapterIndexCache[ch.id] = { subjectId: sid, ch: ch };
                    });
                });
            } catch (e) { /* no chapter table */ }
        }
        return chapterIndexCache[chId] || null;
    }

    /* Jump from anywhere into a chapter quiz, the way the app's own dashboard
     * shortcuts do it (track switch, level, subject, view). */
    function practiseChapter(sid, chId) {
        try {
            var lvl = fn('planLevelOf') ? planLevelOf(sid) : null;
            if (lvl && fn('applyTrackSwitch')) applyTrackSwitch(lvl);
            if (view() !== 'practice' && fn('switchView')) switchView('practice');
            if (lvl && fn('switchPracticeLevel')) switchPracticeLevel(lvl);
            if (fn('switchPracticeSubject')) switchPracticeSubject(sid);
            if (chId && fn('startPracticeQuiz')) startPracticeQuiz(sid, chId);
            var main = document.querySelector('.content-area') || document.scrollingElement;
            if (main) main.scrollTop = 0;
        } catch (e) { console.error('[rd-prac] practise jump failed', e); }
    }

    function mockFocus(on) {
        var v = $('view-mockexams'); if (v) v.classList.toggle(P + '-focusmode', !!on);
    }
    function focusMode(on) {
        var v = $('view-practice'); if (v) v.classList.toggle(P + '-focusmode', !!on);
    }
    function toTop() {
        try { toTop(); window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    }

    function bar(p, label) {
        var w = p == null || p <= 0 ? 0 : Math.max(2, Math.min(100, p));
        return '<span class="' + P + '-bar' + pctColorClass(p) + '" role="img" aria-label="' + esc(label || ((p == null ? 'No data' : p + '%'))) + '"><span style="width:' + w + '%"></span></span>';
    }

    function seg(group, label, options, current) {
        return '<div class="' + P + '-field"><span class="' + P + '-field-label" id="' + P + '-lbl-' + group + '">' + esc(label) + '</span>' +
            '<div class="' + P + '-seg" role="radiogroup" aria-labelledby="' + P + '-lbl-' + group + '">' +
            options.map(function (o) {
                var on = String(o[0]) === String(current);
                return '<button type="button" role="radio" aria-checked="' + on + '" class="' + P + '-seg-btn' + (on ? ' is-on' : '') +
                    '" data-pref="' + group + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + '</button>';
            }).join('') + '</div></div>';
    }

    /* ==================================================================
     * 1. PRACTICE LANDING
     * ================================================================== */
    function enhanceSubjectTabs() {
        var box = $('practice-subject-tabs');
        if (!box) return;
        box.classList.add(P + '-subtabs');
        box.querySelectorAll('.mm-subj-btn').forEach(function (b) {
            var sid = parseArgs(b.getAttribute('onclick'))[0];
            if (!sid || b.querySelector('.' + P + '-subacc')) return;
            var st = subjectStats(sid);
            if (st.pct == null) return;
            var s = document.createElement('span');
            s.className = P + '-subacc' + pctColorClass(st.pct);
            s.textContent = st.pct + '%';
            s.setAttribute('aria-label', 'Your accuracy ' + st.pct + ' percent');
            b.appendChild(s);
        });
    }

    function enhanceChapterGrid(subjectId) {
        var host = $('practice-main-container');
        if (!host) return;
        focusMode(false);
        var subj = subjectById(subjectId);
        var chapters = chaptersOf(subjectId);
        if (!subj || !chapters.length) return;

        /* harvest the app's own action buttons, grouped by chapter */
        var actions = {};
        host.querySelectorAll('button[onclick]').forEach(function (b) {
            var oc = b.getAttribute('onclick') || '';
            var args = parseArgs(oc);
            if (!args[1]) return;
            var kind = /startPracticeQuiz/.test(oc) ? 'mcq' : /startLongFormPractice/.test(oc) ? 'long' : /openCaf2Exam/.test(oc) ? 'exam' : 'other';
            (actions[args[1]] = actions[args[1]] || []).push({ el: b, kind: kind, text: b.textContent.replace(/\s+/g, ' ').replace(/^>\s*/, '').trim() });
        });
        if (!Object.keys(actions).length) return;
        var introP = host.querySelector('p');
        var introHtml = introP ? introP.innerHTML : '';

        var bank = bankOf(subjectId);
        var stats = chapterStats(subjectId);
        var sStats = subjectStats(subjectId);
        var pf = prefs();
        var totalQ = 0;
        chapters.forEach(function (ch) { totalQ += (bank[ch.id] || []).length; });

        var rows = chapters.map(function (ch, i) { return { ch: ch, i: i, st: stats[ch.id] || null }; });
        if (pf.sort === 'weak') {
            rows.sort(function (a, b) {
                var ap = a.st ? a.st.pct : 999, bp = b.st ? b.st.pct : 999;
                return ap - bp || a.i - b.i;
            });
        }
        var weakest = rows.filter(function (r) { return r.st && r.st.pct != null; })
            .sort(function (a, b) { return a.st.pct - b.st.pct; })[0];
        var nextNew = rows.filter(function (r) { return !r.st; }).sort(function (a, b) { return a.i - b.i; })[0];

        var focus = '';
        if (weakest && weakest.st.pct < 70) {
            focus = '<div class="' + P + '-focus"><div><span class="' + P + '-focus-k">Focus next</span>' +
                '<span class="' + P + '-focus-t">Chapter ' + esc(weakest.ch.chapterNumber) + ' &middot; ' + esc(weakest.ch.title) + '</span>' +
                '<span class="' + P + '-focus-m">' + weakest.st.pct + '% across ' + weakest.st.sets + ' set' + (weakest.st.sets === 1 ? '' : 's') + ' &mdash; your lowest in ' + esc(subj.code) + '</span></div>' +
                '<button type="button" class="' + P + '-btn" data-act="start" data-ch="' + esc(weakest.ch.id) + '">Practise this chapter</button></div>';
        } else if (!sStats.answered && nextNew) {
            focus = '<div class="' + P + '-focus is-new"><div><span class="' + P + '-focus-k">Start here</span>' +
                '<span class="' + P + '-focus-t">Chapter ' + esc(nextNew.ch.chapterNumber) + ' &middot; ' + esc(nextNew.ch.title) + '</span>' +
                '<span class="' + P + '-focus-m">Your accuracy appears against each chapter once you finish a set.</span></div>' +
                '<button type="button" class="' + P + '-btn" data-act="start" data-ch="' + esc(nextNew.ch.id) + '">Begin chapter ' + esc(nextNew.ch.chapterNumber) + '</button></div>';
        }

        var list = rows.map(function (r) {
            var ch = r.ch, st = r.st, n = (bank[ch.id] || []).length;
            var acts = actions[ch.id] || [];
            var extras = acts.filter(function (a) { return a.kind === 'long' || a.kind === 'exam'; }).map(function (a) {
                return a.kind === 'long' ? 'Long-form set' : 'Exam paper';
            });
            var accHtml = st && st.pct != null
                ? '<span class="' + P + '-ch-pct' + pctColorClass(st.pct) + '">' + st.pct + '%</span>' + bar(st.pct, 'Accuracy ' + st.pct + ' percent') +
                  '<span class="' + P + '-ch-sets">' + st.sets + ' set' + (st.sets === 1 ? '' : 's') + ' &middot; ' + esc(fmtDate(st.last)) + '</span>'
                : '<span class="' + P + '-ch-none">Not practised</span>';
            return '<li class="' + P + '-ch" data-ch="' + esc(ch.id) + '">' +
                '<span class="' + P + '-ch-num" aria-hidden="true">' + String(ch.chapterNumber).padStart(2, '0') + '</span>' +
                '<div class="' + P + '-ch-main"><h3 class="' + P + '-ch-title">' + esc(ch.title) + '</h3>' +
                '<div class="' + P + '-ch-meta"><span>Chapter ' + esc(ch.chapterNumber) + '</span>' +
                (ch.pages ? '<span>pp. ' + esc(String(ch.pages).replace(/\s*to\s*/i, '–')) + '</span>' : '') +
                '<span class="' + P + '-num">' + (n || 1) + ' MCQs</span>' +
                extras.map(function (x) { return '<span class="' + P + '-tag">' + x + '</span>'; }).join('') +
                '</div></div>' +
                '<div class="' + P + '-ch-acc">' + accHtml + '</div>' +
                '<div class="' + P + '-ch-act" data-slot="' + esc(ch.id) + '"></div>' +
                '</li>';
        }).join('');

        var html =
            '<div class="' + P + '-land">' +
            '<header class="' + P + '-head">' +
            '<div class="' + P + '-head-l"><div class="' + P + '-eyebrow">' + esc(subj.code) + ' &middot; ' + esc(subj.name) + '</div>' +
            '<h2 class="' + P + '-h2">Chapter practice</h2>' +
            '<p class="' + P + '-lede">Pick a chapter. Each answer is marked straight away, with the working, an examiner tip and a Roman Urdu explanation.</p></div>' +
            '<dl class="' + P + '-kpis">' +
            '<div><dt>Your accuracy</dt><dd class="' + P + '-num' + pctColorClass(sStats.pct) + '">' + (sStats.pct == null ? '&mdash;' : sStats.pct + '%') + '</dd></div>' +
            '<div><dt>Chapters practised</dt><dd class="' + P + '-num">' + sStats.chapters + '<small>/' + chapters.length + '</small></dd></div>' +
            '<div><dt>Questions answered</dt><dd class="' + P + '-num">' + sStats.answered + '<small>/' + totalQ + '</small></dd></div>' +
            '</dl></header>' +
            '<div class="' + P + '-setup" aria-label="Set options">' +
            seg('count', 'Questions per set', [['10', '10'], ['20', '20'], ['all', 'All']], pf.count) +
            seg('order', 'Order', [['book', 'As in book'], ['shuffle', 'Shuffled']], pf.order) +
            seg('sort', 'List chapters', [['book', 'Book order'], ['weak', 'Weakest first']], pf.sort) +
            '</div>' +
            focus +
            '<ol class="' + P + '-chlist" aria-label="Chapters">' + list + '</ol>' +
            (introHtml ? '<details class="' + P + '-about"><summary>About these questions</summary><p>' + introHtml + '</p></details>' : '') +
            '</div>';

        var frag = document.createElement('div');
        frag.innerHTML = html;
        /* move the app's own buttons (with their inline handlers) into the rows */
        Object.keys(actions).forEach(function (chId) {
            var slot = frag.querySelector('[data-slot="' + (window.CSS && CSS.escape ? CSS.escape(chId) : chId) + '"]');
            if (!slot) return;
            actions[chId].sort(function (a, b) {
                var o = { mcq: 0, long: 1, exam: 2, other: 3 }; return o[a.kind] - o[b.kind];
            }).forEach(function (a, idx) {
                var b = a.el;
                b.removeAttribute('style');
                b.className = P + '-btn' + (idx === 0 ? '' : ' ' + P + '-btn--ghost');
                b.setAttribute('aria-label', a.text);
                b.setAttribute('title', a.text);
                b.textContent = a.kind === 'mcq' ? 'Practise' : a.kind === 'long' ? 'Long-form' : a.kind === 'exam' ? 'Exam paper' : a.text;
                if (a.kind === 'mcq' && actions[chId].length > 1 && idx !== 0) b.textContent = 'MCQs';
                slot.appendChild(b);
            });
        });
        host.innerHTML = '';
        host.appendChild(frag.firstChild);
    }

    function onLandingClick(e) {
        var t = e.target.closest('[data-pref],[data-act="start"]');
        if (!t || !t.closest('.' + P + '-land')) return;
        var sid = (typeof currentPracticeSubjectId !== 'undefined') ? currentPracticeSubjectId : '';
        if (t.hasAttribute('data-pref')) {
            setPref(t.getAttribute('data-pref'), t.getAttribute('data-val'));
            var y = (document.querySelector('.content-area') || {}).scrollTop;
            if (sid && fn('renderPracticeChapterGrid')) renderPracticeChapterGrid(sid);
            var again = document.querySelector('[data-pref="' + t.getAttribute('data-pref') + '"][data-val="' + t.getAttribute('data-val') + '"]');
            if (again) again.focus();
            var mc = document.querySelector('.content-area'); if (mc && y != null) mc.scrollTop = y;
        } else if (sid && fn('startPracticeQuiz')) {
            startPracticeQuiz(sid, t.getAttribute('data-ch'));
        }
    }

    /* ==================================================================
     * 2. PRACTICE QUIZ PLAYER
     * ================================================================== */
    function flagsFor(state) {
        if (!state) return {};
        if (flagStore) { var f = flagStore.get(state); if (!f) { f = {}; flagStore.set(state, f); } return f; }
        return state.__rdFlags || (state.__rdFlags = {});
    }

    /* Applies the "questions per set" and "order" preferences (or a retry
     * subset) to the set the app just built, before anything is answered. */
    function shapeQuizSet(chapterId) {
        var S = qs();
        if (!S || S.chapterId !== chapterId || !Array.isArray(S.questions)) return false;
        var list = S.questions.slice(), changed = false;
        if (pendingSubset && pendingSubset.chapterId === chapterId) {
            var ids = pendingSubset.ids;
            var sub = list.filter(function (q) { return ids.indexOf(q.id) !== -1; });
            if (sub.length) { list = sub; changed = true; }
        } else {
            var pf = prefs();
            if (pf.order === 'shuffle') {
                for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
                changed = true;
            }
            var n = parseInt(pf.count, 10);
            if (n && list.length > n) { list = list.slice(0, n); changed = true; }
        }
        pendingSubset = null;
        if (!changed) return false;
        S.questions = list;
        S.currentIndex = 0;
        S.userAnswers = new Array(list.length).fill(null);
        S.submittedInSession = {};
        return true;
    }

    function renderQuiz() {
        var host = $('practice-main-container');
        var S = qs();
        if (!host || !S || !S.questions || !S.questions.length) return;
        var idx = S.currentIndex, total = S.questions.length, q = S.questions[idx];
        if (!q) return;
        var subj = subjectById(S.subjectId) || { code: 'Practice', name: '' };
        var ans = S.userAnswers[idx];
        var multi = isMultiQ(q), tf = q.type === 'true_false';
        if (!S.submittedInSession) S.submittedInSession = {};
        var done = !!S.submittedInSession[idx] || (ans !== null && ans !== undefined && !multi);
        var picks = Array.isArray(ans) ? ans : [];
        var flags = flagsFor(S);
        var nAnswered = 0, nOk = 0;
        S.questions.forEach(function (qq, i) {
            var a = S.userAnswers[i];
            var sub = isMultiQ(qq) ? !!S.submittedInSession[i] : answered(a);
            if (sub) { nAnswered++; if (fullMatch(qq, a)) nOk++; }
        });

        var opts = q.options.map(function (opt, i) {
            var cls = P + '-opt', mark = '', state = '';
            if (multi) {
                var on = picks.indexOf(i) !== -1;
                if (done) {
                    var isC = Array.isArray(q.correct) && q.correct.indexOf(i) !== -1;
                    if (isC) { cls += ' is-correct'; mark = ICON.check; state = on ? 'Correct, your choice' : 'Correct answer'; }
                    else if (on) { cls += ' is-wrong'; mark = ICON.cross; state = 'Incorrect, your choice'; }
                    else cls += ' is-dim';
                } else if (on) { cls += ' is-picked'; state = 'Selected'; }
            } else if (done) {
                if (i === q.correct) { cls += ' is-correct'; mark = ICON.check; state = i === ans ? 'Correct, your choice' : 'Correct answer'; }
                else if (i === ans) { cls += ' is-wrong'; mark = ICON.cross; state = 'Incorrect, your choice'; }
                else cls += ' is-dim';
            }
            var handler = multi ? 'toggleQuizMultiOption(' + i + ')' : 'selectQuizOption(' + i + ')';
            return '<li><button type="button" class="' + cls + '" data-rd-key="opt' + i + '"' + (done ? ' aria-disabled="true"' : ' onclick="' + handler + '"') +
                (multi ? ' role="checkbox" aria-checked="' + (picks.indexOf(i) !== -1) + '"' : '') + '>' +
                '<span class="' + P + '-key" aria-hidden="true">' + letter(i) + '</span>' +
                '<span class="' + P + '-opt-t"><span class="' + P + '-sr">Option ' + letter(i) + ': </span>' + opt + '</span>' +
                '<span class="' + P + '-opt-m">' + mark + (state ? '<span class="' + P + '-sr"> (' + state + ')</span>' : '') + '</span>' +
                '</button></li>';
        }).join('');

        var feedback = '';
        if (done) {
            var ok = fullMatch(q, ans);
            var right = Array.isArray(q.correct) ? q.correct.map(letter).join(' and ') : letter(q.correct);
            var icap = S.subjectId && (S.subjectId.indexOf('caf') === 0 || S.subjectId.indexOf('prc') === 0);
            feedback = '<section class="' + P + '-fb ' + (ok ? 'is-ok' : 'is-bad') + '" aria-live="polite">' +
                '<div class="' + P + '-fb-v">' + (ok ? ICON.check + '<span><strong>Correct.</strong></span>' : ICON.cross + '<span><strong>Not quite.</strong> The answer is ' + right + '.</span>') + '</div>' +
                '<div class="' + P + '-fb-b"><h4>Working</h4><div class="' + P + '-fb-txt">' + (q.working || q.explanation || '') + '</div></div>' +
                (q.examTip ? '<div class="' + P + '-fb-b ' + P + '-fb-tip"><h4>' + (icap ? 'ICAP examiner tip' : 'ACCA examiner tip') + '</h4><div class="' + P + '-fb-txt">' + q.examTip + '</div></div>' : '') +
                (q.romanUrdu ? '<div class="' + P + '-fb-b"><h4>Roman Urdu</h4><div class="' + P + '-fb-txt ' + P + '-muted">' + q.romanUrdu + '</div></div>' : '') +
                '</section>';
        }

        var map = S.questions.map(function (qq, i) {
            var a = S.userAnswers[i];
            var sub = isMultiQ(qq) ? !!S.submittedInSession[i] : answered(a);
            var st = sub ? (fullMatch(qq, a) ? 'ok' : 'bad') : 'todo';
            var lab = 'Question ' + (i + 1) + (st === 'ok' ? ', correct' : st === 'bad' ? ', incorrect' : ', not answered') + (flags[i] ? ', flagged' : '');
            return '<button type="button" class="' + P + '-dot is-' + st + (i === idx ? ' is-cur' : '') + (flags[i] ? ' is-flag' : '') +
                '" data-goto="' + i + '" aria-label="' + lab + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + (i + 1) + '</button>';
        }).join('');

        focusMode(true);
        var isLast = idx >= total - 1;
        var kindLabel = multi ? 'Select two' : tf ? 'True or false' : 'Single answer';
        var started = S.startedAt ? new Date(S.startedAt).getTime() : Date.now();

        host.innerHTML =
            '<div class="' + P + '-quiz" data-mode="practice">' +
            '<div class="' + P + '-qtop">' +
            '<button type="button" class="' + P + '-link" onclick="renderPracticeChapterGrid(\'' + jsq(S.subjectId) + '\')">' + ICON.left + 'Chapters</button>' +
            '<div class="' + P + '-qtitle"><span class="' + P + '-eyebrow">' + esc(subj.code) + ' &middot; Chapter ' + esc(S.chapterNumber) + '</span>' +
            '<span class="' + P + '-qtitle-t">' + esc(S.chapterTitle || '') + '</span></div>' +
            '<div class="' + P + '-qstats">' +
            '<span class="' + P + '-num" title="Correct so far">' + nOk + '/' + nAnswered + ' correct</span>' +
            '<span class="' + P + '-elapsed ' + P + '-num" data-start="' + started + '" aria-label="Time on this set">' + ICON.clock + '<span>' + fmtClock((Date.now() - started) / 1000) + '</span></span>' +
            '</div></div>' +
            '<div class="' + P + '-prog" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + nAnswered + '"><span style="width:' + (nAnswered / total * 100) + '%"></span></div>' +
            '<div class="' + P + '-map" aria-label="Question map">' + map + '</div>' +
            '<article class="' + P + '-card" aria-labelledby="' + P + '-stem">' +
            '<div class="' + P + '-card-top"><span class="' + P + '-qn ' + P + '-num">Question ' + (idx + 1) + ' <span>of ' + total + '</span></span>' +
            '<span class="' + P + '-kind">' + kindLabel + '</span>' +
            '<button type="button" class="' + P + '-flag' + (flags[idx] ? ' is-on' : '') + '" data-act="flag" data-rd-key="flag" aria-pressed="' + !!flags[idx] + '">' + ICON.flag + '<span>' + (flags[idx] ? 'Flagged' : 'Flag') + '</span></button></div>' +
            '<div class="' + P + '-stem" id="' + P + '-stem">' + q.qText + '</div>' +
            '<ol class="' + P + '-opts" aria-label="Answer options">' + opts + '</ol>' +
            (multi && !done ? '<div class="' + P + '-confirm"><button type="button" class="' + P + '-btn" data-rd-key="confirm" onclick="submitQuizMultiOption()"' + (picks.length !== 2 ? ' disabled' : '') + '>Check answer</button><span class="' + P + '-muted ' + P + '-num">' + picks.length + ' of 2 selected</span></div>' : '') +
            feedback +
            '</article>' +
            '<div class="' + P + '-qnav">' +
            '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-rd-key="prev" onclick="navigateQuizQuestion(-1)"' + (idx === 0 ? ' disabled' : '') + '>' + ICON.left + 'Previous</button>' +
            '<span class="' + P + '-keys" aria-hidden="true"><kbd>1</kbd>&ndash;<kbd>' + Math.min(q.options.length, 9) + '</kbd> answer &nbsp; <kbd>Enter</kbd> next &nbsp; <kbd>F</kbd> flag</span>' +
            (isLast
                ? '<button type="button" class="' + P + '-btn" data-rd-key="next" onclick="finishQuizSession()">Finish set</button>'
                : '<button type="button" class="' + P + '-btn' + (done ? '' : ' ' + P + '-btn--ghost') + '" data-rd-key="next" onclick="navigateQuizQuestion(1)">Next' + ICON.right + '</button>') +
            '</div></div>';

        var cur = host.querySelector('.' + P + '-dot.is-cur');
        if (cur && cur.parentNode && cur.parentNode.scrollWidth > cur.parentNode.clientWidth) {
            cur.parentNode.scrollLeft = cur.offsetLeft - cur.parentNode.clientWidth / 2;
        }
    }

    function onQuizClick(e) {
        var root = e.target.closest('.' + P + '-quiz[data-mode="practice"]');
        if (!root) return;
        var go = e.target.closest('[data-goto]');
        var S = qs();
        if (go && S) {
            var i = +go.getAttribute('data-goto');
            if (i >= 0 && i < S.questions.length && i !== S.currentIndex) {
                S.currentIndex = i;
                if (fn('renderQuizPlayer')) renderQuizPlayer();
            }
            return;
        }
        if (e.target.closest('[data-act="flag"]') && S) {
            var f = flagsFor(S); f[S.currentIndex] = !f[S.currentIndex];
            if (fn('renderQuizPlayer')) renderQuizPlayer();
            var fb = document.querySelector('.' + P + '-flag'); if (fb) fb.focus();
        }
    }

    /* ==================================================================
     * 3. PRACTICE RESULTS + REVIEW
     * ================================================================== */
    function ring(pct, big, small, tone) {
        var r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
        return '<div class="' + P + '-ring' + (tone || pctColorClass(pct)) + '" role="img" aria-label="Score ' + pct + ' percent">' +
            '<svg viewBox="0 0 120 120" width="148" height="148" aria-hidden="true">' +
            '<circle cx="60" cy="60" r="' + r + '" class="' + P + '-ring-track"/>' +
            '<circle cx="60" cy="60" r="' + r + '" class="' + P + '-ring-val" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 60 60)"/></svg>' +
            '<div class="' + P + '-ring-c"><span class="' + P + '-num">' + big + '</span><small>' + small + '</small></div></div>';
    }

    function snapshotPractice() {
        var S = qs();
        if (!S) return null;
        var correct = 0;
        S.questions.forEach(function (q, i) {   /* same rule as finishQuizSession */
            var a = S.userAnswers[i];
            if (Array.isArray(q.correct) && Array.isArray(a)) {
                var all = q.correct.length === a.length && q.correct.every(function (v) { return a.indexOf(v) !== -1; });
                if (all) correct++; else if (a.some(function (v) { return q.correct.indexOf(v) !== -1; })) correct += 0.5;
            } else if (a === q.correct) correct++;
        });
        var started = S.startedAt ? new Date(S.startedAt).getTime() : Date.now();
        return {
            subjectId: S.subjectId, chapterId: S.chapterId, chapterNumber: S.chapterNumber, chapterTitle: S.chapterTitle,
            questions: S.questions.slice(), answers: S.userAnswers.slice(), correct: correct,
            pct: Math.round(correct / S.questions.length * 100), secs: (Date.now() - started) / 1000
        };
    }

    function renderPracticeResults(R) {
        var host = $('practice-main-container');
        if (!host || !R) return;
        var subj = subjectById(R.subjectId) || { code: R.subjectId, name: '' };
        var n = R.questions.length, ok = 0, bad = 0, skip = 0;
        var cells = R.questions.map(function (q, i) {
            var st = qState(q, R.answers[i]);
            if (st === 'ok') ok++; else if (st === 'bad') bad++; else skip++;
            return '<button type="button" class="' + P + '-dot is-' + (st === 'skip' ? 'todo' : st) + '" data-review="' + i + '" aria-label="Question ' + (i + 1) + ', ' +
                (st === 'ok' ? 'correct' : st === 'bad' ? 'incorrect' : 'not answered') + '">' + (i + 1) + '</button>';
        }).join('');
        var missedIds = R.questions.filter(function (q, i) { return qState(q, R.answers[i]) !== 'ok'; }).map(function (q) { return q.id; }).filter(Boolean);

        var hist = chapterHistory(R.subjectId, R.chapterId).slice(-8);
        var histHtml = '';
        if (hist.length) {
            histHtml = '<div class="' + P + '-trend" role="img" aria-label="Your last ' + hist.length + ' scores on this chapter">' +
                hist.map(function (h, i) {
                    return '<div class="' + P + '-trend-col' + (i === hist.length - 1 ? ' is-last' : '') + '"><span class="' + P + '-num">' + h.pct + '</span>' +
                        '<i style="height:' + Math.max(4, h.pct) + '%" class="' + pctColorClass(h.pct) + '"></i><small>' + esc(fmtDate(h.at)) + '</small></div>';
                }).join('') + '</div>';
        } else {
            histHtml = '<p class="' + P + '-muted">Your scores on this chapter will chart here.</p>';
        }

        var stats = chapterStats(R.subjectId);
        var weak = chaptersOf(R.subjectId).filter(function (c) { return stats[c.id] && stats[c.id].pct != null && stats[c.id].pct < 70; })
            .sort(function (a, b) { return stats[a.id].pct - stats[b.id].pct; }).slice(0, 4);
        var weakHtml = weak.length ? '<ul class="' + P + '-weak">' + weak.map(function (c) {
            var p = stats[c.id].pct;
            return '<li><span class="' + P + '-weak-n ' + P + '-num">Ch ' + esc(c.chapterNumber) + '</span><span class="' + P + '-weak-t">' + esc(c.title) + '</span>' +
                bar(p) + '<span class="' + P + '-num ' + P + '-weak-p' + pctColorClass(p) + '">' + p + '%</span>' +
                '<button type="button" class="' + P + '-link ' + P + '-link--sm" data-weak="' + esc(c.id) + '" aria-label="Practise chapter ' + esc(c.chapterNumber) + '">Practise' + ICON.right + '</button></li>';
        }).join('') + '</ul>' : '<p class="' + P + '-muted">No chapter in ' + esc(subj.code) + ' is under 70% right now.</p>';

        var verdict = R.pct >= 70 ? 'Strong set.' : R.pct >= 50 ? 'Above the 50% pass line, with room to tighten.' : 'Below the 50% pass line &mdash; worth another pass.';
        var ringTone = R.pct >= 50 ? '' : ' is-weak';
        var scoreText = (R.correct % 1 ? R.correct.toFixed(1) : R.correct);

        host.innerHTML =
            '<div class="' + P + '-res" data-mode="practice">' +
            '<div class="' + P + '-qtop"><button type="button" class="' + P + '-link" onclick="renderPracticeChapterGrid(\'' + jsq(R.subjectId) + '\')">' + ICON.left + 'Chapters</button></div>' +
            '<section class="' + P + '-res-hero">' +
            ring(R.pct, R.pct + '%', scoreText + ' of ' + n, ringTone) +
            '<div class="' + P + '-res-main"><div class="' + P + '-eyebrow">' + esc(subj.code) + ' &middot; Chapter ' + esc(R.chapterNumber) + ' &middot; Set complete</div>' +
            '<h2 class="' + P + '-h2">' + esc(R.chapterTitle || 'Chapter set') + '</h2>' +
            '<p class="' + P + '-lede">' + verdict + ' Saved to your Dashboard, Progress and Evaluation' + (bad + skip ? '; missed questions went to your Mistake Book.' : '.') + '</p>' +
            '<dl class="' + P + '-kpis ' + P + '-kpis--inline">' +
            '<div><dt>Correct</dt><dd class="' + P + '-num is-good">' + ok + '</dd></div>' +
            '<div><dt>Incorrect</dt><dd class="' + P + '-num is-weak">' + bad + '</dd></div>' +
            '<div><dt>Skipped</dt><dd class="' + P + '-num">' + skip + '</dd></div>' +
            '<div><dt>Time</dt><dd class="' + P + '-num">' + fmtDur(R.secs) + '</dd></div>' +
            '<div><dt>Per question</dt><dd class="' + P + '-num">' + fmtDur(R.secs / n) + '</dd></div>' +
            '</dl>' +
            '<div class="' + P + '-res-acts">' +
            (bad + skip ? '<button type="button" class="' + P + '-btn" data-res="review">Review mistakes (' + (bad + skip) + ')</button>' : '') +
            (missedIds.length && missedIds.length < n ? '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-res="retry">' + ICON.retry + 'Retry the ' + missedIds.length + ' missed</button>' : '') +
            '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" onclick="startPracticeQuiz(\'' + jsq(R.subjectId) + '\', \'' + jsq(R.chapterId) + '\')">Retake chapter</button>' +
            '</div></div></section>' +
            '<div class="' + P + '-res-grid">' +
            '<section class="' + P + '-panel"><h3 class="' + P + '-h3">Question by question</h3><p class="' + P + '-muted">Select a number to see the question and working.</p><div class="' + P + '-map ' + P + '-map--wrap">' + cells + '</div>' +
            '<div class="' + P + '-legend"><span><i class="is-ok"></i>Correct</span><span><i class="is-bad"></i>Incorrect</span><span><i class="is-todo"></i>Skipped</span></div></section>' +
            '<section class="' + P + '-panel"><h3 class="' + P + '-h3">This chapter over time</h3>' + histHtml + '</section>' +
            '<section class="' + P + '-panel ' + P + '-panel--wide"><h3 class="' + P + '-h3">Weak topics in ' + esc(subj.code) + '</h3>' + weakHtml + '</section>' +
            '</div></div>';
        lastPracticeResult = R;
        R.missedIds = missedIds;
        focusMode(true);
    }

    function renderReview(R, onlyMistakes, focusIdx, mode) {
        var hostId = mode === 'mock' ? 'mock-exams-portal-container' : 'practice-main-container';
        var host = $(hostId);
        if (!host || !R) return;
        var items = R.questions.map(function (q, i) { return { q: q, i: i, st: qState(q, R.answers[i]) }; })
            .filter(function (x) { return !onlyMistakes || x.st !== 'ok' || x.i === focusIdx; });
        var body = items.map(function (x) {
            var q = x.q, a = R.answers[x.i];
            var stem = mode === 'mock' ? esc(q.question || '') : (q.qText || q.question || '');
            var opts = (q.options || []).map(function (o, oi) {
                var isC = Array.isArray(q.correct) ? q.correct.indexOf(oi) !== -1 : q.correct === oi;
                var mine = Array.isArray(a) ? a.indexOf(oi) !== -1 : a === oi;
                var cls = isC ? ' is-correct' : (mine ? ' is-wrong' : ' is-dim');
                return '<li class="' + P + '-ropt' + cls + '"><span class="' + P + '-key">' + letter(oi) + '</span><span class="' + P + '-opt-t">' + o + '</span>' +
                    (isC ? '<span class="' + P + '-rtag">Answer</span>' : '') + (mine ? '<span class="' + P + '-rtag is-mine">Yours</span>' : '') + '</li>';
            }).join('');
            return '<article class="' + P + '-ritem is-' + x.st + '" id="' + P + '-r' + x.i + '" tabindex="-1">' +
                '<div class="' + P + '-ritem-h"><span class="' + P + '-num">Q' + (x.i + 1) + '</span><span class="' + P + '-rstate">' +
                (x.st === 'ok' ? ICON.check + 'Correct' : x.st === 'bad' ? ICON.cross + 'Incorrect' : 'Not answered') + '</span></div>' +
                '<div class="' + P + '-stem ' + P + '-stem--sm">' + stem + '</div><ol class="' + P + '-ropts">' + opts + '</ol>' +
                ((q.working || q.explanation) ? '<div class="' + P + '-fb-b"><h4>Working</h4><div class="' + P + '-fb-txt">' + (q.working || q.explanation) + '</div></div>' : '') +
                (q.romanUrdu ? '<div class="' + P + '-fb-b"><h4>Roman Urdu</h4><div class="' + P + '-fb-txt ' + P + '-muted">' + q.romanUrdu + '</div></div>' : '') +
                '</article>';
        }).join('');
        host.innerHTML = '<div class="' + P + '-review" data-mode="' + (mode || 'practice') + '">' +
            '<div class="' + P + '-qtop"><button type="button" class="' + P + '-link" data-res="back">' + ICON.left + 'Results</button>' +
            '<div class="' + P + '-seg" role="radiogroup" aria-label="Which questions">' +
            '<button type="button" role="radio" class="' + P + '-seg-btn' + (onlyMistakes ? ' is-on' : '') + '" aria-checked="' + !!onlyMistakes + '" data-res="only">Mistakes only</button>' +
            '<button type="button" role="radio" class="' + P + '-seg-btn' + (!onlyMistakes ? ' is-on' : '') + '" aria-checked="' + !onlyMistakes + '" data-res="all">All questions</button></div></div>' +
            (body || '<p class="' + P + '-muted">Nothing to review &mdash; every answer was correct.</p>') + '</div>';
        if (focusIdx != null) {
            var el = $(P + '-r' + focusIdx);
            if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); }
        } else {
            toTop();
        }
    }

    function onResultsClick(e) {
        var root = e.target.closest('.' + P + '-res, .' + P + '-review');
        if (!root) return;
        var mode = root.getAttribute('data-mode');
        var R = mode === 'mock' ? lastMockResult : lastPracticeResult;
        if (!R) return;
        var t = e.target.closest('[data-res],[data-review],[data-weak],[data-mweak]');
        if (!t) return;
        if (t.hasAttribute('data-review')) { renderReview(R, false, +t.getAttribute('data-review'), mode); return; }
        if (t.hasAttribute('data-weak')) { practiseChapter(R.subjectId, t.getAttribute('data-weak')); return; }
        if (t.hasAttribute('data-mweak')) { practiseChapter(t.getAttribute('data-msub'), t.getAttribute('data-mweak')); return; }
        var a = t.getAttribute('data-res');
        if (a === 'more') {
            var open = t.getAttribute('aria-expanded') !== 'true';
            root.querySelectorAll('.' + P + '-more').forEach(function (li) { li.hidden = !open; });
            t.setAttribute('aria-expanded', String(open));
            t.textContent = open ? 'Show weakest 8 only' : 'Show all ' + root.querySelectorAll('.' + P + '-weak li').length + ' chapters';
            return;
        }
        if (a === 'review' || a === 'only') renderReview(R, true, null, mode);
        else if (a === 'all') renderReview(R, false, null, mode);
        else if (a === 'back') { if (mode === 'mock') renderMockResults(R); else renderPracticeResults(R); }
        else if (a === 'retry' && R.missedIds && R.missedIds.length) {
            pendingSubset = { chapterId: R.chapterId, ids: R.missedIds.slice() };
            startPracticeQuiz(R.subjectId, R.chapterId);
        }
    }

    /* ==================================================================
     * 4. MOCK EXAMS LANDING
     * ================================================================== */
    function mockHistory() { var h = readJSON('prc_mock_exam_history', []); return Array.isArray(h) ? h : []; }
    function cleanTitle(exam) {
        var t = String(exam.title || '').replace(/\s*Final Mock Exam\s*$/i, '').replace(/\s*Mock Exam\s*$/i, '');
        var m = /^([A-Z0-9 .•]+):\s*(.+)$/.exec(t);
        return m ? m[2] : t;
    }
    function shortCode(exam, key) { return String(exam.code || key).replace(/\s*MOCK\s*$/i, '').trim(); }

    function renderMockLanding() {
        var host = $('mock-exams-portal-container');
        if (!host || !fn('trackMockKeys')) return;
        mockFocus(false);
        var keys = trackMockKeys();
        if (!keys.length) return;   /* keep the app's own "not added yet" notice */
        var hist = mockHistory();
        var store = mockExamDataStore;
        var hasB = false, attempted = 0, bestAll = null;

        var rows = keys.map(function (key) {
            var ex = store[key]; if (!ex) return '';
            var sb = fn('mockSectionBMarks') ? mockSectionBMarks(key) : 0;
            if (sb) hasB = true;
            var marks = ex.grandTotal || (ex.totalMarks + sb);
            var mine = hist.filter(function (h) { return h.subjectId === key || (!h.subjectId && h.subjectTitle === ex.title); });
            var best = mine.reduce(function (m, h) { return Math.max(m, +h.percentage || 0); }, -1);
            if (mine.length) { attempted++; bestAll = bestAll == null ? best : Math.max(bestAll, best); }
            var last = mine[mine.length - 1];
            var bestHtml = mine.length
                ? '<span class="' + P + '-ch-pct' + pctColorClass(best) + '">' + best + '%</span>' + bar(best, 'Best score ' + best + ' percent') +
                  '<span class="' + P + '-ch-sets">' + mine.length + ' attempt' + (mine.length === 1 ? '' : 's') + (last && last.percentage != null && mine.length > 1 ? ' &middot; last ' + (+last.percentage) + '%' : '') + '</span>'
                : '<span class="' + P + '-ch-none">Not attempted</span>';
            return '<li class="' + P + '-paper" data-key="' + esc(key) + '">' +
                '<span class="' + P + '-paper-code">' + esc(shortCode(ex, key)) + '</span>' +
                '<div class="' + P + '-ch-main"><h3 class="' + P + '-ch-title">' + esc(cleanTitle(ex)) + '</h3>' +
                '<div class="' + P + '-ch-meta ' + P + '-num"><span>' + ex.questions.length + ' MCQs' + (sb ? ' + Section B' : '') + '</span><span>' + marks + ' marks</span><span>' + ex.timeLimit + ' min</span></div></div>' +
                '<div class="' + P + '-ch-acc"><span class="' + P + '-acc-k">Best</span>' + bestHtml + '</div>' +
                '<div class="' + P + '-ch-act">' +
                '<button type="button" class="' + P + '-btn" data-mock="arm" aria-expanded="false" aria-label="Start ' + esc(ex.title) + '">' + ICON.play + 'Start</button>' +
                '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" onclick="viewMockExamSyllabus(\'' + jsq(key) + '\')">Syllabus</button></div>' +
                '<div class="' + P + '-arm" hidden><p><strong class="' + P + '-num">' + ex.timeLimit + ' minutes</strong> start the moment you begin. The paper submits itself at 00:00, and answers are marked only after you submit.</p>' +
                '<div><button type="button" class="' + P + '-btn" onclick="startMockExam(\'' + jsq(key) + '\')">Begin paper</button>' +
                '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-mock="disarm">Not now</button></div></div>' +
                '</li>';
        }).join('');

        var recent = hist.slice(-5).reverse();
        var recentHtml = recent.length ? '<ul class="' + P + '-recent">' + recent.map(function (h) {
            var p = +h.percentage || 0;
            return '<li><div><span class="' + P + '-recent-t">' + esc(h.subjectTitle || '') + '</span><span class="' + P + '-muted ' + P + '-num">' + esc(h.date || '') + ' &middot; ' + esc(h.timeTaken || '') + '</span></div>' +
                '<span class="' + P + '-num ' + P + '-recent-s">' + esc(h.score) + '/' + esc(h.totalMarks) + '</span><span class="' + P + '-pill' + pctColorClass(p) + ' ' + P + '-num">' + p + '%</span></li>';
        }).join('') + '</ul>' : '<p class="' + P + '-muted">Your submitted papers will be listed here with marks and time used.</p>';

        var sample = store[keys[0]] || {};
        host.innerHTML =
            '<div class="' + P + '-mland">' +
            '<header class="' + P + '-head"><div class="' + P + '-head-l"><div class="' + P + '-eyebrow">Full papers under exam conditions</div>' +
            '<h2 class="' + P + '-h2">Mock exams</h2>' +
            '<p class="' + P + '-lede">One sitting, one timer, no feedback until you submit &mdash; then a marked breakdown by chapter.</p></div>' +
            '<dl class="' + P + '-kpis"><div><dt>Papers</dt><dd class="' + P + '-num">' + keys.length + '</dd></div>' +
            '<div><dt>Attempted</dt><dd class="' + P + '-num">' + attempted + '<small>/' + keys.length + '</small></dd></div>' +
            '<div><dt>Best score</dt><dd class="' + P + '-num' + pctColorClass(bestAll) + '">' + (bestAll == null ? '&mdash;' : bestAll + '%') + '</dd></div></dl></header>' +
            '<div class="' + P + '-mgrid2">' +
            '<ol class="' + P + '-chlist ' + P + '-papers" aria-label="Available mock papers">' + rows + '</ol>' +
            '<aside class="' + P + '-side">' +
            '<section class="' + P + '-panel"><h3 class="' + P + '-h3">Exam rules</h3><ul class="' + P + '-rules">' +
            '<li>The countdown (' + (sample.timeLimit || 150) + ' minutes) starts when you begin and the paper auto-submits at zero.</li>' +
            '<li>Each MCQ carries ' + (sample.marksPerQuestion || 2) + ' marks. A wrong or blank answer scores zero &mdash; there is no negative marking, so answer everything.</li>' +
            '<li>&ldquo;Select two&rdquo; questions score only when both choices are right.</li>' +
            (hasB ? '<li>PRC 1 adds a 20-mark Section B question: type the figures from the trial balance.</li>' : '') +
            '<li>Flag questions to come back to them from the navigator. Nothing is marked until you submit.</li>' +
            '<li>Pass mark is 50%.</li></ul>' +
            '<p class="' + P + '-keys"><kbd>1</kbd>&ndash;<kbd>4</kbd> answer &nbsp;<kbd>' + ICON.kl + '</kbd><kbd>' + ICON.kr + '</kbd> move &nbsp;<kbd>F</kbd> flag</p></section>' +
            '<section class="' + P + '-panel"><h3 class="' + P + '-h3">Recent attempts</h3>' + recentHtml + '<div id="mock-exam-history" hidden></div></section>' +
            '</aside></div></div>';
    }

    function onMockLandingClick(e) {
        var t = e.target.closest('[data-mock]');
        if (!t || !t.closest('.' + P + '-mland')) return;
        var li = t.closest('.' + P + '-paper');
        var arm = li && li.querySelector('.' + P + '-arm');
        if (!arm) return;
        var open = t.getAttribute('data-mock') === 'arm';
        document.querySelectorAll('.' + P + '-arm').forEach(function (x) { x.hidden = true; });
        document.querySelectorAll('[data-mock="arm"]').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        arm.hidden = !open;
        var ab = li.querySelector('[data-mock="arm"]');
        if (ab) ab.setAttribute('aria-expanded', String(open));
        if (open) { var go = arm.querySelector('button'); if (go) go.focus(); } else if (ab) ab.focus();
    }

    /* ==================================================================
     * 5. MOCK PLAYER
     * The app updates the player by element id (timer, question text,
     * options, palette, stats), so the new layout keeps every one of them.
     * ================================================================== */
    function renderMockShell() {
        var host = $('mock-exams-portal-container');
        var M = mock();
        if (!host || !M || M.submitted) return;
        var total = M.questions.length;
        var sbPanel = '';
        try {
            var sbq = fn('mockSectionBQuestion') ? mockSectionBQuestion(M.subjectKey) : null;
            if (sbq) {
                var started = (typeof MOCK_SECTION_B !== 'undefined') ? Object.keys(MOCK_SECTION_B.answers || {}).length : 0;
                sbPanel = '<div class="' + P + '-sb"><span class="' + P + '-acc-k">Section B</span>' +
                    '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" onclick="openMockSectionB()">Extended question &middot; ' + sbq.marks + ' marks</button>' +
                    '<span class="' + P + '-muted">' + (started ? started + ' figure' + (started === 1 ? '' : 's') + ' entered' : 'Trial balance &middot; not started') + '</span></div>';
            }
        } catch (e) { /* no section B */ }
        var limit = (M.timeLimit || 150) * 60;
        mockFocus(true);
        host.innerHTML =
            '<div class="' + P + '-quiz ' + P + '-mock" data-mode="mock">' +
            '<div class="' + P + '-mbar">' +
            '<div class="' + P + '-qtitle"><span class="' + P + '-eyebrow">Mock exam &middot; in progress</span><span class="' + P + '-qtitle-t">' + esc(M.subjectTitle) + '</span></div>' +
            '<div class="' + P + '-timer" role="timer" aria-label="Time remaining">' + ICON.clock +
            '<span id="mock-exam-timer" class="' + P + '-num">' + String(Math.floor(M.timeLeft / 60)).padStart(2, '0') + ':' + String(M.timeLeft % 60).padStart(2, '0') + '</span>' +
            '<span class="' + P + '-timebar" aria-hidden="true"><span style="width:' + (M.timeLeft / limit * 100) + '%"></span></span></div>' +
            '<div class="' + P + '-mbar-r"><span class="' + P + '-num ' + P + '-muted"><strong id="mock-stat-answered">0 / ' + total + '</strong> answered</span>' +
            '<button type="button" class="' + P + '-btn" data-msubmit="ask">Submit paper</button></div>' +
            '<div class="' + P + '-submit-ask" hidden role="alertdialog" aria-labelledby="' + P + '-ask-t"><p id="' + P + '-ask-t"></p>' +
            '<div><button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-msubmit="cancel">Keep working</button>' +
            '<button type="button" class="' + P + '-btn ' + P + '-btn--danger" onclick="submitMockExam(false)">Submit now</button></div></div>' +
            '</div>' +
            '<div class="' + P + '-prog" aria-hidden="true"><span id="' + P + '-mprog" style="width:0%"></span></div>' +
            '<div class="' + P + '-mlayout">' +
            '<article class="' + P + '-card" aria-labelledby="mock-question-text">' +
            '<div class="' + P + '-card-top"><span class="' + P + '-qn ' + P + '-num">Question <span id="mock-current-q-num">1</span> <span>of ' + total + '</span></span>' +
            '<span class="' + P + '-kind" id="' + P + '-mkind">Single answer</span>' +
            '<button type="button" class="' + P + '-flag" id="flag-current-btn" data-rd-key="flag" onclick="flagCurrentMockQuestion()" aria-pressed="false">' + ICON.flag + '<span>Flag</span></button></div>' +
            '<h3 class="' + P + '-stem" id="mock-question-text"></h3>' +
            '<div id="mock-options-container" class="' + P + '-mopts"></div>' +
            '<div class="' + P + '-qnav">' +
            '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-rd-key="prev" onclick="navigateMockExamQuestion(-1)">' + ICON.left + 'Previous</button>' +
            '<button type="button" class="' + P + '-link ' + P + '-clear" data-rd-key="clear" onclick="clearCurrentMockAnswer()">Clear answer</button>' +
            '<button type="button" class="' + P + '-btn" data-rd-key="next" onclick="navigateMockExamQuestion(1)">Next' + ICON.right + '</button>' +
            '</div></article>' +
            '<aside class="' + P + '-side"><section class="' + P + '-panel"><h3 class="' + P + '-h3">Navigator</h3>' +
            '<div id="mock-question-palette" class="' + P + '-pal" aria-label="Question navigator"></div>' +
            '<div class="' + P + '-legend"><span><i class="is-ans"></i>Answered</span><span><i class="is-flagk"></i><span>Flagged (<strong id="mock-stat-flagged" class="' + P + '-num">0</strong>)</span></span><span><i class="is-todo"></i>Not answered</span></div>' +
            sbPanel +
            '<p class="' + P + '-keys"><kbd>1</kbd>&ndash;<kbd>4</kbd> answer &nbsp;<kbd>' + ICON.kl + '</kbd><kbd>' + ICON.kr + '</kbd> move &nbsp;<kbd>F</kbd> flag</p>' +
            '</section></aside></div></div>';
    }

    function paintMockQuestion() {
        var M = mock();
        var box = $('mock-options-container');
        if (!M || !box || !box.classList.contains(P + '-mopts')) return;
        var idx = M.currentIndex || 0, q = M.questions[idx];
        if (!q) return;
        var multi = isMultiQ(q), tf = q.type === 'true_false';
        var cur = M.userAnswers[idx], picks = Array.isArray(cur) ? cur : [];
        box.innerHTML = (multi ? '<p class="' + P + '-mhint ' + P + '-num">Select two &middot; <strong>' + picks.length + ' of 2</strong> chosen</p>' : '') +
            '<ol class="' + P + '-opts" aria-label="Answer options">' + q.options.map(function (opt, i) {
                var on = multi ? picks.indexOf(i) !== -1 : cur === i;
                var h = multi ? 'toggleMockExamMultiOption(' + i + ')' : 'selectMockExamOption(' + i + ')';
                return '<li><button type="button" class="' + P + '-opt' + (on ? ' is-picked' : '') + '" data-rd-key="opt' + i + '" onclick="' + h + '" ' +
                    (multi ? 'role="checkbox" aria-checked="' + on + '"' : 'aria-pressed="' + on + '"') + '>' +
                    '<span class="' + P + '-key" aria-hidden="true">' + letter(i) + '</span><span class="' + P + '-opt-t"><span class="' + P + '-sr">Option ' + letter(i) + ': </span>' + opt + '</span>' +
                    '<span class="' + P + '-opt-m">' + (on ? ICON.check : '') + '</span></button></li>';
            }).join('') + '</ol>';
        var kind = $(P + '-mkind'); if (kind) kind.textContent = multi ? 'Select two' : tf ? 'True or false' : 'Single answer';
        var flagged = M.flaggedQuestions.indexOf(idx) !== -1;
        var fb = $('flag-current-btn');
        if (fb) {
            fb.style.color = '';
            fb.className = P + '-flag' + (flagged ? ' is-on' : '');
            fb.setAttribute('aria-pressed', String(flagged));
            fb.innerHTML = ICON.flag + '<span>' + (flagged ? 'Flagged' : 'Flag') + '</span>';
        }
        var prev = document.querySelector('.' + P + '-mock [data-rd-key="prev"]');
        var next = document.querySelector('.' + P + '-mock [data-rd-key="next"]');
        if (prev) prev.disabled = idx === 0;
        if (next) next.disabled = idx >= M.questions.length - 1;
    }

    function paintMockPalette() {
        var M = mock();
        var pal = $('mock-question-palette');
        if (!M || !pal || !pal.classList.contains(P + '-pal')) return;
        var n = 0;
        pal.innerHTML = M.questions.map(function (q, i) {
            var a = M.userAnswers[i], isA = answered(a), isF = M.flaggedQuestions.indexOf(i) !== -1, isC = M.currentIndex === i;
            if (isA) n++;
            return '<button type="button" class="' + P + '-dot' + (isA ? ' is-ans' : ' is-todo') + (isF ? ' is-flag' : '') + (isC ? ' is-cur' : '') +
                '" onclick="navigateToMockQuestion(' + i + ')" aria-label="Question ' + (i + 1) + (isA ? ', answered' : ', not answered') + (isF ? ', flagged' : '') + '"' + (isC ? ' aria-current="step"' : '') + '>' + (i + 1) + '</button>';
        }).join('');
        var pr = $(P + '-mprog'); if (pr) pr.style.width = (n / M.questions.length * 100) + '%';
    }

    function paintMockTimer() {
        var M = mock();
        var el = $('mock-exam-timer');
        if (!M || !el || !el.classList.contains(P + '-num')) return;
        el.style.color = '';
        var t = el.closest('.' + P + '-timer');
        if (!t) return;
        var limit = (M.timeLimit || 150) * 60;
        t.classList.toggle('is-low', M.timeLeft <= 600 && M.timeLeft > 300);
        t.classList.toggle('is-crit', M.timeLeft <= 300);
        var tb = t.querySelector('.' + P + '-timebar span'); if (tb) tb.style.width = (M.timeLeft / limit * 100) + '%';
    }

    function onMockClick(e) {
        var t = e.target.closest('[data-msubmit]');
        if (!t || !t.closest('.' + P + '-mock')) return;
        var ask = document.querySelector('.' + P + '-submit-ask');
        if (!ask) return;
        if (t.getAttribute('data-msubmit') === 'ask') {
            var M = mock(); if (!M) return;
            var left = M.questions.filter(function (q, i) { return !answered(M.userAnswers[i]); }).length;
            var fl = M.flaggedQuestions.length;
            ask.querySelector('p').innerHTML = '<strong>Submit this paper?</strong> ' +
                (left ? left + ' question' + (left === 1 ? ' is' : 's are') + ' unanswered' : 'Every question is answered') +
                (fl ? ' and ' + fl + ' ' + (fl === 1 ? 'is' : 'are') + ' flagged' : '') + '. You cannot change answers afterwards.';
            ask.hidden = false;
            var b = ask.querySelector('[data-msubmit="cancel"]'); if (b) b.focus();
        } else {
            ask.hidden = true;
            var s = document.querySelector('[data-msubmit="ask"]'); if (s) s.focus();
        }
    }

    /* ==================================================================
     * 6. MOCK RESULTS
     * ================================================================== */
    function snapshotMock(isAuto) {
        var M = mock();
        if (!M || !M.submitted) return null;
        var h = mockHistory(); var last = h[h.length - 1] || {};
        var ok = 0, bad = 0, skip = 0, byCh = {};
        M.questions.forEach(function (q, i) {
            var st = qState(q, M.userAnswers[i]);
            if (st === 'ok') ok++; else if (st === 'bad') bad++; else skip++;
            var ch = q.chapter || '';
            if (!ch) return;
            var c = byCh[ch] || (byCh[ch] = { ok: 0, n: 0, subject: q.subject || M.subjectKey });
            c.n++; if (st === 'ok') c.ok++;
        });
        var answers = M.questions.map(function (q, i) { return M.userAnswers[i] === undefined ? null : M.userAnswers[i]; });
        return {
            subjectId: M.subjectKey, title: M.subjectTitle, isAuto: !!isAuto,
            score: last.score, total: last.totalMarks, pct: +last.percentage || 0, time: last.timeTaken || '',
            sectionB: last.sectionB || null, ok: ok, bad: bad, skip: skip, byCh: byCh,
            questions: M.questions.slice(), answers: answers
        };
    }

    function renderMockResults(R) {
        var host = $('mock-exams-portal-container');
        if (!host || !R) return;
        lastMockResult = R;
        mockFocus(false);
        var p = R.pct;
        var grade = p >= 80 ? 'A' : p >= 70 ? 'B' : p >= 60 ? 'C' : p >= 50 ? 'D' : 'F';
        var topics = Object.keys(R.byCh).map(function (ch) {
            var c = R.byCh[ch], info = findChapter(ch);
            var sid = info ? info.subjectId : c.subject;
            return { ch: ch, sid: sid, ok: c.ok, n: c.n, pct: Math.round(c.ok / c.n * 100),
                title: info ? info.ch.title : ch, num: info ? info.ch.chapterNumber : '', known: !!(info && subjectById(sid)) };
        }).sort(function (a, b) { return a.pct - b.pct || b.n - a.n; });
        var weakest = topics.filter(function (t) { return t.known && t.pct < 70; })[0];

        var topicRows = topics.map(function (t, ti) {
            return '<li' + (ti >= 8 ? ' class="' + P + '-more" hidden' : '') + '><span class="' + P + '-weak-n ' + P + '-num">' + (t.num !== '' ? 'Ch ' + esc(t.num) : '') + '</span><span class="' + P + '-weak-t">' + esc(t.title) + '</span>' +
                bar(t.pct) + '<span class="' + P + '-num ' + P + '-weak-p' + pctColorClass(t.pct) + '">' + t.ok + '/' + t.n + '</span>' +
                (t.known && t.pct < 70 ? '<button type="button" class="' + P + '-link ' + P + '-link--sm" data-mweak="' + esc(t.ch) + '" data-msub="' + esc(t.sid) + '" aria-label="Practise ' + esc(t.title) + '">Practise' + ICON.right + '</button>' : '<span></span>') + '</li>';
        }).join('');

        var cells = R.questions.map(function (q, i) {
            var st = qState(q, R.answers[i]);
            return '<button type="button" class="' + P + '-dot is-' + (st === 'skip' ? 'todo' : st) + '" data-review="' + i + '" aria-label="Question ' + (i + 1) + ', ' +
                (st === 'ok' ? 'correct' : st === 'bad' ? 'incorrect' : 'not answered') + '">' + (i + 1) + '</button>';
        }).join('');

        host.innerHTML =
            '<div class="' + P + '-res" data-mode="mock">' +
            (R.isAuto ? '<div class="' + P + '-notice" role="status">' + ICON.clock + '<span><strong>Time expired.</strong> The paper was submitted automatically.</span></div>' : '') +
            '<section class="' + P + '-res-hero">' +
            ring(p, p + '%', 'Grade ' + grade, p >= 50 ? '' : ' is-weak') +
            '<div class="' + P + '-res-main"><div class="' + P + '-eyebrow">Mock exam &middot; submitted</div>' +
            '<h2 class="' + P + '-h2">' + esc(R.title) + '</h2>' +
            '<p class="' + P + '-lede">' + (p >= 50 ? 'A pass at the 50% line.' : 'Below the 50% pass line.') + ' Mistakes are in your Mistake Book; this attempt is saved to your history.</p>' +
            '<dl class="' + P + '-kpis ' + P + '-kpis--inline">' +
            '<div><dt>Marks</dt><dd class="' + P + '-num">' + esc(R.score) + '<small>/' + esc(R.total) + '</small></dd></div>' +
            '<div><dt>Correct</dt><dd class="' + P + '-num is-good">' + R.ok + '</dd></div>' +
            '<div><dt>Incorrect</dt><dd class="' + P + '-num is-weak">' + R.bad + '</dd></div>' +
            '<div><dt>Unanswered</dt><dd class="' + P + '-num">' + R.skip + '</dd></div>' +
            '<div><dt>Time used</dt><dd class="' + P + '-num">' + esc(R.time) + '</dd></div>' +
            (R.sectionB ? '<div><dt>Section B</dt><dd class="' + P + '-num">' + esc(R.sectionB.awarded) + '<small>/' + esc(R.sectionB.marks) + '</small></dd></div>' : '') +
            '</dl>' +
            '<div class="' + P + '-res-acts">' +
            '<button type="button" class="' + P + '-btn" onclick="reviewMockExamAnswers()">Review all answers</button>' +
            (R.bad + R.skip ? '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-res="review">Mistakes only (' + (R.bad + R.skip) + ')</button>' : '') +
            (weakest ? '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" data-mweak="' + esc(weakest.ch) + '" data-msub="' + esc(weakest.sid) + '">Practise weakest topic</button>' : '') +
            '<button type="button" class="' + P + '-btn ' + P + '-btn--ghost" onclick="renderMockExamsPortal()">All mock exams</button>' +
            '</div></div></section>' +
            '<div class="' + P + '-res-grid">' +
            '<section class="' + P + '-panel ' + P + '-panel--wide"><h3 class="' + P + '-h3">By chapter, weakest first</h3>' +
            (topicRows ? '<ul class="' + P + '-weak">' + topicRows + '</ul>' + (topics.length > 8 ? '<button type="button" class="' + P + '-link ' + P + '-showall" data-res="more" aria-expanded="false">Show all ' + topics.length + ' chapters</button>' : '') : '<p class="' + P + '-muted">This paper has no chapter tags.</p>') + '</section>' +
            '<section class="' + P + '-panel ' + P + '-panel--wide"><h3 class="' + P + '-h3">Question by question</h3><div class="' + P + '-map ' + P + '-map--wrap">' + cells + '</div>' +
            '<div class="' + P + '-legend"><span><i class="is-ok"></i>Correct</span><span><i class="is-bad"></i>Incorrect</span><span><i class="is-todo"></i>Not answered</span></div></section>' +
            '</div></div>';
        toTop();
    }

    /* ==================================================================
     * 7. KEYBOARD
     * ================================================================== */
    function onKey(e) {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        var tg = e.target, tag = (tg && tg.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (tg && tg.isContentEditable)) return;
        var ov = document.getElementById('practice-centre-overlay');
        if (ov && ov.offsetParent !== null) return;
        var v = view();
        var k = e.key;
        var optIdx = -1;
        if (/^[1-9]$/.test(k)) optIdx = +k - 1;
        else if (/^[a-dA-D]$/.test(k)) optIdx = k.toUpperCase().charCodeAt(0) - 65;
        var onButton = tag === 'BUTTON' || tag === 'A';

        if (v === 'practice' && document.querySelector('.' + P + '-quiz[data-mode="practice"]')) {
            var S = qs(); if (!S) return;
            var q = S.questions[S.currentIndex]; if (!q) return;
            var multi = isMultiQ(q);
            var done = (S.submittedInSession && S.submittedInSession[S.currentIndex]) || (!multi && answered(S.userAnswers[S.currentIndex]));
            if (optIdx >= 0 && optIdx < q.options.length) {
                e.preventDefault();
                if (!done) { if (multi) toggleQuizMultiOption(optIdx); else selectQuizOption(optIdx); }
            } else if (k === 'Enter' && !onButton) {
                e.preventDefault();
                var picks = S.userAnswers[S.currentIndex];
                if (multi && !done && Array.isArray(picks) && picks.length === 2) submitQuizMultiOption();
                else if (done) { if (S.currentIndex < S.questions.length - 1) navigateQuizQuestion(1); else finishQuizSession(); }
            } else if (k === 'ArrowRight' && !onButton) { e.preventDefault(); navigateQuizQuestion(1); }
            else if (k === 'ArrowLeft' && !onButton) { e.preventDefault(); navigateQuizQuestion(-1); }
            else if (k === 'f' || k === 'F') {
                e.preventDefault();
                var f = flagsFor(S); f[S.currentIndex] = !f[S.currentIndex]; renderQuizPlayer();
            } else return;
            return;
        }
        if (v === 'mockexams' && document.querySelector('.' + P + '-mock')) {
            var M = mock(); if (!M || M.submitted) return;
            var ask = document.querySelector('.' + P + '-submit-ask');
            if (ask && !ask.hidden) { if (k === 'Escape') { ask.hidden = true; } return; }
            var mq = M.questions[M.currentIndex || 0]; if (!mq) return;
            if (optIdx >= 0 && optIdx < mq.options.length) {
                e.preventDefault();
                if (isMultiQ(mq)) toggleMockExamMultiOption(optIdx); else selectMockExamOption(optIdx);
            } else if ((k === 'ArrowRight' || (k === 'Enter' && !onButton)) && !onButton) { e.preventDefault(); navigateMockExamQuestion(1); }
            else if (k === 'ArrowLeft' && !onButton) { e.preventDefault(); navigateMockExamQuestion(-1); }
            else if (k === 'f' || k === 'F') { e.preventDefault(); flagCurrentMockQuestion(); }
        }
    }

    /* keep keyboard focus on the equivalent control across the app's re-renders */
    function withFocus(hostId, run) {
        var host = $(hostId), a = document.activeElement, key = null;
        if (host && a && host.contains(a)) key = a.getAttribute('data-rd-key');
        run();
        if (key) { var el = $(hostId) && $(hostId).querySelector('[data-rd-key="' + key + '"]'); if (el && !el.disabled) el.focus({ preventScroll: true }); }
    }

    /* ==================================================================
     * WIRING
     * ================================================================== */
    function wrap(name, after, opts) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig.__rdPrac) return;
        var w = function () {
            var args = arguments, self = this, ret;
            var pre = null;
            if (opts && opts.before) { try { pre = opts.before.apply(null, args); } catch (e) { console.error('[rd-prac] ' + name, e); } }
            ret = orig.apply(self, args);
            try { after.apply(null, [args, pre]); } catch (e) { console.error('[rd-prac] ' + name, e); }
            return ret;
        };
        w.__rdPrac = true;
        w.__rdOrig = orig;
        window[name] = w;
    }

    var shaping = false;
    function init() {
        if (!fn('renderPracticeChapterGrid') || !fn('renderMockExamsPortal')) return;
        document.documentElement.classList.add(P + '-on');

        wrap('renderPracticeSubjectTabs', function () { enhanceSubjectTabs(); });
        wrap('renderPracticeChapterGrid', function (a) { enhanceChapterGrid(a[0]); });
        wrap('startPracticeQuiz', function (a) {
            if (shaping) return;
            if (shapeQuizSet(a[1])) { shaping = true; try { renderQuizPlayer(); } finally { shaping = false; } }
            toTop();
        });
        wrap('renderQuizPlayer', function () { withFocus('practice-main-container', renderQuiz); });
        wrap('finishQuizSession', function () {
            var R = snapshotPractice(); if (R) renderPracticeResults(R);
            toTop();
        });

        wrap('renderMockExamsPortal', function () { renderMockLanding(); });
        wrap('renderMockExamPlayer', function () {
            var M = mock(); if (!M) return;
            var keep = M.currentIndex || 0;
            renderMockShell();
            if (fn('navigateToMockQuestion')) navigateToMockQuestion(keep);
            paintMockTimer();
        });
        wrap('renderCurrentMockQuestion', function () { withFocus('mock-exams-portal-container', paintMockQuestion); });
        wrap('updateMockExamPalette', function () { paintMockPalette(); });
        wrap('updateMockExamTimerDisplay', function () { paintMockTimer(); });
        wrap('submitMockExam', function (a, wasOpen) {
            if (!wasOpen) return;
            var R = snapshotMock(a[0]); if (R) renderMockResults(R);
        }, { before: function () { var M = mock(); return !!(M && !M.submitted); } });

        document.addEventListener('click', function (e) {
            try { onLandingClick(e); onQuizClick(e); onResultsClick(e); onMockLandingClick(e); onMockClick(e); }
            catch (err) { console.error('[rd-prac] click', err); }
        });
        document.addEventListener('keydown', function (e) { try { onKey(e); } catch (err) { console.error('[rd-prac] key', err); } });

        setInterval(function () {
            var el = document.querySelector('.' + P + '-elapsed');
            if (!el) return;
            var s = +el.getAttribute('data-start');
            var sp = el.querySelector('span'); if (sp && s) sp.textContent = fmtClock((Date.now() - s) / 1000);
        }, 1000);

        /* views that were already painted before this module loaded */
        try {
            if ($('practice-main-container') && $('practice-main-container').children.length && typeof currentPracticeSubjectId !== 'undefined') {
                if (qs() && $('quiz-options-grid')) renderQuiz();
                else if (!document.querySelector('.' + P + '-land')) { enhanceSubjectTabs(); enhanceChapterGrid(currentPracticeSubjectId); }
            }
            if ($('mock-exams-portal-container') && $('mock-exams-portal-container').children.length && !mock()) renderMockLanding();
        } catch (e) { /* views will be enhanced on their next render */ }
    }

    function boot() { try { init(); } catch (e) { console.error('[rd-prac] init failed; original UI left in place', e); } }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

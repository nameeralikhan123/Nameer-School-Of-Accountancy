/* ==== Study Library redesign (rd-lib) =====================================
 * Renders a new library UI into #view-study and hides the original markup
 * (only once the first render succeeded). Every action calls the app's own
 * functions: applyTrackSwitch, openPrcBook/openPrcChapter, openCafBook/
 * openCafChapter, openAccaBook/openAccaChapter, switchCafBook/switchAccaBook,
 * selectMMSubject/selectMMChapter, switchPracticeSubject/startPracticeQuiz,
 * showPlanLock. Progress comes from nsa_study_log (getStudyLog) and
 * pc_sessions (chapter quizzes). The PDF reader is untouched.
 * ======================================================================== */
(function () {
    'use strict';

    var P = 'rd-lib';
    var state = { q: '', sel: {}, lockedView: null, mounted: false };
    var root = null;

    /* ------------------------------------------------------------ helpers */
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function fn(name) { return typeof window[name] === 'function' ? window[name] : null; }
    function call(name) {
        var f = fn(name);
        if (!f) return undefined;
        return f.apply(window, Array.prototype.slice.call(arguments, 1));
    }
    /* top-level let/const of the app are not window props; read them by name */
    function g(name) {
        try {
            switch (name) {
                case 'PRC_BOOKS': return typeof PRC_BOOKS !== 'undefined' ? PRC_BOOKS : [];
                case 'CAF_BOOKS': return typeof CAF_BOOKS !== 'undefined' ? CAF_BOOKS : [];
                case 'TRACKS': return typeof TRACKS !== 'undefined' ? TRACKS : [];
                case 'CAF_TAB_META': return typeof CAF_TAB_META !== 'undefined' ? CAF_TAB_META : {};
                case 'currentStudyLevel': return typeof currentStudyLevel !== 'undefined' ? currentStudyLevel : 'prc';
                case 'currentCafBookId': return typeof currentCafBookId !== 'undefined' ? currentCafBookId : null;
                case 'currentAccaBookId': return typeof currentAccaBookId !== 'undefined' ? currentAccaBookId : null;
                case 'mmDataStore': return typeof mmDataStore !== 'undefined' ? mmDataStore : {};
                case 'practiceDataStore': return typeof practiceDataStore !== 'undefined' ? practiceDataStore : {};
            }
        } catch (e) { /* not defined yet */ }
        return undefined;
    }

    var IC = {
        search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
        x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
        lockLg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
        book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/></svg>',
        bookLg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/></svg>',
        map: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="5" r="2"/><circle cx="19.5" cy="5" r="2"/><circle cx="19.5" cy="19" r="2"/><path d="M10.2 10.4 6 6.4M13.8 10.4l4.2-4M13.8 13.6l4.2 4"/></svg>',
        quiz: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
        stNone: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
        stHalf: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
        stDone: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5 8.3l2 2 4-4.3" fill="none" stroke="var(--bg-surface)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
    };

    var TRACK_INFO = {
        prc: { name: 'PRC', long: 'ICAP PRC · Foundation', body: 'ICAP' },
        caf: { name: 'CAF', long: 'ICAP CAF · Advanced', body: 'ICAP' },
        acf: { name: 'ACCA Foundation', long: 'ACCA · Foundations in Accountancy', body: 'ACCA' },
        acs: { name: 'ACCA Skills', long: 'ACCA · Skills level', body: 'ACCA' }
    };
    var PRC_SHORT = { prc1: 'FOA', prc2: 'QAB', prc3v1: 'Management', prc3v2: 'Economics' };

    /* ------------------------------------------------------------- data */
    function booksFor(track) {
        if (track === 'prc') return g('PRC_BOOKS') || [];
        if (track === 'caf') return g('CAF_BOOKS') || [];
        if (track === 'acf') {
            var f = fn('accaBooks');
            return f ? (f() || []) : [];
        }
        return [];
    }
    function allowsLevel(t) { var f = fn('planAllowsLevel'); return f ? !!f(t) : true; }
    function allowsSubject(id) { var f = fn('planAllowsSubject'); return f ? !!f(id) : true; }
    function curTrack() {
        var t = g('currentStudyLevel') || 'prc';
        return TRACK_INFO[t] ? t : 'prc';
    }
    function trackOf(id) { var f = fn('planLevelOf'); return f ? f(id) : ''; }
    function mmIdOf(book) { return book.id === 'caf4v1' ? 'caf4' : book.id; }

    function monogram(book, track) {
        var id = String(book.id);
        if (track === 'prc') {
            var m = id.match(/^prc(\d)(?:v(\d))?$/);
            return { top: 'PRC', big: m ? (m[1] + (m[2] ? '.' + m[2] : '')) : book.code };
        }
        if (track === 'caf') {
            var c = id.match(/^caf(\d)(?:v(\d))?$/);
            return { top: 'CAF', big: c ? (c[1] + (c[2] ? '.' + c[2] : '')) : book.code };
        }
        return { top: 'ACCA', big: book.code };
    }
    function shortName(book, track) {
        if (track === 'caf') return (g('CAF_TAB_META')[book.id] || {}).short || '';
        if (track === 'prc') return PRC_SHORT[book.id] || '';
        return '';
    }
    function lastPrinted(book) {
        var off = book.offset == null ? 5 : book.offset;
        return book.pdfPages ? Math.max(1, book.pdfPages - off) : 0;
    }
    function pageRange(book, i) {
        var ch = book.chapters || [];
        var a = Number(ch[i].p) || 1;
        var b = ch[i + 1] ? (Number(ch[i + 1].p) - 1) : lastPrinted(book);
        if (!b || b <= a) return 'p. ' + a;
        return 'pp. ' + a + '–' + b;
    }
    function pagesCount(book) { return lastPrinted(book) || book.pdfPages || 0; }

    function studyLog() {
        try {
            var f = fn('getStudyLog');
            if (f) return f() || [];
            var raw = JSON.parse(localStorage.getItem('nsa_study_log') || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch (e) { return []; }
    }
    function practisedSet() {
        var set = {};
        try {
            var all = JSON.parse(localStorage.getItem('pc_sessions') || '[]');
            if (!Array.isArray(all)) return set;
            all.forEach(function (s) {
                if (!s) return;
                (s.questions || []).forEach(function (q) { if (q && q.chapter) set[q.chapter] = 1; });
                (s.results || []).forEach(function (r) {
                    if (r && (r.chapter || r.chapterId)) set[r.chapter || r.chapterId] = 1;
                });
                if (s.mode === 'CHAPTER_QUIZ' && s.chapterId) set[s.chapterId] = 1;
            });
        } catch (e) { /* ignore */ }
        return set;
    }
    /* chapter key -> { at } for opened chapters */
    function openedMap() {
        var map = {};
        studyLog().forEach(function (e) {
            if (!e || !e.chapter) return;
            var prev = map[e.chapter];
            if (!prev || String(e.at) > String(prev.at)) map[e.chapter] = e;
        });
        return map;
    }
    function chKeys(book, c) {
        var a = book.id + '-ch' + c.n, b = mmIdOf(book) + '-ch' + c.n;
        return a === b ? [a] : [a, b];
    }
    function chStatus(book, c, opened, practised) {
        var keys = chKeys(book, c), st = 'none', at = '';
        keys.forEach(function (k) {
            if (practised[k]) st = 'done';
            if (opened[k]) {
                if (st !== 'done') st = 'reading';
                if (String(opened[k].at) > at) at = String(opened[k].at);
            }
        });
        return { st: st, at: at };
    }
    function bookProgress(book, opened, practised) {
        var touched = 0, done = 0, last = null;
        (book.chapters || []).forEach(function (c, i) {
            var s = chStatus(book, c, opened, practised);
            if (s.st !== 'none') touched++;
            if (s.st === 'done') done++;
            if (s.at && (!last || s.at > last.at)) last = { i: i, at: s.at };
        });
        var total = (book.chapters || []).length;
        return { touched: touched, done: done, total: total, pct: total ? Math.round(touched / total * 100) : 0, last: last };
    }
    function hasMindMap(book, c) {
        var list = g('mmDataStore')[mmIdOf(book)] || [];
        var id = mmIdOf(book) + '-ch' + c.n;
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return true;
        return false;
    }
    function ago(iso) {
        var t = Date.parse(iso);
        if (!t) return '';
        var d = Math.max(0, (Date.now() - t) / 1000);
        if (d < 90) return 'just now';
        if (d < 3600) return Math.round(d / 60) + ' min ago';
        if (d < 86400) return Math.round(d / 3600) + ' h ago';
        var days = Math.round(d / 86400);
        if (days === 1) return 'yesterday';
        if (days < 30) return days + ' days ago';
        try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
    }
    function norm(s) { return String(s || '').toLowerCase(); }
    function matches(book, c, q) {
        if (!q) return true;
        var hay = norm(c.t) + ' ch ' + c.n + ' chapter ' + c.n;
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
    }
    function hl(text, q) {
        var s = esc(text);
        if (!q) return s;
        q.split(/\s+/).filter(Boolean).forEach(function (w) {
            var re = new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
            s = s.replace(re, '<mark>$1</mark>');
        });
        return s;
    }

    /* --------------------------------------------------------- selection */
    function selectedBook(track, books) {
        var id = state.sel[track];
        if (!id && track === 'caf') id = g('currentCafBookId');
        if (!id && track === 'acf') id = g('currentAccaBookId');
        var b = books.filter(function (x) { return x.id === id && allowsSubject(x.id); })[0];
        if (!b) b = books.filter(function (x) { return allowsSubject(x.id); })[0];
        return b || null;
    }

    /* ------------------------------------------------------------ render */
    function renderTracks(active) {
        var tracks = g('TRACKS') || [];
        var html = '';
        tracks.forEach(function (t) {
            var info = TRACK_INFO[t.id] || { name: t.code, long: t.label };
            var locked = !allowsLevel(t.id);
            var n = booksFor(t.id).length;
            var sel = (state.lockedView ? state.lockedView === t.id : (active === t.id));
            var meta = locked ? 'Not in your plan' : (n ? n + (n === 1 ? ' volume' : ' volumes') : 'Coming soon');
            html += '<button type="button" role="tab" class="' + P + '-track' + (locked ? ' is-locked' : '') + '"' +
                ' data-act="track" data-track="' + esc(t.id) + '" aria-selected="' + (sel ? 'true' : 'false') + '"' +
                (locked ? ' aria-disabled="true"' : '') +
                ' aria-label="' + esc(info.long + (locked ? ' (not in your plan)' : '')) + '">' +
                '<span class="' + P + '-track-name">' + (locked ? IC.lock : '') + esc(info.name) + '</span>' +
                '<span class="' + P + '-track-meta">' + esc(meta) + '</span></button>';
        });
        return html;
    }

    function renderContinue(track, books, opened) {
        var best = null;
        var byId = {};
        books.forEach(function (b) { byId[b.id] = b; if (b.id === 'caf4v1') byId.caf4 = b; });
        Object.keys(opened).forEach(function (k) {
            var e = opened[k];
            var m = String(e.chapter).match(/^(.*)-ch(\w+)$/);
            if (!m) return;
            var book = byId[m[1]];
            if (!book || !allowsSubject(book.id)) return;
            var idx = -1;
            (book.chapters || []).forEach(function (c, i) { if (String(c.n) === m[2]) idx = i; });
            if (idx < 0) return;
            if (!best || String(e.at) > String(best.e.at)) best = { e: e, book: book, i: idx };
        });
        if (!best) {
            return '<div class="' + P + '-continue is-empty"><div class="' + P + '-continue-body">' +
                '<span class="' + P + '-continue-label">Continue reading</span>' +
                '<span class="' + P + '-continue-what">Open any chapter below and it will be kept here, so you can pick up at the right page next time.</span>' +
                '</div></div>';
        }
        var c = best.book.chapters[best.i];
        return '<div class="' + P + '-continue" role="region" aria-label="Continue reading">' +
            '<div class="' + P + '-continue-body">' +
            '<span class="' + P + '-continue-label">Continue reading</span>' +
            '<span class="' + P + '-continue-what"><b>' + esc(best.book.code) + '</b> ' + esc(best.book.title) +
            '<span class="' + P + '-dot">·</span>Ch ' + esc(c.n) + ' ' + esc(c.t) +
            '<span class="' + P + '-dot">·</span><span class="' + P + '-num">p. ' + esc(c.p) + '</span></span>' +
            '</div>' +
            '<span class="' + P + '-continue-when">' + esc(ago(best.e.at)) + '</span>' +
            '<button type="button" class="' + P + '-btn ' + P + '-btn-primary" data-act="read" data-book="' + esc(best.book.id) + '" data-i="' + best.i + '"' +
            ' aria-label="Resume ' + esc(best.book.code + ', chapter ' + c.n + ', page ' + c.p) + '">Resume ' + IC.arrow + '</button>' +
            '</div>';
    }

    function renderCard(book, track, active, opened, practised, q) {
        var mono = monogram(book, track);
        var locked = !allowsSubject(book.id);
        var pr = bookProgress(book, opened, practised);
        var hits = 0;
        if (q) (book.chapters || []).forEach(function (c) { if (matches(book, c, q)) hits++; });
        var sn = shortName(book, track);
        var cls = P + '-card' + (active ? ' is-active' : '') + (locked ? ' is-locked' : '') + (q && !hits ? ' is-dim' : '');
        var meta = locked ? 'Not in your plan'
            : (pr.total ? pr.touched + ' of ' + pr.total + ' chapters opened' : 'Whole-book PDF');
        var html = '<div class="' + cls + '" style="--rd-subj:' + esc(book.accent || '') + '">';
        html += '<button type="button" class="' + P + '-card-main" data-act="book" data-book="' + esc(book.id) + '"' +
            ' aria-pressed="' + (active ? 'true' : 'false') + '" aria-controls="' + P + '-detail"' +
            ' aria-label="' + esc(book.code + ' ' + book.title + (locked ? ', not in your plan' : ', show chapters')) + '">';
        html += '<span class="' + P + '-mono"><small>' + esc(mono.top) + '</small><b>' + esc(mono.big) + '</b></span>';
        html += '<span><span class="' + P + '-card-code">' + esc(book.code) + (sn ? ' · ' + esc(sn) : '') + '</span>' +
            '<span class="' + P + '-card-title">' + esc(book.title) + '</span></span>';
        html += '<span class="' + P + '-card-prog">';
        if (!locked && pr.total) html += '<span class="' + P + '-bar" aria-hidden="true"><i style="width:' + pr.pct + '%"></i></span>';
        html += '<span class="' + P + '-card-meta"><span>' + esc(meta) + '</span><span>' +
            (q ? (hits ? hits + (hits === 1 ? ' match' : ' matches') : 'No matches') : (pagesCount(book) ? pagesCount(book) + ' pp' : '')) +
            '</span></span></span>';
        html += '</button>';
        html += '<div class="' + P + '-card-foot">';
        if (locked) {
            html += '<span class="' + P + '-card-hint">Ask your admin to add this paper</span>' +
                '<span class="' + P + '-badge">' + IC.lock + 'Locked</span>';
        } else if (pr.last) {
            var lc = book.chapters[pr.last.i];
            html += '<span class="' + P + '-card-hint">Last: Ch ' + esc(lc.n) + ' · ' + esc(ago(pr.last.at)) + '</span>' +
                '<button type="button" class="' + P + '-btn ' + P + '-btn-primary ' + P + '-btn-sm" data-act="read" data-book="' + esc(book.id) + '" data-i="' + pr.last.i + '"' +
                ' aria-label="Continue ' + esc(book.code) + ' at chapter ' + esc(lc.n) + '">Continue</button>';
        } else {
            html += '<span class="' + P + '-card-hint">' + esc(book.sizeMB || '') + '</span>' +
                '<button type="button" class="' + P + '-btn ' + P + '-btn-ghost ' + P + '-btn-sm" data-act="open" data-book="' + esc(book.id) + '"' +
                ' aria-label="Open ' + esc(book.code) + ' study text">' + IC.book + 'Open book</button>';
        }
        html += '</div></div>';
        return html;
    }

    function renderDetail(book, track, opened, practised, q) {
        if (!book) {
            return '<div class="' + P + '-empty">' + '<div class="' + P + '-empty-icon">' + IC.lockLg + '</div>' +
                '<h3>No volumes in your plan for this track</h3><p>Your plan does not include any of these papers yet. ' +
                'Contact your admin if you need one added.</p></div>';
        }
        var mono = monogram(book, track);
        var pr = bookProgress(book, opened, practised);
        var chapters = book.chapters || [];
        var sn = shortName(book, track);
        var html = '';
        html += '<div class="' + P + '-dhead">';
        html += '<span class="' + P + '-mono is-lg" style="border-color:' + esc(book.accent || '') + '"><small>' + esc(mono.top) + '</small><b>' + esc(mono.big) + '</b></span>';
        html += '<div><div class="' + P + '-dcode">' + esc(book.code) + (sn ? ' · ' + esc(sn) : '') + '</div>' +
            '<h3 class="' + P + '-dtitle" id="' + P + '-dtitle">' + esc(book.title) + '</h3>' +
            '<p class="' + P + '-dmeta">' + [
                chapters.length ? chapters.length + ' chapters' : '',
                pagesCount(book) ? pagesCount(book) + ' pages' : '',
                book.edition || '', book.sizeMB || ''
            ].filter(Boolean).map(esc).join(' · ') + '</p></div>';
        if (chapters.length) {
            html += '<div class="' + P + '-dprog"><span class="' + P + '-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + pr.total + '" aria-valuenow="' + pr.touched + '" aria-label="Chapters opened"><i style="width:' + pr.pct + '%"></i></span>' +
                '<span class="' + P + '-dprog-text">' + pr.touched + ' of ' + pr.total + ' opened · ' + pr.done + ' practised</span></div>';
        }
        html += '<div class="' + P + '-dacts">';
        if (pr.last) {
            var lc = chapters[pr.last.i];
            html += '<button type="button" class="' + P + '-btn ' + P + '-btn-primary" data-act="read" data-book="' + esc(book.id) + '" data-i="' + pr.last.i + '">' +
                'Continue at Ch ' + esc(lc.n) + ' · p. ' + esc(lc.p) + '</button>';
            html += '<button type="button" class="' + P + '-btn ' + P + '-btn-ghost" data-act="open" data-book="' + esc(book.id) + '">' + IC.book + 'Open full book</button>';
        } else {
            html += '<button type="button" class="' + P + '-btn ' + P + '-btn-primary" data-act="open" data-book="' + esc(book.id) + '">' + IC.book + 'Open book</button>';
            if (chapters.length) {
                html += '<button type="button" class="' + P + '-btn ' + P + '-btn-ghost" data-act="read" data-book="' + esc(book.id) + '" data-i="0">Start at Ch ' + esc(chapters[0].n) + '</button>';
            }
        }
        html += '</div></div>';

        if (!chapters.length) {
            html += '<p class="' + P + '-note">This edition opens as a whole PDF. Its chapter page map could not be read reliably, ' +
                'so no chapter numbers are shown here — use the PDF’s own contents page.</p>';
            return html;
        }

        var rows = '';
        var shown = 0;
        chapters.forEach(function (c, i) {
            if (!matches(book, c, q)) return;
            shown++;
            var s = chStatus(book, c, opened, practised);
            var stLabel = s.st === 'done' ? 'Done' : (s.st === 'reading' ? 'In progress' : 'Not started');
            var stTip = s.st === 'done' ? 'Chapter quiz taken' : (s.st === 'reading' ? 'Opened ' + ago(s.at) : 'Not opened yet');
            var mm = hasMindMap(book, c);
            var label = 'chapter ' + c.n + ', ' + c.t;
            rows += '<li class="' + P + '-row">' +
                '<span class="' + P + '-chno" aria-hidden="true">' + esc(String(c.n).length < 2 ? '0' + c.n : c.n) + '</span>' +
                '<div class="' + P + '-chmain"><button type="button" class="' + P + '-chtitle" data-act="read" data-book="' + esc(book.id) + '" data-i="' + i + '"' +
                ' aria-label="Read ' + esc(label) + ', ' + esc(pageRange(book, i)) + '">' + hl(c.t, q) + '</button>' +
                '<span class="' + P + '-pages">Ch ' + esc(c.n) + ' · ' + esc(pageRange(book, i)) + '</span></div>' +
                '<span class="' + P + '-status is-' + s.st + '" title="' + esc(stTip) + '">' +
                (s.st === 'done' ? IC.stDone : (s.st === 'reading' ? IC.stHalf : IC.stNone)) + esc(stLabel) + '</span>' +
                '<div class="' + P + '-chacts">' +
                '<button type="button" class="' + P + '-iconbtn is-read" data-act="read" data-book="' + esc(book.id) + '" data-i="' + i + '" aria-label="Read ' + esc(label) + '">' + IC.book + 'Read</button>' +
                '<button type="button" class="' + P + '-iconbtn" data-act="mm" data-book="' + esc(book.id) + '" data-i="' + i + '"' +
                (mm ? '' : ' disabled') + ' aria-label="Mind map for ' + esc(label) + '" title="' + (mm ? 'Mind map' : 'No mind map for this chapter yet') + '">' + IC.map + 'Mind map</button>' +
                '<button type="button" class="' + P + '-iconbtn" data-act="practise" data-book="' + esc(book.id) + '" data-i="' + i + '"' +
                (mm ? '' : ' disabled') + ' aria-label="Practise ' + esc(label) + '" title="' + (mm ? 'Practise this chapter' : 'No practice set for this chapter yet') + '">' + IC.quiz + 'Practise</button>' +
                '</div></li>';
        });
        if (!shown) {
            html += '<p class="' + P + '-note">No chapters in ' + esc(book.code) + ' match “' + esc(q) + '”.</p>';
        } else {
            html += '<ol class="' + P + '-chapters" aria-labelledby="' + P + '-dtitle">' + rows + '</ol>';
        }
        return html;
    }

    function renderLocked(trackId, active) {
        var info = TRACK_INFO[trackId] || { long: trackId };
        var tracks = (g('TRACKS') || []).filter(function (t) { return allowsLevel(t.id); });
        var chips = tracks.map(function (t) {
            return '<li><button type="button" class="' + P + '-chip" data-act="track" data-track="' + esc(t.id) + '">' + IC.check +
                esc((TRACK_INFO[t.id] || {}).long || t.label) + '</button></li>';
        }).join('');
        return '<div class="' + P + '-panel"><div class="' + P + '-empty">' +
            '<div class="' + P + '-empty-icon">' + IC.lockLg + '</div>' +
            '<h3>' + esc(info.long) + ' isn’t part of your plan</h3>' +
            '<p>Its study texts, mind maps and practice questions open as soon as your admin adds this track to your account. Nothing else you have changes.</p>' +
            (chips ? '<p style="margin-bottom:8px;">Your plan includes:</p><ul>' + chips + '</ul>' : '') +
            '</div></div>';
    }

    function renderComingSoon(trackId) {
        var info = TRACK_INFO[trackId] || { long: trackId };
        return '<div class="' + P + '-panel"><div class="' + P + '-empty">' +
            '<div class="' + P + '-empty-icon">' + IC.bookLg + '</div>' +
            '<h3>' + esc(info.long) + ' texts haven’t been added yet</h3>' +
            '<p>Your access to this track is active — the study texts simply aren’t in the app yet. ' +
            'They’ll appear here, with chapter links and reading progress, once they are uploaded. Until then, ask your admin for the PDFs.</p>' +
            '</div></div>';
    }

    /* openPdfReader reads a global `currentPlanTrack` that the app never
       declares, so opening a PRC/CAF book after an ACCA one threw before the
       reader appeared. Provide it (only if the app has not) = active track. */
    var shimPlanTrack = false;
    try { if (typeof currentPlanTrack === 'undefined') shimPlanTrack = true; } catch (e) { shimPlanTrack = true; }
    function syncPlanTrack() { if (shimPlanTrack) window.currentPlanTrack = curTrack(); }

    function render() {
        syncPlanTrack();
        if (!root) return;
        var track = curTrack();
        var books = booksFor(track);
        var opened = openedMap();
        var practised = practisedSet();
        var q = norm(state.q).trim();
        var info = TRACK_INFO[track];

        root.querySelector('.' + P + '-tracks').innerHTML = renderTracks(track);
        var sub = root.querySelector('#' + P + '-sub');
        var input = root.querySelector('#' + P + '-q');
        var cont = root.querySelector('#' + P + '-continue');
        var body = root.querySelector('#' + P + '-body');

        if (state.lockedView) {
            var li = TRACK_INFO[state.lockedView] || { long: state.lockedView };
            sub.textContent = li.long + ' · not in your plan';
            input.disabled = true;
            input.placeholder = 'Search chapters';
            cont.innerHTML = '';
            body.innerHTML = renderLocked(state.lockedView, track);
            return;
        }
        var chTotal = 0;
        books.forEach(function (b) { chTotal += (b.chapters || []).length; });
        sub.textContent = books.length
            ? info.long + ' · ' + books.length + (books.length === 1 ? ' volume' : ' volumes') + ' · ' + chTotal + ' chapters'
            : info.long;
        input.disabled = !books.length;
        input.placeholder = 'Search ' + info.name + ' chapters';

        if (!books.length) {
            cont.innerHTML = '';
            body.innerHTML = renderComingSoon(track);
            return;
        }
        cont.innerHTML = renderContinue(track, books, opened);

        var sel = selectedBook(track, books);
        /* while searching, jump to the first volume with a hit if the chosen one has none */
        if (q && sel && state.qSel !== sel.id && !(sel.chapters || []).some(function (c) { return matches(sel, c, q); })) {
            var alt = books.filter(function (b) {
                return allowsSubject(b.id) && (b.chapters || []).some(function (c) { return matches(b, c, q); });
            })[0];
            if (alt) sel = alt;
        }
        var cards = books.map(function (b) {
            return renderCard(b, track, sel && b.id === sel.id, opened, practised, q);
        }).join('');
        var allowedN = books.filter(function (b) { return allowsSubject(b.id); }).length;
        body.innerHTML =
            '<section class="' + P + '-shelf" aria-label="Volumes">' +
            '<div class="' + P + '-shelf-head"><span>Volumes</span><span>' +
            (allowedN < books.length ? allowedN + ' of ' + books.length + ' in your plan' : books.length + ' in this track') + '</span></div>' +
            '<div class="' + P + '-shelf-list">' + cards + '</div></section>' +
            '<section class="' + P + '-detail" id="' + P + '-detail" aria-live="polite">' +
            renderDetail(sel, track, opened, practised, q) + '</section>';
    }

    function safeRender() {
        try { render(); } catch (e) { console.error('[rd-lib] render failed', e); unmount(); }
    }

    /* ------------------------------------------------------------ actions */
    function findBook(id) {
        var t = curTrack();
        var b = booksFor(t).filter(function (x) { return x.id === id; })[0];
        return { book: b, track: t };
    }
    function openBook(book, track) {
        if (!allowsSubject(book.id)) { call('showPlanLock', book.code + ' - ' + book.title); return; }
        if (track === 'prc') call('openPrcBook', book.file);
        else if (track === 'caf') call('openCafBook', book.file);
        else if (track === 'acf') call('openAccaBook', book.file);
    }
    function readChapter(book, track, i) {
        if (!allowsSubject(book.id)) { call('showPlanLock', book.code + ' - ' + book.title); return; }
        if (track === 'prc') call('openPrcChapter', book.file, i);
        else if (track === 'caf') call('openCafChapter', book.id, i);
        else if (track === 'acf') {
            /* the ACCA opener does not log the chapter; record it the way the
               PRC/CAF openers do so it shows as in progress */
            var c = (book.chapters || [])[i];
            if (c) call('recordChapterStudied', book.id, book.id + '-ch' + c.n, c.t);
            call('openAccaChapter', book.id, i);
        }
    }
    function goMindMap(book, i) {
        var c = book.chapters[i];
        var mmId = mmIdOf(book), chId = mmId + '-ch' + c.n;
        if (!allowsSubject(mmId)) { call('showPlanLock', 'this subject'); return; }
        call('switchView', 'mindmaps');
        call('selectMMSubject', mmId);
        call('selectMMChapter', chId);
        call('renderMMSubjectTabs');
        call('renderMMChaptersList');
    }
    function goPractise(book, i) {
        var c = book.chapters[i];
        var mmId = mmIdOf(book), chId = mmId + '-ch' + c.n;
        if (!allowsSubject(mmId)) { call('showPlanLock', 'this chapter'); return; }
        call('switchView', 'practice');
        call('switchPracticeSubject', mmId);
        var bank = (g('practiceDataStore') || {})[mmId] || {};
        if (Array.isArray(bank[chId]) && bank[chId].length) call('startPracticeQuiz', mmId, chId);
    }

    function onClick(ev) {
        var el = ev.target.closest('[data-act]');
        if (!el || !root.contains(el) || el.disabled) return;
        var act = el.getAttribute('data-act');
        if (act === 'track') {
            var t = el.getAttribute('data-track');
            if (!allowsLevel(t)) { state.lockedView = t; safeRender(); return; }
            state.lockedView = null;
            if (t === curTrack()) { safeRender(); return; }
            call('applyTrackSwitch', t);   /* -> switchStudyLevel -> render */
            safeRender();
            return;
        }
        var f = findBook(el.getAttribute('data-book'));
        if (!f.book) return;
        var i = parseInt(el.getAttribute('data-i'), 10) || 0;
        if (act === 'book') {
            if (!allowsSubject(f.book.id)) { call('showPlanLock', f.book.code + ' - ' + f.book.title); return; }
            state.sel[f.track] = f.book.id;
            state.qSel = state.q ? f.book.id : null;
            if (f.track === 'caf') call('switchCafBook', f.book.id);
            else if (f.track === 'acf') call('switchAccaBook', f.book.id);
            safeRender();
            var d = root.querySelector('#' + P + '-detail');
            if (d && root.offsetWidth < 980 && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        if (act === 'open') openBook(f.book, f.track);
        else if (act === 'read') readChapter(f.book, f.track, i);
        else if (act === 'mm') goMindMap(f.book, i);
        else if (act === 'practise') goPractise(f.book, i);
    }

    function onTrackKey(ev) {
        var tab = ev.target.closest('.' + P + '-track');
        if (!tab) return;
        var tabs = Array.prototype.slice.call(root.querySelectorAll('.' + P + '-track'));
        var k = tabs.indexOf(tab), n = -1;
        if (ev.key === 'ArrowRight') n = (k + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft') n = (k - 1 + tabs.length) % tabs.length;
        if (n >= 0) { ev.preventDefault(); tabs[n].focus(); }
    }

    /* ------------------------------------------------------------- mount */
    function mount() {
        var sec = document.getElementById('view-study');
        if (!sec || root) return;
        root = document.createElement('div');
        root.className = P;
        root.id = P + '-root';
        root.innerHTML =
            '<header class="' + P + '-head"><div>' +
            '<p class="' + P + '-kicker">Study Library</p>' +
            '<h2 class="' + P + '-title">Official study texts</h2>' +
            '<p class="' + P + '-sub" id="' + P + '-sub"></p></div>' +
            '<label class="' + P + '-search"><span class="' + P + '-sr">Search chapters</span>' + IC.search +
            '<input type="search" id="' + P + '-q" autocomplete="off" spellcheck="false" placeholder="Search chapters">' +
            '<button type="button" class="' + P + '-clear" aria-label="Clear search">' + IC.x + '</button></label>' +
            '</header>' +
            '<nav class="' + P + '-tracks" role="tablist" aria-label="Qualification track"></nav>' +
            '<div id="' + P + '-continue"></div>' +
            '<div class="' + P + '-body" id="' + P + '-body"></div>';
        sec.insertBefore(root, sec.firstChild);

        var input = root.querySelector('#' + P + '-q');
        var lab = root.querySelector('.' + P + '-search');
        input.addEventListener('input', function () {
            state.q = input.value;
            state.qSel = null;
            lab.classList.toggle('has-q', !!input.value);
            safeRender();
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && input.value) { input.value = ''; state.q = ''; lab.classList.remove('has-q'); safeRender(); }
        });
        root.querySelector('.' + P + '-clear').addEventListener('click', function () {
            input.value = ''; state.q = ''; lab.classList.remove('has-q'); safeRender(); input.focus();
        });
        root.addEventListener('click', onClick);
        root.querySelector('.' + P + '-tracks').addEventListener('keydown', onTrackKey);

        render();                      /* throws -> caught by init, original stays */
        sec.classList.add(P + '-on');
        state.mounted = true;
    }
    function unmount() {
        var sec = document.getElementById('view-study');
        if (sec) sec.classList.remove(P + '-on');
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        state.mounted = false;
    }

    /* Wrap an app global: run the original, then repaint. */
    function wrap(name, after) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig.__rdLib) return;
        var w = function () {
            var r = orig.apply(this, arguments);
            try { after.apply(null, arguments); } catch (e) { /* never break the app */ }
            return r;
        };
        w.__rdLib = true;
        window[name] = w;
    }

    function init() {
        try {
            wrap('switchStudyLevel', function () { state.lockedView = null; syncPlanTrack(); safeRender(); });
            syncPlanTrack();
            wrap('applyView', function (v) { if (v === 'study') safeRender(); });
            wrap('recordChapterStudied', safeRender);
            wrap('switchCafBook', function (id) { if (id) state.sel.caf = id; if (root) safeRender(); });
            wrap('switchAccaBook', function (id) { if (id) state.sel.acf = id; if (root) safeRender(); });
            wrap('practiceCentrePersistSession', safeRender);
            window.addEventListener('storage', function (e) {
                if (!e.key || /nsa_study_log|pc_sessions|nsa_plan|nsa_level_pref/.test(e.key)) safeRender();
            });
            mount();
        } catch (e) {
            console.error('[rd-lib] init failed; original Study Library kept', e);
            unmount();
        }
    }

    /* switchCafBook/switchAccaBook call our wrapper on every original render, so
       guard re-entrancy: render() itself never calls a wrapped function. */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

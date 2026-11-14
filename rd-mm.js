/* ==========================================================================
   rd-mm : Mind Maps page redesign (#view-mindmaps)

   Additive runtime layer. The app's own renderers (renderMMChaptersList,
   renderMMCanvas, the CAF diagram wrapper, the ACCA Quick Revision layer)
   still run first and keep producing their original markup; this module then
   renders a study layout from the same data (mmDataStore / mmSubjectsList)
   into #rd-mm-root inside .mm-layout and hides the two legacy columns.
   Every action calls the app's own functions: selectMMChapter(),
   openTopicModal(). When there is nothing to show (track without mind maps,
   plan lock) the legacy markup is left visible untouched.

   Progress: topics opened per chapter -> localStorage `nsa_rd_mm_seen`
   ({ chapterId: [topicId, ...] }), written whenever openTopicModal() runs.
   ========================================================================== */
(function () {
    'use strict';

    var SEEN_KEY = 'nsa_rd_mm_seen';
    var rendering = false;
    var notesOpen = true;
    var diagramOpen = false;
    var ro = null;

    /* ---------------- helpers ---------------- */
    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function log(e) { try { console.warn('[rd-mm]', e); } catch (x) { /* ignore */ } }

    function g(name) {
        /* top-level let/const of the app live in the shared global lexical scope */
        try {
            switch (name) {
                case 'subject': return typeof currentMMSubjectId !== 'undefined' ? currentMMSubjectId : null;
                case 'chapter': return typeof currentMMChapterId !== 'undefined' ? currentMMChapterId : null;
                case 'level': return typeof currentMMLevel !== 'undefined' ? currentMMLevel : null;
                case 'store': return typeof mmDataStore !== 'undefined' ? mmDataStore : null;
                case 'subjects': return typeof mmSubjectsList !== 'undefined' ? mmSubjectsList : [];
                case 'kinds': return typeof MM_KIND_LABEL !== 'undefined' ? MM_KIND_LABEL : {};
            }
        } catch (e) { /* fall through */ }
        return null;
    }

    function readSeen() {
        try {
            var v = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
            return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
        } catch (e) { return {}; }
    }
    function markSeen(chapterId, topicId) {
        if (!chapterId || !topicId) return;
        try {
            var s = readSeen();
            var list = Array.isArray(s[chapterId]) ? s[chapterId] : [];
            if (list.indexOf(topicId) === -1) list.push(topicId);
            s[chapterId] = list;
            localStorage.setItem(SEEN_KEY, JSON.stringify(s));
        } catch (e) { log(e); }
    }
    function seenCount(seen, ch) {
        var list = seen[ch.id];
        if (!Array.isArray(list) || !list.length) return 0;
        var n = 0;
        (ch.topics || []).forEach(function (t) { if (list.indexOf(t.id) !== -1) n++; });
        return n;
    }
    function isSeen(seen, ch, t) {
        var list = seen[ch.id];
        return Array.isArray(list) && list.indexOf(t.id) !== -1;
    }

    function pagesLabel(p) {
        var s = String(p == null ? '' : p).trim();
        if (!s) return '';
        s = s.replace(/^p{1,2}\.\s*/i, '').replace(/\s*(?:to|–|—|-)\s*/i, '–');
        return (s.indexOf('–') !== -1 ? 'pp. ' : 'p. ') + s;
    }
    function chNum(ch, i) {
        var n = ch.chapterNumber != null ? ch.chapterNumber : (ch.num != null ? ch.num : i + 1);
        return String(n);
    }
    function isAcca(level) { return level === 'acf' || level === 'acs'; }

    /* ---------------- icons ---------------- */
    var I = {
        check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
        prev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
        next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
        chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
        open: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
        down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>'
    };

    /* ---------------- state from the app ---------------- */
    function context() {
        var store = g('store');
        var level = g('level');
        var subjects = g('subjects') || [];
        if (!store) return null;
        var levelSubjects = subjects.filter(function (s) {
            try {
                var lv = typeof planLevelOf === 'function' ? planLevelOf(s.id) : null;
                var ok = typeof planAllowsSubject === 'function' ? planAllowsSubject(s.id) : true;
                return (lv == null || lv === level) && ok;
            } catch (e) { return false; }
        });
        if (!levelSubjects.length) return null;
        var sid = g('subject');
        var subject = subjects.filter(function (s) { return s.id === sid; })[0];
        if (!subject || levelSubjects.indexOf(subject) === -1) return null;
        var chapters = store[sid] || [];
        if (!chapters.length) return null;
        var cid = g('chapter');
        var idx = -1;
        for (var i = 0; i < chapters.length; i++) if (chapters[i].id === cid) { idx = i; break; }
        if (idx === -1) idx = 0;
        var ch = chapters[idx];
        if (!ch || !Array.isArray(ch.topics)) return null;
        return { level: level, subject: subject, chapters: chapters, idx: idx, ch: ch };
    }

    /* ---------------- markup ---------------- */
    function chapterListHtml(c, seen) {
        var h = '<nav class="rd-mm-chapters" aria-label="Chapters in ' + esc(c.subject.code) + '">';
        h += '<div class="rd-mm-chapters-head"><span>Chapters</span><span class="rd-mm-num">' + c.chapters.length + '</span></div>';
        h += '<ol class="rd-mm-chlist" role="list">';
        c.chapters.forEach(function (ch, i) {
            var total = (ch.topics || []).length;
            var done = seenCount(seen, ch);
            var pct = total ? Math.round(done / total * 100) : 0;
            var active = i === c.idx;
            var full = total > 0 && done === total;
            h += '<li><button type="button" class="rd-mm-ch' + (active ? ' is-active' : '') + (full ? ' is-done' : '') + '"'
                + ' data-rd-mm-ch="' + esc(ch.id) + '"' + (active ? ' aria-current="true"' : '')
                + ' title="' + esc(ch.title) + '"'
                + ' aria-label="Chapter ' + esc(chNum(ch, i)) + ': ' + esc(ch.title) + ', ' + done + ' of ' + total + ' topics opened">'
                + '<span class="rd-mm-ch-no">' + esc(chNum(ch, i)) + '</span>'
                + '<span class="rd-mm-ch-body">'
                + '<span class="rd-mm-ch-title">' + esc(ch.title) + '</span>'
                + '<span class="rd-mm-ch-meta"><span class="rd-mm-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>'
                + '<span class="rd-mm-ch-count">' + done + '/' + total + '</span></span>'
                + '</span></button></li>';
        });
        h += '</ol></nav>';
        return h;
    }

    function headHtml(c, seen) {
        var ch = c.ch;
        var total = ch.topics.length;
        var done = seenCount(seen, ch);
        var pct = total ? Math.round(done / total * 100) : 0;
        var prev = c.chapters[c.idx - 1];
        var next = c.chapters[c.idx + 1];
        var pages = pagesLabel(ch.pages);
        var hasNotes = (ch.revision && ch.revision.length) || (ch.summary && ch.summary.length);

        var h = '<header class="rd-mm-head">';
        h += '<div class="rd-mm-kicker"><span class="rd-mm-dot" style="--rd-mm-c:' + esc(c.subject.color || '') + '" aria-hidden="true"></span>'
            + '<span>' + esc(c.subject.code) + '</span><span class="rd-mm-sep" aria-hidden="true">/</span>'
            + '<span class="rd-mm-kicker-name">' + esc(c.subject.name || c.subject.shortName || '') + '</span></div>';
        h += '<h2 class="rd-mm-title"><span class="rd-mm-title-no">Chapter ' + esc(chNum(ch, c.idx)) + '</span>'
            + '<span class="rd-mm-title-t">' + esc(ch.title) + '</span></h2>';
        h += '<div class="rd-mm-facts">';
        h += '<span><b>' + total + '</b> topic' + (total === 1 ? '' : 's') + '</span>';
        if (pages) h += '<span>Study text <b>' + esc(pages) + '</b></span>';
        h += '<span class="rd-mm-progress-txt"><b>' + done + '</b> of ' + total + ' opened</span>';
        if (hasNotes) h += '<a class="rd-mm-jump" href="#rd-mm-notes" data-rd-mm-jump="notes">' + I.down + 'Revision notes</a>';
        h += '</div>';
        h += '<div class="rd-mm-progress" role="progressbar" aria-label="Topics opened in this chapter" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '">'
            + '<i style="width:' + pct + '%"></i></div>';
        h += '<div class="rd-mm-pager">';
        h += '<button type="button" class="rd-mm-pg rd-mm-pg-prev"' + (prev ? ' data-rd-mm-ch="' + esc(prev.id) + '"' : ' disabled')
            + ' aria-label="' + (prev ? 'Previous chapter: ' + esc(prev.title) : 'No previous chapter') + '">' + I.prev
            + '<span><small>Previous</small><span class="rd-mm-pg-t">' + (prev ? 'Ch ' + esc(chNum(prev, c.idx - 1)) + ' &middot; ' + esc(prev.title) : 'First chapter') + '</span></span></button>';
        h += '<button type="button" class="rd-mm-pg rd-mm-pg-next"' + (next ? ' data-rd-mm-ch="' + esc(next.id) + '"' : ' disabled')
            + ' aria-label="' + (next ? 'Next chapter: ' + esc(next.title) : 'No next chapter') + '">'
            + '<span><small>Next</small><span class="rd-mm-pg-t">' + (next ? 'Ch ' + esc(chNum(next, c.idx + 1)) + ' &middot; ' + esc(next.title) : 'Last chapter') + '</span></span>' + I.next + '</button>';
        h += '</div>';
        h += '</header>';
        return h;
    }

    function nodeHtml(c, seen, t, i) {
        var kinds = g('kinds') || {};
        var s = isSeen(seen, c.ch, t);
        return '<li><button type="button" class="rd-mm-node' + (s ? ' is-seen' : '') + '" data-rd-mm-open="' + esc(t.id) + '"'
            + ' aria-label="Open topic ' + esc(String(t.num || i + 1)) + ': ' + esc(t.title) + (s ? ' (opened)' : '') + '">'
            + '<span class="rd-mm-node-no">' + esc(String(t.num || i + 1)) + '</span>'
            + '<span class="rd-mm-node-body"><span class="rd-mm-node-t">' + esc(t.title) + '</span>'
            + (t.kind && kinds[t.kind] ? '<span class="rd-mm-node-k">' + esc(kinds[t.kind]) + '</span>' : '')
            + '</span>'
            + '<span class="rd-mm-node-tick" aria-hidden="true">' + I.check + '</span>'
            + '</button></li>';
    }

    function mapHtml(c, seen) {
        var topics = c.ch.topics;
        var n = topics.length;
        var oneSide = n <= 2;
        var half = oneSide ? 0 : Math.ceil(n / 2);
        var left = topics.slice(0, half);
        var right = topics.slice(half);
        var h = '<section class="rd-mm-map' + (oneSide ? ' is-one-side' : '') + '" aria-labelledby="rd-mm-map-h">';
        h += '<div class="rd-mm-sec-head"><h3 id="rd-mm-map-h" class="rd-mm-h3">Concept tree</h3>'
            + '<span class="rd-mm-sec-note">Select a topic to open its full explanation</span></div>';
        h += '<div class="rd-mm-tree">';
        h += '<svg class="rd-mm-edges" aria-hidden="true" focusable="false"></svg>';
        h += '<ol class="rd-mm-branch rd-mm-branch-l" role="list">';
        left.forEach(function (t, i) { h += nodeHtml(c, seen, t, i); });
        h += '</ol>';
        h += '<div class="rd-mm-core"><span class="rd-mm-core-k">Chapter ' + esc(chNum(c.ch, c.idx)) + '</span>'
            + '<span class="rd-mm-core-t">' + esc(c.ch.title) + '</span>'
            + '<span class="rd-mm-core-n">' + n + ' topic' + (n === 1 ? '' : 's') + '</span></div>';
        h += '<ol class="rd-mm-branch rd-mm-branch-r" role="list" start="' + (half + 1) + '">';
        right.forEach(function (t, i) { h += nodeHtml(c, seen, t, half + i); });
        h += '</ol>';
        h += '</div></section>';
        return h;
    }

    function topicHtml(c, seen, t, i) {
        var kinds = g('kinds') || {};
        var s = isSeen(seen, c.ch, t);
        var meta = [];
        if (t.kind && kinds[t.kind]) meta.push(esc(kinds[t.kind]));
        if (t.studyPage) meta.push('Study text p.&nbsp;' + esc(String(t.studyPage)));
        var h = '<li class="rd-mm-topic' + (s ? ' is-seen' : '') + '" id="rd-mm-t-' + esc(t.id) + '">';
        h += '<div class="rd-mm-topic-head">';
        h += '<span class="rd-mm-topic-no">' + esc(String(t.num || i + 1)) + '</span>';
        h += '<div class="rd-mm-topic-hd"><h4 class="rd-mm-topic-t">' + esc(t.title) + '</h4>'
            + (meta.length ? '<p class="rd-mm-topic-meta">' + meta.join('<span aria-hidden="true"> &middot; </span>') + '</p>' : '') + '</div>';
        h += '<span class="rd-mm-seen-tag">' + I.check + 'Opened</span>';
        h += '</div>';

        if (t.romanUrdu) {
            h += '<div class="rd-mm-ru"><span class="rd-mm-lbl">Roman Urdu</span><p>' + esc(t.romanUrdu) + '</p></div>';
        }
        if (t.formula) {
            h += '<div class="rd-mm-formula"><span class="rd-mm-lbl">Formula / rule</span>';
            String(t.formula).split(' ; ').forEach(function (f) { h += '<div class="rd-mm-formula-l">' + esc(f) + '</div>'; });
            h += '</div>';
        }
        if (Array.isArray(t.keyPoints) && t.keyPoints.length) {
            h += '<div class="rd-mm-kp"><span class="rd-mm-lbl">From the study text</span><ul>';
            t.keyPoints.slice(0, 3).forEach(function (k) {
                k = String(k);
                h += '<li>' + esc(k.length > 170 ? k.slice(0, 170) + '...' : k) + '</li>';
            });
            h += '</ul></div>';
        }
        if (t.examTip) {
            h += '<div class="rd-mm-tip"><span class="rd-mm-lbl">' + (isAcca(c.level) ? 'Exam tip' : 'ICAP exam tip') + '</span><p>' + esc(t.examTip) + '</p></div>';
        }
        if (Array.isArray(t.subNodes) && t.subNodes.length) {
            h += '<div class="rd-mm-covers"><span class="rd-mm-lbl">Covers</span><ul role="list">';
            t.subNodes.forEach(function (sn) { h += '<li>' + esc(sn) + '</li>'; });
            h += '</ul></div>';
        }
        h += '<div class="rd-mm-topic-foot"><button type="button" class="rd-mm-open" data-rd-mm-open="' + esc(t.id) + '">'
            + I.open + '<span>Open concept details</span></button></div>';
        h += '</li>';
        return h;
    }

    function topicsHtml(c, seen) {
        var h = '<section class="rd-mm-topics" aria-labelledby="rd-mm-topics-h">';
        h += '<div class="rd-mm-sec-head"><h3 id="rd-mm-topics-h" class="rd-mm-h3">Topics</h3>'
            + '<span class="rd-mm-sec-note">' + (isAcca(c.level) ? 'Roman Urdu explanation with exam focus' : 'Roman Urdu explanation with ICAP exam focus') + '</span></div>';
        h += '<ol class="rd-mm-topic-list" role="list">';
        c.ch.topics.forEach(function (t, i) { h += topicHtml(c, seen, t, i); });
        h += '</ol></section>';
        return h;
    }

    function notesHtml(c) {
        var ch = c.ch;
        var summary = ch.summary || [];
        var revision = ch.revision || [];
        if (!summary.length && !revision.length) return '';
        var count = summary.length + revision.length;
        var h = '<details class="rd-mm-notes" id="rd-mm-notes"' + (notesOpen ? ' open' : '') + '>';
        h += '<summary><span class="rd-mm-notes-hd"><span class="rd-mm-h3">Revision notes</span>'
            + '<span class="rd-mm-sec-note">From the study text &middot; ' + count + ' point' + (count === 1 ? '' : 's') + '</span></span>'
            + '<span class="rd-mm-chev">' + I.chev + '</span></summary>';
        h += '<div class="rd-mm-notes-body">';
        if (summary.length) {
            h += '<div class="rd-mm-notes-blk"><h4 class="rd-mm-lbl">At a glance</h4><ol>';
            summary.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
            h += '</ol></div>';
        }
        if (revision.length) {
            h += '<div class="rd-mm-notes-blk"><h4 class="rd-mm-lbl">Sticky notes</h4><ol>';
            revision.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; });
            h += '</ol></div>';
        }
        h += '</div></details>';
        return h;
    }

    function diagramHtml(c) {
        /* the CAF / ACCA study-text diagram, when the existing diagram layer has one */
        try {
            if (!window.cafMindMap || typeof window.cafMindMap.chapterMapHtml !== 'function') return '';
            var inner = window.cafMindMap.chapterMapHtml(c.subject.id, c.ch.id);
            if (!inner) return '';
            return '<details class="rd-mm-notes rd-mm-diagram"' + (diagramOpen ? ' open' : '') + '>'
                + '<summary><span class="rd-mm-notes-hd"><span class="rd-mm-h3">Study-text diagram</span>'
                + '<span class="rd-mm-sec-note">The full chapter map with sub-points, coloured by topic type</span></span>'
                + '<span class="rd-mm-chev">' + I.chev + '</span></summary>'
                + '<div class="rd-mm-notes-body">' + inner + '</div></details>';
        } catch (e) { return ''; }
    }

    /* ---------------- connectors ---------------- */
    function drawEdges() {
        var root = $('rd-mm-root');
        if (!root) return;
        var tree = root.querySelector('.rd-mm-tree');
        var svg = root.querySelector('.rd-mm-edges');
        var core = root.querySelector('.rd-mm-core');
        if (!tree || !svg || !core) return;
        var tr = tree.getBoundingClientRect();
        if (!tr.width) return;
        var cr = core.getBoundingClientRect();
        var outline = getComputedStyle(svg).display === 'none';
        if (outline) { svg.innerHTML = ''; return; }
        svg.setAttribute('width', Math.round(tr.width));
        svg.setAttribute('height', Math.round(tr.height));
        svg.setAttribute('viewBox', '0 0 ' + Math.round(tr.width) + ' ' + Math.round(tr.height));
        var cy = cr.top - tr.top + cr.height / 2;
        var parts = [];
        root.querySelectorAll('.rd-mm-node').forEach(function (n) {
            var r = n.getBoundingClientRect();
            var isLeft = !!n.closest('.rd-mm-branch-l');
            var ny = r.top - tr.top + r.height / 2;
            var x1 = isLeft ? cr.left - tr.left : cr.right - tr.left;
            var x2 = isLeft ? r.right - tr.left : r.left - tr.left;
            var mx = (x1 + x2) / 2;
            var d = 'M' + x1.toFixed(1) + ' ' + cy.toFixed(1) + ' C' + mx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + ny.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + ny.toFixed(1);
            parts.push('<path class="rd-mm-edge' + (n.classList.contains('is-seen') ? ' is-seen' : '') + '" d="' + d + '"/>');
            parts.push('<circle class="rd-mm-edge-dot' + (n.classList.contains('is-seen') ? ' is-seen' : '') + '" cx="' + x2.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="3"/>');
        });
        svg.innerHTML = parts.join('');
    }

    /* ---------------- render ---------------- */
    function ensureRoot() {
        var view = $('view-mindmaps');
        if (!view) return null;
        var layout = view.querySelector('.mm-layout');
        if (!layout) return null;
        var root = $('rd-mm-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'rd-mm-root';
            root.className = 'rd-mm';
            layout.appendChild(root);
            root.addEventListener('click', onClick);
            root.addEventListener('keydown', onKey);
            root.addEventListener('toggle', onToggle, true);
            if (typeof ResizeObserver === 'function') {
                ro = new ResizeObserver(function () { window.requestAnimationFrame(drawEdges); });
                ro.observe(root);
            } else {
                window.addEventListener('resize', function () { window.requestAnimationFrame(drawEdges); });
            }
        }
        return root;
    }

    function decorateSubjects() {
        var box = $('mm-subject-tabs-container');
        if (!box) return;
        var subjects = g('subjects') || [];
        box.querySelectorAll('.mm-subj-btn').forEach(function (b) {
            var m = /selectMMSubject\('([^']+)'\)/.exec(b.getAttribute('onclick') || '');
            var s = m && subjects.filter(function (x) { return x.id === m[1]; })[0];
            if (s && s.color) b.style.setProperty('--rd-mm-c', s.color);
            b.classList.add('rd-mm-subj');
            /* the app only re-renders the tabs on a track switch; keep the active one honest */
            if (m) b.classList.toggle('active', m[1] === g('subject'));
            if (b.classList.contains('active')) b.setAttribute('aria-pressed', 'true');
            else b.setAttribute('aria-pressed', 'false');
        });
    }

    function render() {
        if (rendering) return;
        rendering = true;
        try {
            var root = ensureRoot();
            if (!root) return;
            var layout = root.parentNode;
            var view = $('view-mindmaps');
            decorateSubjects();
            var c = context();
            if (!c) {
                /* nothing of ours to show: hand the area back to the original markup */
                layout.classList.remove('rd-mm-on');
                if (view) view.classList.remove('rd-mm-view');
                root.hidden = true;
                root.innerHTML = '';
                return;
            }
            var seen = readSeen();
            var focusCh = null, focusOpen = null;
            var ae = document.activeElement;
            if (ae && root.contains(ae)) {
                focusCh = ae.getAttribute('data-rd-mm-ch') && ae.classList.contains('rd-mm-ch') ? 'ch' : (ae.classList.contains('rd-mm-pg-prev') ? 'prev' : (ae.classList.contains('rd-mm-pg-next') ? 'next' : null));
                focusOpen = ae.getAttribute('data-rd-mm-open') ? { id: ae.getAttribute('data-rd-mm-open'), node: ae.classList.contains('rd-mm-node') } : null;
            }
            var scroller = root.querySelector('.rd-mm-chlist');
            var sl = scroller ? scroller.scrollLeft : 0;
            var st = scroller ? scroller.scrollTop : 0;

            var h = '<div class="rd-mm-grid">';
            h += chapterListHtml(c, seen);
            h += '<div class="rd-mm-main">';
            h += headHtml(c, seen);
            h += mapHtml(c, seen);
            h += topicsHtml(c, seen);
            h += notesHtml(c);
            h += diagramHtml(c);
            h += '</div></div>';
            root.innerHTML = h;
            root.hidden = false;
            root.setAttribute('data-level', c.level || '');
            layout.classList.add('rd-mm-on');
            if (view) view.classList.add('rd-mm-view');

            scroller = root.querySelector('.rd-mm-chlist');
            if (scroller) { scroller.scrollLeft = sl; scroller.scrollTop = st; }
            /* keep the active chapter visible in the list / chip strip */
            var act = root.querySelector('.rd-mm-ch.is-active');
            if (act && scroller) {
                var horiz = scroller.scrollWidth > scroller.clientWidth + 2;
                if (horiz) {
                    var l = act.parentNode.offsetLeft, w = act.parentNode.offsetWidth;
                    if (l < scroller.scrollLeft || l + w > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = Math.max(0, l - 16);
                } else if (scroller.scrollHeight > scroller.clientHeight + 2) {
                    var tp = act.parentNode.offsetTop, ht = act.parentNode.offsetHeight;
                    if (tp < scroller.scrollTop || tp + ht > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = Math.max(0, tp - 40);
                }
            }
            if (focusCh === 'ch' && act) act.focus({ preventScroll: true });
            else if (focusCh === 'prev' || focusCh === 'next') {
                var pg = root.querySelector('.rd-mm-pg-' + focusCh);
                if (pg && !pg.disabled) pg.focus({ preventScroll: true });
                else if (act) act.focus({ preventScroll: true });
            } else if (focusOpen) {
                var sel = (focusOpen.node ? '.rd-mm-node' : '.rd-mm-open') + '[data-rd-mm-open="' + (window.CSS && CSS.escape ? CSS.escape(focusOpen.id) : focusOpen.id) + '"]';
                var f = root.querySelector(sel);
                if (f) f.focus({ preventScroll: true });
            }
            drawEdges();
            window.requestAnimationFrame(drawEdges);
        } catch (e) {
            log(e);
            try {
                var lay = document.querySelector('#view-mindmaps .mm-layout');
                if (lay) lay.classList.remove('rd-mm-on');
                var r = $('rd-mm-root');
                if (r) r.hidden = true;
            } catch (x) { /* ignore */ }
        } finally {
            rendering = false;
        }
    }

    /* ---------------- events ---------------- */
    function goChapter(id) {
        if (!id || typeof window.selectMMChapter !== 'function') return;
        window.selectMMChapter(id); /* app re-renders the canvas -> wrapped -> render() */
        var head = document.querySelector('#rd-mm-root .rd-mm-head');
        if (head) {
            var r = head.getBoundingClientRect();
            if (r.top < 0 || r.top > window.innerHeight * 0.6) {
                try { head.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { head.scrollIntoView(); }
            }
        }
    }

    function onClick(e) {
        var t = e.target;
        var ch = t.closest && t.closest('[data-rd-mm-ch]');
        if (ch && !ch.disabled) { e.preventDefault(); goChapter(ch.getAttribute('data-rd-mm-ch')); return; }
        var op = t.closest && t.closest('[data-rd-mm-open]');
        if (op) {
            e.preventDefault();
            if (typeof window.openTopicModal === 'function') window.openTopicModal(op.getAttribute('data-rd-mm-open'));
            return;
        }
        var j = t.closest && t.closest('[data-rd-mm-jump]');
        if (j) {
            e.preventDefault();
            var n = $('rd-mm-notes');
            if (n) {
                n.open = true; notesOpen = true;
                try { n.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) { n.scrollIntoView(); }
                var s = n.querySelector('summary');
                if (s) s.focus({ preventScroll: true });
            }
        }
    }

    function onKey(e) {
        var t = e.target;
        if (!t.classList || !t.classList.contains('rd-mm-ch')) return;
        var keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: 'first', End: 'last' };
        var k = keys[e.key];
        if (!k) return;
        var all = Array.prototype.slice.call(document.querySelectorAll('#rd-mm-root .rd-mm-ch'));
        var i = all.indexOf(t);
        var to = k === 'first' ? 0 : k === 'last' ? all.length - 1 : Math.max(0, Math.min(all.length - 1, i + k));
        if (all[to]) { e.preventDefault(); all[to].focus(); all[to].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }

    function onToggle(e) {
        var d = e.target;
        if (!d || d.tagName !== 'DETAILS') return;
        if (d.classList.contains('rd-mm-diagram')) diagramOpen = d.open;
        else if (d.id === 'rd-mm-notes') notesOpen = d.open;
    }

    /* ---------------- hooks ---------------- */
    function wrap(name, after) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig.__rdMm) return false;
        var w = function () {
            var r = orig.apply(this, arguments);
            try { after(); } catch (e) { log(e); }
            return r;
        };
        w.__rdMm = true;
        window[name] = w;
        return true;
    }

    function onTopicOpened(topicId) {
        try {
            var found = typeof mmFindTopic === 'function' ? mmFindTopic(topicId) : null;
            if (!found || !found.chapter) return;
            var modal = $('mm-topic-modal');
            /* only count it when the modal really opened (plan lock returns early) */
            if (modal && modal.style.display === 'none') return;
            markSeen(found.chapter.id, topicId);
            if ($('rd-mm-root')) render();
        } catch (e) { log(e); }
    }

    function init() {
        try {
            if (!$('view-mindmaps')) return;
            wrap('renderMMCanvas', render);
            wrap('renderMMChaptersList', render);
            wrap('renderMMSubjectTabs', decorateSubjects);
            wrap('switchMMLevel', render);
            wrap('initMindMapsApp', render);
            var origOpen = window.openTopicModal;
            if (typeof origOpen === 'function' && !origOpen.__rdMm) {
                var w = function (topicId) {
                    var r = origOpen.apply(this, arguments);
                    onTopicOpened(topicId);
                    return r;
                };
                w.__rdMm = true;
                window.openTopicModal = w;
            }
            var canvas = $('mm-canvas-container');
            if (canvas && canvas.children.length) render();
        } catch (e) { log(e); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

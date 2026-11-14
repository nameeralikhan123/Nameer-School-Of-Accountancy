# -*- coding: utf-8 -*-
"""One-off record: add the premium revision features to the shared engine
(_frag_revision_engine.js). Every edit asserts its anchor exists once."""
import io, sys

P = '_build/fragments/_frag_revision_engine.js'
s = io.open(P, encoding='utf-8').read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit('edit %r: expected %d, found %d' % (old[:90], count, n))
    s = s.replace(old, new)


# ---------------------------------------------------------------- modes + state
rep("""    var MODES = [
        ['full', 'Complete mind map'],
        ['five', '5-minute revision'],
        ['last', 'Last-minute sheet']
    ];""", """    var MODES = [
        ['map', 'Visual mind map'],
        ['full', 'Detailed map'],
        ['five', '5-minute revision'],
        ['last', 'Last-minute sheet'],
        ['cmp', 'Comparisons']
    ];
    var MODE_NAME = { map: 'Visual mind map', full: 'Complete mind map', five: '5-minute revision', last: 'Last-minute revision', cmp: 'Comparisons' };
    var ST = { none: 'Not started', progress: 'In progress', revised: 'Revised', practice: 'Needs more practice' };""")
rep("""        view: 'home', level: 'all', subjectId: null, chapterId: null, mode: 'full',""",
    """        view: 'home', level: 'all', subjectId: null, chapterId: null, mode: 'map',
        vopen: {}, vz: null, vx: 0, vy: 0, vsel: null,""")

# ---------------------------------------------------------------- progress store
rep("""        if (r.s === 'revised') return 'revised';
        var done = Object.keys(r.t || {}).filter(function (k) { return r.t[k]; }).length;""",
    """        if (r.s === 'revised' || r.s === 'practice' || r.s === 'none') return r.s;
        var done = Object.keys(r.t || {}).filter(function (k) { return r.t[k]; }).length;""")
rep("""        if (!r.s || r.s === 'none') r.s = 'progress';
        r.at = nowIso();""", """        if (!r.s || r.s === 'none') r.s = 'progress';
        r.at = nowIso();
        r.la = r.at;""")
rep("""        if (on) r.t[bid] = 1; else delete r.t[bid];
        var done = Object.keys(r.t).length;
        r.s = done >= contentBranches(c).length ? 'revised' : 'progress';""",
    """        if (on) { r.t[bid] = 1; if (r.nr) delete r.nr[bid]; } else delete r.t[bid];
        var done = Object.keys(r.t).length;
        if (r.s !== 'practice') r.s = done >= contentBranches(c).length ? 'revised' : 'progress';
        if (r.s === 'revised') r.lr = nowIso();""")
a = s.index('    function setChapterRevised(c, on) {')
b = s.index('    function subjProgress(s) {')
s = s[:a] + """    function setChapterStatus(c, st) {
        var r = store.ch[c.id] || { t: {} };
        r.s = st;
        r.at = nowIso();
        r.t = r.t || {};
        if (st === 'revised') { r.lr = r.at; contentBranches(c).forEach(function (b) { r.t[b.id] = 1; }); }
        if (st === 'none') r.t = {};
        store.ch[c.id] = r;
        save();
    }
    function setNeeds(c, bid, on) {
        var r = store.ch[c.id] || { s: 'progress', t: {} };
        r.nr = r.nr || {};
        if (on) { r.nr[bid] = 1; if (r.t) delete r.t[bid]; } else delete r.nr[bid];
        r.at = nowIso();
        store.ch[c.id] = r;
        save();
    }
    function setRecall(c, nid, on) {
        var r = store.ch[c.id] || { s: 'progress', t: {} };
        r.rc = r.rc || {};
        if (on) r.rc[nid] = 1; else delete r.rc[nid];
        r.at = nowIso();
        store.ch[c.id] = r;
        save();
    }
    function dateStr(iso) {
        try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return String(iso).slice(0, 10); }
    }
    /* chapters marked "needs more practice" and topics flagged "needs revision" */
    function weakList() {
        var out = [];
        subjects().forEach(function (s) {
            s.chapters.forEach(function (c) {
                var r = chRec(c.id);
                if (!r) return;
                if (r.s === 'practice') out.push({ s: s, c: c, b: null });
                Object.keys(r.nr || {}).forEach(function (bid) {
                    var b = c.branches.filter(function (x) { return x.id === bid; })[0];
                    if (b) out.push({ s: s, c: c, b: b });
                });
            });
        });
        return out;
    }
""" + s[b:]
rep("""        var n = { revised: 0, progress: 0, none: 0 };""", """        var n = { revised: 0, progress: 0, practice: 0, none: 0 };""")

# ---------------------------------------------------------------- icons + cards
rep("""        x: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>'""",
    """        x: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>',
        flag: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 22V4m0 0h12l-2 4 2 4H4"/></svg>',
        fit: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'""")
rep("""            h += '<div class="rv-card rv-c-exam"><span class="rv-ic">' + I.warn + '</span><span>' + mark(it.text) + '</span></div>';""",
    """            h += '<div class="rv-card rv-c-exam"><span class="rv-ic">' + I.warn + '</span><span><span class="rv-tag">Exam point</span>' + mark(it.text) + '</span></div>';""")
rep("""            h += '<div class="rv-card rv-c-x"><span class="rv-ic">' + I.x + '</span><span>' + mark(it.text) + '</span></div>';""",
    """            h += '<div class="rv-card rv-c-x"><span class="rv-ic">' + I.x + '</span><span><span class="rv-tag">Exception / warning</span>' + mark(it.text) + '</span></div>';
        } else if (it.t === 'tip') {
            h += '<div class="rv-card rv-c-tip"><span class="rv-tag">Memory tip</span><span>' + mark(it.text) + '</span></div>';""")
rep("""                + it.rows.slice(1).map(function (r) {
                    return '<tr>' + r.map(""", """                + it.rows.slice(1).map(function (r, ri) {
                    var kr = it.kr && it.kr.indexOf(ri + 1) >= 0;
                    return '<tr' + (kr ? ' class="rv-krow" title="Decisive difference"' : '') + '>' + r.map(""")

# ---------------------------------------------------------------- topic controls
rep("""        var done = !!(r && r.t && r.t[b.id]);
        var col = ui.collapsed[b.id];""", """        var done = !!(r && r.t && r.t[b.id]);
        var nr = !!(r && r.nr && r.nr[b.id]);
        var col = ui.collapsed[b.id];""")
rep("""            + '<label class="rv-done-tg" title="Mark this topic as revised"><input type="checkbox" data-topic="' + esc(b.id) + '"' + (done ? ' checked' : '') + '><span>' + I.check + '</span></label>'""",
    """            + '<button type="button" class="rv-flag' + (nr ? ' on' : '') + '" data-needs="' + esc(b.id) + '" aria-pressed="' + nr + '" title="' + (nr ? 'Flagged: needs revision' : 'Flag this topic as needing revision') + '">' + I.flag + '</button>'
            + '<label class="rv-done-tg" title="Mark this topic as understood"><input type="checkbox" data-topic="' + esc(b.id) + '"' + (done ? ' checked' : '') + ' aria-label="Understood"><span>' + I.check + '</span></label>'""")
rep("""        return '<section class="rv-branch rv-k-' + b.kind + (col ? ' rv-closed' : '') + (done ? ' rv-done' : '') + '" id="' + esc(b.id)""",
    """        return '<section class="rv-branch rv-k-' + b.kind + (col ? ' rv-closed' : '') + (done ? ' rv-done' : '') + (nr ? ' rv-weak' : '') + '" id="' + esc(b.id)""")

# ---------------------------------------------------------------- subject page
rep("""            + '<span class="rv-pill rv-pill-' + st + '">' + ({ none: 'Not started', progress: 'In progress', revised: 'Revised' })[st] + '</span></article>';""",
    """            + '<span class="rv-pill rv-pill-' + st + '">' + ST[st] + '</span></article>';""")
rep("""            + c.branches.length + ' topics &middot; ' + nKey + ' key points' + (nF ? ' &middot; ' + nF + ' formulas' : '') + (nJ ? ' &middot; ' + nJ + ' journal entries' : '') + '</div>'""",
    """            + c.branches.length + ' topics &middot; ' + nKey + ' key points' + (nF ? ' &middot; ' + nF + ' formulas' : '') + (nJ ? ' &middot; ' + nJ + ' journal entries' : '')
            + (chRec(c.id) && chRec(c.id).lr ? ' &middot; last revised ' + dateStr(chRec(c.id).lr) : '') + '</div>'""")
rep("""[['all', 'All'], ['none', 'Not started'], ['progress', 'In progress'], ['revised', 'Revised']]""",
    """[['all', 'All'], ['none', 'Not started'], ['progress', 'In progress'], ['revised', 'Revised'], ['practice', 'Needs practice']]""")
rep("""            + '<p class="rv-smeta">' + p.revised + ' revised &middot; ' + p.progress + ' in progress &middot; ' + p.none + ' not started</p></div>'""",
    """            + '<p class="rv-smeta">' + p.revised + ' revised &middot; ' + p.progress + ' in progress &middot; ' + p.practice + ' need more practice &middot; ' + p.none + ' not started</p></div>'""")

# ---------------------------------------------------------------- home dashboard
a = s.index('    function homeHtml() {')
b = s.index('    function tocNum(num)')
s = s[:a] + r"""    function stackBar(p) {
        function w(n) { return p.total ? (100 * n / p.total).toFixed(1) : 0; }
        return '<span class="rv-sbar" aria-hidden="true"><i class="rv-sb-r" style="width:' + w(p.revised) + '%"></i><i class="rv-sb-p" style="width:' + w(p.progress) + '%"></i><i class="rv-sb-x" style="width:' + w(p.practice) + '%"></i></span>';
    }
    function homeHtml() {
        var subs = subjects();
        var lv = levels();
        if (ui.level !== 'all' && lv.indexOf(ui.level) < 0) ui.level = 'all';
        var shown = subs.filter(function (s) { return ui.level === 'all' || s.level === ui.level; });
        var T = { total: 0, none: 0, progress: 0, revised: 0, practice: 0 };
        shown.forEach(function (s) { var p = subjProgress(s); Object.keys(T).forEach(function (k) { T[k] += p[k]; }); });
        var pct = T.total ? Math.round(100 * T.revised / T.total) : 0;
        var bms = Object.keys(store.bm).filter(isBm).length;
        var weak = weakList().length;
        function tile(label, n, k) { return '<div class="rv-tile' + (k ? ' rv-tile-' + k : '') + '"><b>' + n + '</b><span>' + label + '</span></div>'; }
        var h = '<div class="rv-hero"><div><div class="rv-kicker">' + esc(TXT.kicker) + '</div>'
            + '<h2>' + esc(TXT.title) + '</h2><p>' + esc(TXT.intro) + '</p>'
            + '<div class="rv-hero-acts"><button type="button" class="rv-btn" data-act="bookmarks">' + I.star + ' Bookmarks (' + bms + ')</button>'
            + '<button type="button" class="rv-btn" data-act="weak">' + I.flag + ' Revisit difficult topics (' + weak + ')</button>'
            + (CFG.classic ? '<button type="button" class="rv-btn rv-btn-ghost" data-act="classic" title="The earlier topic maps">Classic topic maps</button>' : '') + '</div></div>'
            + '<div class="rv-dash" aria-label="Revision progress' + (ui.level !== 'all' ? ' for ' + esc(ui.level) : '') + '">'
            + tile('Total chapters', T.total, '') + tile('Not started', T.none, 'none') + tile('In progress', T.progress, 'progress')
            + tile('Revised', T.revised, 'revised') + tile('Needs practice', T.practice, 'practice')
            + '<div class="rv-dash-pct"><b>' + pct + '%</b><span>revision complete</span><span class="rv-bar"><i style="width:' + pct + '%"></i></span></div></div></div>';
        h += '<div class="rv-search-lib">' + I.search + '<input type="search" class="js-libq" placeholder="' + esc(TXT.search) + '" value="' + esc(ui.libQuery) + '" aria-label="Search all mind maps"></div>';
        h += '<div class="js-libres"></div>';
        h += '<div class="rv-step">1 &middot; ' + esc(TXT.groupStep) + '</div><div class="rv-chips">'
            + [['all', TXT.allGroups]].concat(lv.map(function (l) { return [l, l]; })).map(function (l) {
                return '<button type="button" class="rv-chip' + (ui.level === l[0] ? ' on' : '') + '" data-level="' + esc(l[0]) + '">' + esc(l[1]) + '</button>';
            }).join('') + '</div>';
        h += '<div class="rv-step">2 &middot; ' + esc(TXT.subjectStep) + '</div>';
        if (!shown.length) h += '<div class="rv-empty">' + esc(TXT.empty) + '</div>';
        var group = null;
        shown.forEach(function (s) {
            if (s.level !== group) {
                if (group !== null) h += '</div>';
                group = s.level;
                h += '<div class="rv-level-h">' + esc(group) + '</div><div class="rv-cards">';
            }
            var p = subjProgress(s), col = subjColor(s);
            var last = store.last[s.id] && chapter(s, store.last[s.id].c);
            var planned = s.plannedChapters || p.total;
            h += '<article class="rv-scard" style="--sc:' + col + '">'
                + '<button type="button" class="rv-scard-main" data-subject="' + esc(s.id) + '">'
                + '<span class="rv-sicon">' + subjIcon(s) + '</span>'
                + '<span class="rv-scode">' + esc(s.code) + '</span><span class="rv-sname">' + esc(s.name) + '</span>'
                + '<span class="rv-smeta">' + p.total + (planned > p.total ? ' of ' + planned : '') + ' chapter maps &middot; ' + p.revised + ' revised &middot; '
                + p.progress + ' in progress' + (p.practice ? ' &middot; ' + p.practice + ' need practice' : '') + '</span>'
                + stackBar(p) + '<span class="rv-pct">' + p.pct + '% revised</span></button>'
                + (last ? '<button type="button" class="rv-continue" data-open="' + esc(s.id) + '|' + esc(last.id) + '">Continue: Ch ' + esc(last.num) + ' ' + esc(last.title) + '</button>'
                    : '<span class="rv-continue rv-muted">' + (p.total ? 'Not started yet' : 'Maps in preparation') + '</span>')
                + (s.note ? '<p class="rv-snote">' + esc(s.note) + '</p>' : '')
                + '</article>';
        });
        if (group !== null) h += '</div>';
        return h;
    }

""" + s[b:]

# ---------------------------------------------------------------- chapter view
rep("""            + '<button type="button" class="rv-status rv-st-' + st + '" data-act="revised">' + (st === 'revised' ? I.check + ' Revised' : 'Mark chapter revised') + '</button></div>';""",
    """            + statusCtl(c) + '</div>';""")
rep("""            + '<span class="rv-zoomv">' + Math.round(ui.zoom * 100) + '%</span>'""",
    """            + '<span class="rv-zoomv">' + Math.round((ui.mode === 'map' ? (ui.vz || 1) : ui.zoom) * 100) + '%</span>'""")
rep("""<div class="rv-zoom" style="zoom:' + ui.zoom + '">';""", """<div class="rv-zoom" style="zoom:' + (ui.mode === 'map' ? 1 : ui.zoom) + '">';""")
rep("""            + esc(({ full: 'Complete mind map', five: '5-minute revision', last: 'Last-minute revision' })[ui.mode]) + '</div>';""",
    """            + esc(MODE_NAME[ui.mode]) + '</div>';""")
rep("""        if (ui.mode === 'last') {
            h += center + lastHtml(s, c);
        } else {""", """        if (ui.mode === 'map') {
            h += vizShell();
        } else if (ui.mode === 'cmp') {
            h += center + compareHtml(s, c);
        } else if (ui.mode === 'last') {
            h += center + lastHtml(s, c);
        } else {
            if (ui.mode === 'five') h += fiveHead(c);""")
rep("""                + '<div class="rv-col rv-col-r">' + right.map(function (x) { return branchHtml(s, c, x[0], x[1]); }).join('') + '</div></div>';
        }""", """                + '<div class="rv-col rv-col-r">' + right.map(function (x) { return branchHtml(s, c, x[0], x[1]); }).join('') + '</div></div>';
            if (ui.mode === 'five') h += checklistHtml(c);
        }""")

# new views: status control, 5-minute progress + checklist, comparisons, visual map
a = s.index('    function legendHtml() {')
s = s[:a] + r"""    function statusCtl(c) {
        var st = chStatus(c), r = chRec(c.id) || {};
        return '<div class="rv-stctl" role="group" aria-label="Chapter revision status">' + ['none', 'progress', 'revised', 'practice'].map(function (k) {
            return '<button type="button" class="rv-stb rv-stb-' + k + (st === k ? ' on' : '') + '" data-status="' + k + '" aria-pressed="' + (st === k) + '">'
                + (k === 'revised' ? I.check + ' ' : k === 'practice' ? I.flag + ' ' : '') + ST[k] + '</button>';
        }).join('') + '</div><div class="rv-lr">' + (r.lr ? 'Last revised ' + esc(dateStr(r.lr)) : 'Not yet marked as revised')
            + (r.la ? ' &middot; last opened ' + esc(dateStr(r.la)) : '') + '</div>';
    }

    /* 5-minute mode: progress over the topics shown + the quick-recall checklist */
    function fiveCounts(c) {
        var r = chRec(c.id) || {}, bs = branchesFor(c);
        var rec = c.branches.filter(function (b) { return b.kind === 'recall'; })[0];
        var ri = rec ? rec.items : [];
        var t = bs.filter(function (b) { return r.t && r.t[b.id]; }).length;
        var k = ri.filter(function (it) { return r.rc && r.rc[it.id]; }).length;
        return { t: t, tn: bs.length, k: k, kn: ri.length, pct: (bs.length + ri.length) ? Math.round(100 * (t + k) / (bs.length + ri.length)) : 0 };
    }
    function fiveHead(c) {
        var n = fiveCounts(c);
        return '<div class="rv-five" role="status"><div><b>5-minute revision</b><span>' + n.t + ' of ' + n.tn + ' topics understood &middot; '
            + n.k + ' of ' + n.kn + ' recall points checked</span></div><span class="rv-bar rv-bar-lg"><i style="width:' + n.pct + '%"></i></span><b class="rv-five-pct">' + n.pct + '%</b></div>';
    }
    function checklistHtml(c) {
        var rec = c.branches.filter(function (b) { return b.kind === 'recall'; })[0];
        if (!rec) return '';
        var r = chRec(c.id) || {};
        return '<section class="rv-check"><h4>' + I.check + ' Final quick-recall checklist</h4><p class="rv-muted">Tick each point you can recall without looking.</p><ul>'
            + rec.items.map(function (it) {
                var on = !!(r.rc && r.rc[it.id]);
                return '<li data-node="' + esc(it.id) + '"><label><input type="checkbox" data-rc="' + esc(it.id) + '"' + (on ? ' checked' : '') + '> <span>' + mark(it.text) + '</span></label></li>';
            }).join('') + '</ul></section>';
    }

    /* comparisons: every table of the chapter, decisive rows starred, with the
       branch's memory tips, exam traps and examples beside it */
    function compareHtml(s, c) {
        var out = [];
        c.branches.forEach(function (b) {
            var tables = [], extras = [];
            walk(b.items, function (it) {
                if (it.t === 'table') tables.push(it);
                else if (it.t === 'tip' || it.t === 'exam' || it.t === 'eg') extras.push(it);
            });
            if (!tables.length) return;
            var k = KIND[b.kind] || KIND.concept;
            out.push('<section class="rv-cmp" style="--kc:' + k.c + '"><header><span class="rv-bkind">' + esc(k.label) + '</span><h4>' + mark(b.title) + '</h4>'
                + (b.page ? '<button type="button" class="rv-pg" data-page="' + b.page[0] + '">' + I.book + ' ' + pages(b.page) + '</button>' : '') + '</header>'
                + tables.map(function (t) { return nodeHtml(t, 0).replace(/^<li[^>]*>|<\/li>$/g, ''); }).join('')
                + (extras.length ? '<ul class="rv-tree rv-cmp-x">' + extras.map(function (x) { return nodeHtml(Object.assign({}, x, { kids: null }), 0); }).join('') + '</ul>' : '')
                + '</section>');
        });
        if (!out.length) return '<div class="rv-empty">This chapter has no side-by-side comparison. Use the visual map or the 5-minute mode.</div>';
        return '<div class="rv-cmps"><p class="rv-muted">Highlighted rows (&#9733;) hold the decisive difference to remember.</p>' + out.join('') + '</div>';
    }

    /* ------------------------------------------------------------ visual mind map
       A real node-link diagram: chapter in the centre, branches alternating right
       and left, sub-nodes fanning outwards. Nodes are measured after render and
       laid out as a tidy tree (each subtree gets its own vertical band), so they
       never overlap; curved SVG connectors with arrowheads join parent to child.
       Pan by dragging, zoom with the toolbar / Ctrl+scroll / pinch, expand and
       collapse with the +n / - buttons, select a node for its full card. */
    var VTAG = { def: 'Definition', f: 'Formula', je: 'Journal entry', exam: 'Exam point', x: 'Exception', eg: 'Example', table: 'Comparison', dq: 'Decision', tip: 'Memory tip' };
    var GAP_Y = 12, GAP_B = 26, GAP_X = 56, PAD = 40;
    function vizShell() {
        return '<div class="rv-viz js-viz" aria-label="Visual mind map">'
            + '<div class="rv-viz-canvas js-vcanvas"><svg class="rv-viz-lines js-vlines" aria-hidden="true"></svg><div class="rv-viz-nodes js-vnodes"></div></div>'
            + '<div class="rv-viz-ctl"><button type="button" class="rv-ib" data-act="fit" title="Fit the map to the screen" aria-label="Fit to screen">' + I.fit + '</button>'
            + '<button type="button" class="rv-ib" data-act="zin" aria-label="Zoom in">+</button><button type="button" class="rv-ib" data-act="zout" aria-label="Zoom out">&minus;</button></div>'
            + '<div class="rv-viz-hint">Drag to move &middot; pinch or Ctrl + scroll to zoom &middot; select a node for its full card</div>'
            + '<aside class="rv-viz-detail js-vdetail" hidden></aside></div>';
    }
    function vlabel(it) {
        if (it.t === 'def' || it.t === 'f') return it.term;
        if (it.t === 'table') return (it.rows[0] || []).slice(1).join(' vs ') || 'Comparison table';
        var t = String(it.text || '');
        return t.length > 140 ? t.slice(0, 137) + '...' : t;
    }
    function vizTree(c) {
        var q = ui.query.length >= 2 ? ui.query.toLowerCase() : '';
        function hit(it) { return q && (textOf(it).toLowerCase().indexOf(q) >= 0 || (it.kids || []).some(hit)); }
        function item(it, b) {
            var kids = it.kids || [];
            var open = !!ui.vopen[it.id] || (q && kids.some(hit));
            return { id: it.id, it: it, b: b, nk: kids.length, open: open, kids: open ? kids.map(function (k) { return item(k, b); }) : [] };
        }
        return { id: c.id, root: true, kids: c.branches.map(function (b, i) {
            var open = ui.vopen[b.id] !== 0 || (q && b.items.some(hit));
            return { id: b.id, br: b, no: i + 1, nk: b.items.length, open: open, kids: open ? b.items.map(function (it) { return item(it, b); }) : [] };
        }) };
    }
    function vtog(n) {
        return n.nk ? '<button type="button" class="rv-vn-tog" data-vtog="' + esc(n.id) + '" aria-expanded="' + n.open + '" aria-label="' + (n.open ? 'Collapse' : 'Expand') + '">' + (n.open ? '&minus;' : '+' + n.nk) + '</button>' : '';
    }
    function vnodeHtml(n, s, c) {
        if (n.root) {
            return '<div class="rv-vn rv-vn-root" style="--kc:' + subjColor(s) + '"><small>' + esc(s.code) + ' &middot; Chapter ' + esc(c.num) + '</small><b>' + mark(c.title) + '</b>'
                + '<span class="rv-pill rv-pill-' + chStatus(c) + '">' + ST[chStatus(c)] + '</span></div>';
        }
        var r = chRec(c.id) || {};
        if (n.br) {
            var k = KIND[n.br.kind] || KIND.concept;
            var d = !!(r.t && r.t[n.br.id]), nr = !!(r.nr && r.nr[n.br.id]);
            return '<div class="rv-vn rv-vn-br' + (d ? ' done' : '') + (nr ? ' weak' : '') + (ui.vsel === n.id ? ' sel' : '') + '" style="--kc:' + k.c + '">'
                + '<button type="button" class="rv-vn-main" data-vsel="' + esc(n.id) + '"><small>' + esc(k.label) + (d ? ' &middot; understood' : '') + (nr ? ' &middot; needs revision' : '') + '</small>'
                + '<b><span class="rv-num">' + n.no + '</span>' + mark(n.br.title) + '</b></button>' + vtog(n) + '</div>';
        }
        var it = n.it, kk = KIND[n.b.kind] || KIND.concept;
        var tag = VTAG[it.t] || (it.k ? 'Key point' : '');
        return '<div class="rv-vn rv-vn-it rv-vt-' + it.t + (it.k ? ' rv-key' : '') + (ui.vsel === n.id ? ' sel' : '') + '" style="--kc:' + kk.c + '">'
            + '<button type="button" class="rv-vn-main" data-vsel="' + esc(n.id) + '">' + (tag ? '<small>' + tag + '</small>' : '')
            + '<span class="rv-vn-t">' + mark(vlabel(it)) + '</span></button>' + vtog(n)
            + (isBm(it.id) ? '<i class="rv-vn-star" title="Bookmarked">' + I.star + '</i>' : '') + '</div>';
    }
    function drawViz() {
        var x = currentChapter(), box = $('.js-viz');
        if (!box || !x.c) return;
        var tree = vizTree(x.c), flat = [];
        (function f(n, side, parent) {
            n.side = side; n.parent = parent; flat.push(n);
            n.kids.forEach(function (k, i) { f(k, n.root ? (i % 2 ? 'L' : 'R') : side, n); });
        })(tree, '', null);
        var holder = $('.js-vnodes');
        holder.innerHTML = flat.map(function (n) { return vnodeHtml(n, x.s, x.c); }).join('');
        flat.forEach(function (n, i) { n.el = holder.children[i]; n.w = n.el.offsetWidth; n.h = n.el.offsetHeight; });
        function band(n) {
            if (!n.kids.length) return (n.sh = n.h);
            var t = 0;
            n.kids.forEach(function (k) { t += band(k); });
            n.kh = t + GAP_Y * (n.kids.length - 1);
            return (n.sh = Math.max(n.h, n.kh));
        }
        function place(n, edge, top, dir) {
            n.x = dir > 0 ? edge : edge - n.w;
            n.y = top + (n.sh - n.h) / 2;
            var ty = top + (n.sh - (n.kh || 0)) / 2;
            n.kids.forEach(function (k) { place(k, dir > 0 ? n.x + n.w + GAP_X : n.x - GAP_X, ty, dir); ty += k.sh + GAP_Y; });
        }
        var R = tree.kids.filter(function (b) { return b.side === 'R'; }), L = tree.kids.filter(function (b) { return b.side === 'L'; });
        function sideH(list) { var t = 0; list.forEach(function (b) { t += band(b); }); return t + GAP_B * Math.max(0, list.length - 1); }
        var hR = sideH(R), hL = sideH(L), H = Math.max(hR, hL, tree.h);
        tree.x = -tree.w / 2; tree.y = (H - tree.h) / 2;
        var ty = (H - hR) / 2;
        R.forEach(function (b) { place(b, tree.w / 2 + GAP_X * 1.4, ty, 1); ty += b.sh + GAP_B; });
        ty = (H - hL) / 2;
        L.forEach(function (b) { place(b, -tree.w / 2 - GAP_X * 1.4, ty, -1); ty += b.sh + GAP_B; });
        var minX = 0, maxX = 0;
        flat.forEach(function (n) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); });
        var dx = PAD - minX, W = maxX - minX + 2 * PAD, HH = H + 2 * PAD;
        flat.forEach(function (n) { n.x += dx; n.y += PAD; n.el.style.transform = 'translate(' + Math.round(n.x) + 'px,' + Math.round(n.y) + 'px)'; });
        var cv = $('.js-vcanvas');
        cv.style.width = W + 'px'; cv.style.height = HH + 'px';
        var mk = CFG.rootId + '-arr';
        var paths = flat.filter(function (n) { return n.parent; }).map(function (n) {
            var p = n.parent, dir = n.side === 'R' ? 1 : -1;
            var sx = dir > 0 ? p.x + p.w : p.x, sy = p.y + p.h / 2, ex = dir > 0 ? n.x : n.x + n.w, ey = n.y + n.h / 2, mx = (sx + ex) / 2;
            var col = (KIND[(n.br || n.b).kind] || KIND.concept).c;
            return '<path d="M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' C' + mx.toFixed(1) + ' ' + sy.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + ey.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1)
                + '" stroke="' + col + '" stroke-width="' + (p.root ? 3 : 1.7) + '" fill="none" marker-end="url(#' + mk + ')" opacity="' + (p.root ? 0.9 : 0.75) + '"/>';
        }).join('');
        var svg = $('.js-vlines');
        svg.setAttribute('width', W); svg.setAttribute('height', HH); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + HH);
        svg.innerHTML = '<defs><marker id="' + mk + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="rv-viz-arrow"/></marker></defs>' + paths;
        ui._root = { x: tree.x + tree.w / 2, y: tree.y + tree.h / 2, W: W, H: HH };
        if (ui.vz == null) fitViz(); else applyViz();
    }
    function applyViz() {
        var cv = $('.js-vcanvas');
        if (cv) cv.style.transform = 'translate(' + Math.round(ui.vx) + 'px,' + Math.round(ui.vy) + 'px) scale(' + ui.vz + ')';
        var zv = $('.rv-zoomv');
        if (zv) zv.textContent = Math.round(ui.vz * 100) + '%';
    }
    function fitViz() {
        var box = $('.js-viz'), R0 = ui._root;
        if (!box || !R0) return;
        var W = box.clientWidth, H = box.clientHeight;
        var z = Math.min(1, (W - 16) / R0.W, (H - 16) / R0.H);
        if (z < 0.55) {
            /* too big to fit legibly (phones): start readable, centred on the chapter node */
            ui.vz = W < 640 ? 0.7 : 0.6;
            ui.vx = W / 2 - R0.x * ui.vz;
            ui.vy = H / 2 - R0.y * ui.vz;
        } else {
            ui.vz = z;
            ui.vx = (W - R0.W * z) / 2;
            ui.vy = (H - R0.H * z) / 2;
        }
        applyViz();
    }
    function zoomViz(f, px, py) {
        var box = $('.js-viz');
        if (!box) return;
        if (px == null) { px = box.clientWidth / 2; py = box.clientHeight / 2; }
        var nz = Math.max(0.3, Math.min(2, ui.vz * f));
        ui.vx = px - (px - ui.vx) * nz / ui.vz;
        ui.vy = py - (py - ui.vy) * nz / ui.vz;
        ui.vz = nz;
        applyViz();
    }
    function findItem(c, id) {
        var out = null;
        c.branches.forEach(function (b) {
            if (b.id === id) out = { b: b, it: null };
            walk(b.items, function (it) { if (it.id === id) out = { b: b, it: it }; });
        });
        return out;
    }
    function showDetail(id) {
        var x = currentChapter(), d = $('.js-vdetail');
        if (!d || !x.c) return;
        var f = findItem(x.c, id);
        if (!f) { d.hidden = true; ui.vsel = null; return; }
        var body = f.it ? '<ul class="rv-tree">' + nodeHtml(f.it, 0) + '</ul>' : branchHtml(x.s, x.c, f.b, 0);
        d.innerHTML = '<div class="rv-viz-dh"><span>' + esc((KIND[f.b.kind] || KIND.concept).label) + (f.it ? ' &rsaquo; ' + esc(f.b.title) : '') + '</span>'
            + '<button type="button" class="rv-ib" data-act="closedetail" aria-label="Close details">' + I.x + '</button></div>' + body;
        d.hidden = false;
    }
    var vDrag = { ptrs: {}, moved: false, sx: 0, sy: 0, d0: 0, z0: 1 };
    function vizDown(e) {
        var box = e.target.closest && e.target.closest('.js-viz');
        if (!box || e.target.closest('button, a, input, .js-vdetail')) return;
        vDrag.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        vDrag.moved = false;
        try { box.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        var ids = Object.keys(vDrag.ptrs);
        if (ids.length === 2) {
            var a = vDrag.ptrs[ids[0]], b = vDrag.ptrs[ids[1]];
            vDrag.d0 = Math.hypot(a.x - b.x, a.y - b.y); vDrag.z0 = ui.vz;
        }
        box.classList.add('rv-grab');
    }
    function vizMove(e) {
        var p = vDrag.ptrs[e.pointerId];
        if (!p) return;
        var ids = Object.keys(vDrag.ptrs);
        if (ids.length === 1) {
            var dx = e.clientX - p.x, dy = e.clientY - p.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) vDrag.moved = true;
            ui.vx += dx; ui.vy += dy;
            applyViz();
        }
        p.x = e.clientX; p.y = e.clientY;
        if (ids.length === 2 && vDrag.d0) {
            var a = vDrag.ptrs[ids[0]], b = vDrag.ptrs[ids[1]], box = $('.js-viz'), rc = box.getBoundingClientRect();
            var d = Math.hypot(a.x - b.x, a.y - b.y);
            vDrag.moved = true;
            zoomViz((vDrag.z0 * d / vDrag.d0) / ui.vz, (a.x + b.x) / 2 - rc.left, (a.y + b.y) / 2 - rc.top);
        }
    }
    function vizUp(e) {
        delete vDrag.ptrs[e.pointerId];
        if (!Object.keys(vDrag.ptrs).length) { var box = $('.js-viz'); if (box) box.classList.remove('rv-grab'); vDrag.d0 = 0; }
    }
    function vizWheel(e) {
        if (!(e.ctrlKey || e.metaKey) || !e.target.closest || !e.target.closest('.js-viz') || e.target.closest('.js-vdetail')) return;
        e.preventDefault();
        var rc = $('.js-viz').getBoundingClientRect();
        zoomViz(Math.exp(-e.deltaY * 0.0015), e.clientX - rc.left, e.clientY - rc.top);
    }

""" + s[a:]

# ---------------------------------------------------------------- render / events
rep("""        if (ui.panel) h += bookmarksHtml();""", """        if (ui.panel === 'weak') h += weakHtml(); else if (ui.panel) h += bookmarksHtml();""")
rep("""        if (ui.view === 'chapter') countHits();""", """        if (ui.view === 'chapter' && ui.mode === 'map') { drawViz(); if (ui.vsel) showDetail(ui.vsel); }
        if (ui.view === 'chapter') countHits();""")
a = s.index('    /* ------------------------------------------------------------ render + events */')
s = s[:a] + r"""    function weakHtml() {
        var list = weakList();
        var h = '<div class="rv-panel" role="dialog" aria-label="Difficult topics"><div class="rv-panel-h"><b>' + I.flag + ' Revisit difficult topics</b><button type="button" class="rv-ib" data-act="closepanel" aria-label="Close">' + I.x + '</button></div>';
        if (!list.length) h += '<p class="rv-muted">Flag a topic as "needs revision" or mark a chapter "Needs more practice" and it will be listed here.</p>';
        h += '<ul>' + list.map(function (w) {
            return '<li><button type="button" data-open="' + esc(w.s.id) + '|' + esc(w.c.id) + '|full|' + esc(w.b ? w.b.id : '') + '"><span>' + esc(w.s.code) + ' &middot; Ch ' + esc(w.c.num)
                + (w.b ? ' &middot; topic' : ' &middot; whole chapter') + '</span>' + esc(w.b ? w.b.title : w.c.title) + '</button></li>';
        }).join('') + '</ul></div>';
        return h;
    }

""" + s[a:]
rep("""        root.addEventListener('keydown', onKey);""", """        root.addEventListener('keydown', onKey);
        root.addEventListener('pointerdown', vizDown);
        root.addEventListener('pointermove', vizMove);
        root.addEventListener('pointerup', vizUp);
        root.addEventListener('pointercancel', vizUp);
        root.addEventListener('wheel', vizWheel, { passive: false });""")
rep("""        if (ui.chapterId !== cid) { ui.collapsed = {}; ui.query = ''; }""",
    """        if (ui.chapterId !== cid) { ui.collapsed = {}; ui.query = ''; ui.vopen = {}; ui.vz = null; ui.vsel = null; }
        if (nodeId && (mode === 'map' || (!mode && ui.mode === 'map'))) mode = 'full';""")
rep("""        var n = root && root.querySelector('[data-node="' + id + '"]');""",
    """        var n = root && (root.querySelector('[data-node="' + id + '"]') || root.querySelector('[data-branch="' + id + '"]'));""")
rep("""        var t = e.target.closest('button, [data-go]');
        if (!t || !root.contains(t)) return;""", """        var t = e.target.closest('button, [data-go]');
        if (!t || !root.contains(t)) return;
        if (vDrag.moved && t.closest('.js-viz')) { vDrag.moved = false; return; }""")
rep("""        if (d.mode) { ui.mode = d.mode; render(); return; }""",
    """        if (d.mode) { ui.mode = d.mode; ui.vz = null; ui.vsel = null; render(); return; }
        if (d.status) { var xs = currentChapter(); if (xs.c) { setChapterStatus(xs.c, d.status); var ys = window.scrollY; render(); window.scrollTo(0, ys); } return; }
        if (d.needs) { var xn = currentChapter(); if (xn.c) { var rn = chRec(xn.c.id); setNeeds(xn.c, d.needs, !(rn && rn.nr && rn.nr[d.needs])); var yn = window.scrollY; render(); window.scrollTo(0, yn); } return; }
        if (d.vtog) {
            var isBr = currentChapter().c.branches.some(function (b) { return b.id === d.vtog; });
            if (isBr) ui.vopen[d.vtog] = ui.vopen[d.vtog] === 0 ? 1 : 0; else ui.vopen[d.vtog] = ui.vopen[d.vtog] ? 0 : 1;
            drawViz(); return;
        }
        if (d.vsel) { ui.vsel = d.vsel; drawViz(); showDetail(d.vsel); return; }""")
rep("""            case 'bookmarks': ui.panel = !ui.panel; render(); return;""",
    """            case 'bookmarks': ui.panel = ui.panel === 'bm' ? false : 'bm'; render(); return;
            case 'weak': ui.panel = ui.panel === 'weak' ? false : 'weak'; render(); return;
            case 'fit': fitViz(); return;
            case 'closedetail': ui.vsel = null; drawViz(); var dd = $('.js-vdetail'); if (dd) dd.hidden = true; return;""")
rep("""            case 'expand': ui.collapsed = {}; render(); return;
            case 'collapse': collapseAll(); render(); return;""",
    """            case 'expand':
                if (ui.mode === 'map') { var xe = currentChapter(); if (xe.c) xe.c.branches.forEach(function (b) { ui.vopen[b.id] = 1; walk(b.items, function (it) { if (it.kids && it.kids.length) ui.vopen[it.id] = 1; }); }); drawViz(); fitViz(); return; }
                ui.collapsed = {}; render(); return;
            case 'collapse':
                if (ui.mode === 'map') { ui.vopen = {}; drawViz(); fitViz(); return; }
                collapseAll(); render(); return;""")
rep("""            case 'zin': ui.zoom""", """            case 'zin': if (ui.mode === 'map' && ui.view === 'chapter') { zoomViz(1.2); return; } ui.zoom""")
rep("""            case 'zout': ui.zoom""", """            case 'zout': if (ui.mode === 'map' && ui.view === 'chapter') { zoomViz(1 / 1.2); return; } ui.zoom""")
rep("""            case 'revised': var x = currentChapter(); if (x.c) { setChapterRevised(x.c, chStatus(x.c) !== 'revised'); render(); } return;""",
    """            case 'revised': var x = currentChapter(); if (x.c) { setChapterStatus(x.c, chStatus(x.c) === 'revised' ? 'progress' : 'revised'); render(); } return;""")
rep("""        if (t.dataset && t.dataset.topic) {""", """        if (t.dataset && t.dataset.rc) {
            var xr = currentChapter();
            if (xr.c) { setRecall(xr.c, t.dataset.rc, t.checked); var yr = window.scrollY; render(); window.scrollTo(0, yr); }
            return;
        }
        if (t.dataset && t.dataset.topic) {""")

# print: the visual canvas does not paginate - print the complete map instead
rep("""        var keep = ui.collapsed, keepQ = ui.query;""", """        var keep = ui.collapsed, keepQ = ui.query, keepM = ui.mode;
        if (ui.mode === 'map') ui.mode = 'full';""")
rep("""        ui.collapsed = keep; ui.query = keepQ;
        render();""", """        var printMode = ui.mode;
        ui.collapsed = keep; ui.query = keepQ; ui.mode = keepM;
        render();""")
rep("""            ({ full: 'Complete mind map', five: '5-minute revision', last: 'Last-minute revision' })[ui.mode];""",
    """            MODE_NAME[printMode];""")
rep("""        var area = $('.js-print');""", """        var area = $('.js-print');
        if (area) area.classList.add('js-printing');""")
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))

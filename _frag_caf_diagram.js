/* =========================================================================
   CAF mind maps: real diagrams.

   renderMMCanvas() renders a flat CSS card grid - a list of topics, not a
   picture of the chapter. This adds an SVG diagram layer for the nine CAF
   volumes:

     * a chapter map  - the chapter on the left, one branch per topic, each
                        branch carrying the shape its own content supports
     * a topic diagram - classification tree, process flow, formula map,
                        criteria matrix or contrast, chosen per topic

   It is additive, not a replacement. The base renderer runs first and its
   output is untouched; the diagram is prepended above it, and every existing
   control, card and link keeps working exactly as before. PRC volumes have no
   entry in CAF_MINDMAPS and so are not touched at all.
   ========================================================================= */

(function () {
    'use strict';

    if (typeof CAF_MINDMAPS === 'undefined') return;

    /* ------------------------------------------------------------------
       look and feel
       ------------------------------------------------------------------ */
    var KIND_COLOR = {
        root: '#e2e8f0',
        branch: '#93c5fd',
        leaf: '#e2e8f0',
        step: '#fcd34d',
        compare: '#f9a8d4',
        formula: '#86efac',
        criterion: '#fdba74'
    };
    var KIND_EDGE = {
        root: '#94a3b8',
        branch: '#3b82f6',
        leaf: '#64748b',
        step: '#f59e0b',
        compare: '#ec4899',
        formula: '#22c55e',
        criterion: '#f97316'
    };
    var TYPE_LABEL = {
        tree: 'Concept Tree',
        flow: 'Process Flow',
        compare: 'Comparison',
        formula: 'Formula Map',
        matrix: 'Recognition Criteria'
    };

    var NODE_MIN_W = 132;
    var NODE_MAX_W = 236;
    var COL_GAP = 44;
    var VGAP = 12;
    var LINE_H = 15;
    var PAD_X = 13;
    var PAD_Y = 10;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* ------------------------------------------------------------------
       layout: a horizontal dendrogram, one column per level
       ------------------------------------------------------------------ */
    function wrap(label, maxChars) {
        var words = String(label || '').split(/\s+/).filter(Boolean);
        if (!words.length) return [''];
        var lines = [], cur = words[0];
        for (var i = 1; i < words.length; i++) {
            if ((cur + ' ' + words[i]).length <= maxChars) cur += ' ' + words[i];
            else { lines.push(cur); cur = words[i]; }
        }
        lines.push(cur);
        return lines.slice(0, 3);
    }

    function shape(node, depth) {
        var maxChars = depth === 0 ? 20 : (depth === 1 ? 24 : 26);
        node.lines = wrap(node.label, maxChars);
        var widest = 0;
        node.lines.forEach(function (l) { widest = Math.max(widest, l.length); });
        node.w = Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, widest * 6.85 + PAD_X * 2));
        node.h = Math.max(38, node.lines.length * LINE_H + PAD_Y * 2);
        node.depth = depth;
        if (node.ref && node.ref.text) node.h += 13;
    }

    function place(node, depth, x, cursor) {
        shape(node, depth);
        var kids = node.children || [];
        if (!kids.length) {
            node.x = x; node.y = cursor;
            cursor = cursor + node.h + VGAP;
        } else {
            var start = cursor;
            /* children clear THIS node's own width, not a fixed column pitch -
               a fixed pitch made wide nodes overlap their siblings */
            var childX = x + node.w + COL_GAP;
            for (var i = 0; i < kids.length; i++) {
                cursor = place(kids[i], depth + 1, childX, cursor);
            }
            var first = kids[0], last = kids[kids.length - 1];
            node.x = x;
            node.y = ((first.y + first.h / 2) + (last.y + last.h / 2)) / 2 - node.h / 2;
            if (node.y < start - 0.5) node.y = start;
        }
        return cursor;
    }

    function depthOf(node) {
        var d = 0, kids = node.children || [];
        for (var i = 0; i < kids.length; i++) d = Math.max(d, depthOf(kids[i]));
        return d + 1;
    }

    function edgePath(p, c) {
        var px = p.x + p.w, py = p.y + p.h / 2;
        var cx = c.x, cy = c.y + c.h / 2;
        var mid = px + (cx - px) / 2;
        var r = 7;
        var d = 'M ' + px + ' ' + py;
        d += ' H ' + (mid - r);
        d += ' Q ' + mid + ' ' + py + ' ' + mid + ' ' + (py + (cy > py ? r : -r));
        d += ' V ' + (cy + (cy > py ? -r : r));
        d += ' Q ' + mid + ' ' + cy + ' ' + (mid + r) + ' ' + cy;
        d += ' H ' + cx;
        return d;
    }

    function renderTree(tree, opts) {
        opts = opts || {};
        var root = JSON.parse(JSON.stringify(tree || {}));
        if (!root.label) return '';
        if (!root.children) root.children = [];

        var endY = place(root, 0, 0, 0);
        var maxD = depthOf(root) - 1;
        var maxW = NODE_MAX_W;
        (function scan(n) {
            maxW = Math.max(maxW, n.x + n.w);
            (n.children || []).forEach(scan);
        })(root);

        var pad = 18;
        var vbW = maxW + pad * 2;
        var vbH = Math.max(endY - VGAP, 40) + pad * 2;

        var parts = [];
        /* Render at the diagram's natural size and never scale it UP: a tall
           chapter map stretched to a 1200px container would be unreadable.
           `max-width:100%` still lets it shrink and scroll on a phone. */
        parts.push('<svg class="mmd-svg" viewBox="0 0 ' + Math.round(vbW) + ' ' + Math.round(vbH) + '"'
            + ' preserveAspectRatio="xMinYMin meet" role="img"'
            + ' style="width:' + Math.round(vbW) + 'px;max-width:100%;height:auto"'
            + ' aria-label="' + esc(root.label) + ' diagram">');

        parts.push('<defs><marker id="mmd-arrow" viewBox="0 0 10 10" refX="8" refY="5"'
            + ' markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
            + '<path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker></defs>');

        (function drawEdges(n) {
            (n.children || []).forEach(function (c) {
                var col = KIND_EDGE[n.kind] || '#64748b';
                var marker = (n.depth === 0 && c.kind === 'step') ? ' marker-end="url(#mmd-arrow)"' : '';
                parts.push('<path d="' + edgePath(n, c) + '" fill="none" stroke="' + col
                    + '" stroke-width="1.6" opacity="0.75"' + marker + '/>');
                drawEdges(c);
            });
        })(root);

        (function drawNodes(n) {
            var fill = KIND_COLOR[n.kind] || KIND_COLOR.leaf;
            var stroke = KIND_EDGE[n.kind] || KIND_EDGE.leaf;
            var isRoot = n.depth === 0;
            parts.push('<g class="mmd-node' + (isRoot ? ' is-root' : '') + '">');
            parts.push('<rect x="' + (n.x + pad) + '" y="' + (n.y + pad) + '" width="' + n.w
                + '" height="' + n.h + '" rx="' + (isRoot ? 10 : 8) + '" fill="' + fill
                + '" fill-opacity="' + (isRoot ? 0.18 : 0.13) + '" stroke="' + stroke
                + '" stroke-width="' + (isRoot ? 2 : 1.3) + '"/>');
            var ty = n.y + pad + PAD_Y + LINE_H - 4;
            n.lines.forEach(function (l) {
                parts.push('<text x="' + (n.x + pad + PAD_X) + '" y="' + ty + '" class="mmd-t'
                    + (isRoot ? ' mmd-t-root' : '') + '">' + esc(l) + '</text>');
                ty += LINE_H;
            });
            if (n.ref && n.ref.text) {
                parts.push('<text x="' + (n.x + pad + PAD_X) + '" y="' + (ty + 2)
                    + '" class="mmd-ref">' + esc(n.ref.text) + '</text>');
            }
            if (n.diaType) {
                parts.push('<text x="' + (n.x + pad + n.w - PAD_X) + '" y="' + (n.y + pad + 13)
                    + '" class="mmd-badge" text-anchor="end">' + esc(TYPE_LABEL[n.diaType] || n.diaType) + '</text>');
            }
            parts.push('</g>');
            (n.children || []).forEach(drawNodes);
        })(root);

        parts.push('</svg>');
        return parts.join('');
    }

    /* ------------------------------------------------------------------
       data lookup
       ------------------------------------------------------------------ */
    function chapter(subjectId, chapterId) {
        var b = CAF_MINDMAPS[subjectId];
        if (!b) return null;
        for (var i = 0; i < b.length; i++) if (b[i].id === chapterId) return b[i];
        return null;
    }

    function topic(subjectId, topicId) {
        var b = CAF_MINDMAPS[subjectId] || [];
        for (var i = 0; i < b.length; i++) {
            var t = b[i].topics || [];
            for (var j = 0; j < t.length; j++) if (t[j].id === topicId) return t[j];
        }
        return null;
    }

    /* ------------------------------------------------------------------
       chapter map, prepended above the existing card grid
       ------------------------------------------------------------------ */
    function chapterMapHtml(subjectId, chapterId) {
        var ch = chapter(subjectId, chapterId);
        if (!ch || !ch.map) return '';
        var svg = renderTree(ch.map, {});
        if (!svg) return '';
        return '<section class="mmd-panel mmd-chapter-map" data-mm-topic="' + esc(ch.id) + '">'
            + '<div class="mmd-head">'
            + '<span class="mmd-head-title">' + esc(ch.subject) + ' &middot; Chapter '
            + esc(String(ch.num)) + ' concept map</span>'
            + '<span class="mmd-head-sub">' + (ch.topics || []).length + ' topics &middot; '
            + esc(ch.pages) + ' &middot; colours show the topic type</span>'
            + '</div>'
            + '<div class="mmd-scroll">' + svg + '</div>'
            + '</section>';
    }

    /* ------------------------------------------------------------------
       topic detail: diagram + the five teaching blocks
       ------------------------------------------------------------------ */
    function teacherHtml(t) {
        var out = '';
        var blocks = [
            ['what', 'Kya hai', 'mmd-b-what'],
            ['why', 'ICAP kyun puchhta hai', 'mmd-b-why'],
            ['trap', 'Kahan ghalti hoti hai', 'mmd-b-trap'],
            ['example', 'Kitab ke example se', 'mmd-b-eg'],
            ['vocab', 'Key alfaaz', 'mmd-b-vocab']
        ];
        blocks.forEach(function (b) {
            var v = t.teach && t.teach[b[0]];
            if (!v) return;
            out += '<div class="mmd-block ' + b[2] + '"><div class="mmd-block-h">'
                + b[1] + '</div><div class="mmd-block-b">' + esc(v) + '</div></div>';
        });
        var how = (t.teach && t.teach.how) || [];
        if (how.length) {
            out += '<div class="mmd-block mmd-b-how"><div class="mmd-block-h">'
                + 'Marks kaise kamayein</div><ol class="mmd-ladder">';
            how.forEach(function (h) { out += '<li>' + esc(h) + '</li>'; });
            out += '</ol></div>';
        }
        return out;
    }

    function topicDetailHtml(subjectId, topicId) {
        var t = topic(subjectId, topicId);
        if (!t || !t.diagram) return '';
        var svg = renderTree(t.diagram.tree, {});
        return '<div class="mmd-detail" data-mm-detail="' + esc(t.id) + '">'
            + '<div class="mmd-detail-h">'
            + '<span class="mmd-kind-chip" style="--c:' + (KIND_COLOR[t.diagram.tree.kind] || '#93c5fd') + '">'
            + esc(TYPE_LABEL[t.diagram.type] || t.diagram.type) + '</span>'
            + (t.page ? '<span class="mmd-detail-p">study text p.' + esc(String(t.page)) + '</span>' : '')
            + '</div>'
            + '<div class="mmd-scroll">' + svg + '</div>'
            + teacherHtml(t)
            + '</div>';
    }

    /* ------------------------------------------------------------------
       wiring - additive only
       ------------------------------------------------------------------ */
    function mountInto(container, html, before) {
        if (!container || !html) return;
        var host = document.createElement('div');
        host.innerHTML = html;
        var node = host.firstElementChild;
        if (!node) return;
        if (before && container.firstChild) container.insertBefore(node, container.firstChild);
        else container.appendChild(node);
    }

    var baseRender = window.renderMMCanvas;
    if (typeof baseRender === 'function') {
        window.renderMMCanvas = function () {
            baseRender.apply(this, arguments);
            var c = document.getElementById('mm-canvas-container');
            if (!c) return;
            if (c.querySelector('.mmd-chapter-map')) return;
            try {
                mountInto(c, chapterMapHtml(currentMMSubjectId, currentMMChapterId), true);
            } catch (e) { /* never break the mind map over the diagram */ }
        };
    }

    var baseOpenTopic = window.openTopicModal;
    if (typeof baseOpenTopic === 'function') {
        window.openTopicModal = function (topicId) {
            var r = baseOpenTopic.apply(this, arguments);
            try {
                var html = topicDetailHtml(currentMMSubjectId, topicId);
                var host = document.getElementById('mm-modal-body')
                    || document.querySelector('[data-mm-detail-host]')
                    || document.querySelector('#mm-topic-modal .modal-body');
                if (html && host && !host.querySelector('.mmd-detail')) {
                    mountInto(host, html, true);
                }
            } catch (e) { /* never break the topic modal over the diagram */ }
            return r;
        };
    }

    /* expose for the guards */
    window.cafMindMap = {
        renderTree: renderTree,
        chapterMapHtml: chapterMapHtml,
        topicDetailHtml: topicDetailHtml,
        has: function (s, c) { return !!chapter(s, c); }
    };
})();

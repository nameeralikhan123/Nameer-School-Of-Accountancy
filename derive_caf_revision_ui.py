# -*- coding: utf-8 -*-
"""One-off record of how _frag_caf_revision.js was derived from the ACCA engine
(_frag_acca_revision.js). Kept for traceability; the CAF fragment is now
maintained directly. Each substitution asserts its match count."""
import io, sys
src = io.open('_build/fragments/_frag_acca_revision.js', encoding='utf-8').read()
s = src
def rep(old, new, count=1):
    global s
    n = s.count(old)
    if (count == 'all' and n == 0) or (count != 'all' and n != count):
        sys.exit('substitution %r: expected %s, found %d' % (old[:70], count, n))
    s = s.replace(old, new)

a = s.index('/* ==== begin ACCA'); b = s.index('(function () {')
s = s[:a] + '''/* ==== begin CAF Quick Revision mind maps UI ==== */
/* Source: _build/fragments/_frag_caf_revision.js - installed by
   _build/tools/apply_caf_revision.py. Content lives in CAF_REVISION_LIBRARY
   (generated from caf/revision_maps/<subject>/*.md); nothing here is
   subject-specific. Same engine and design language as the ACCA Quick
   Revision library, run as a separate instance so the two never share state:
   own storage key, own Firestore document, own DOM ids, own wrap flag.

   Takes over the Mind Maps view while the CAF track is selected:
     library (paper group -> subject cards) -> subject (every study-text
     chapter, mapped or in preparation) -> chapter
   with three modes (complete map / 5-minute / last-minute), search, zoom,
   expand/collapse, key-concept highlight, per-topic "revised" ticks,
   bookmarks, full screen, print / save as PDF, prev/next navigation, and a
   switch back to the classic CAF topic maps.

   Progress is stored in localStorage['nsa_caf_revision'] and mirrored to
   Firestore users/{uid}/data/cafRevision (last-writer-wins per chapter and
   per bookmark, so two devices merge instead of overwriting each other). */
''' + s[b:]

rep("if (typeof ACCA_REVISION_LIBRARY === 'undefined' || !ACCA_REVISION_LIBRARY) return;",
    "if (typeof CAF_REVISION_LIBRARY === 'undefined' || !CAF_REVISION_LIBRARY) return;")
rep("var LIB = ACCA_REVISION_LIBRARY;", "var LIB = CAF_REVISION_LIBRARY;")
rep("var STORE_KEY = 'nsa_acca_revision';", "var STORE_KEY = 'nsa_caf_revision';")
rep("var LEVEL_ORDER = ['Applied Knowledge', 'Applied Skills', 'Strategic Professional', 'Foundations in Accountancy'];",
    "var LEVEL_ORDER = ['Accounting and reporting', 'Management and finance', 'Tax and law', 'Systems, audit and assurance'];")
rep("hit: -1, panel: false, libQuery: ''", "hit: -1, panel: false, libQuery: '', classic: false")
rep("if (typeof planLevelOf === 'function' && planLevelOf(id) !== 'acf') return false;",
    "if (typeof planLevelOf === 'function' && planLevelOf(id) !== 'caf') return false;")
rep(".collection('data').doc('accaRevision');", ".collection('data').doc('cafRevision');")
for old in ("rv-lib-q", "rv-lib-results", "rv-print-area", "rv-qn", "rv-q"):
    new = old.replace('rv-', 'cv-')
    rep("'" + old + "'", "'" + new + "'", 'all')
    rep('id="' + old + '"', 'id="' + new + '"', 'all')
rep("root.id = 'acca-rev-root';", "root.id = 'caf-rev-root';")
rep("return typeof currentMMLevel !== 'undefined' && currentMMLevel === 'acf' && LIB.subjects.length > 0;",
    "return typeof currentMMLevel !== 'undefined' && currentMMLevel === 'caf' && LIB.subjects.length > 0;")
rep("""        if (isActive()) { legacy(false); r.hidden = false; render(); }
        else { legacy(true); r.hidden = true; }""",
    """        if (isActive() && ui.classic) { legacy(true); r.hidden = false; r.innerHTML = classicBarHtml(); r.setAttribute('data-view', 'classic'); }
        else if (isActive()) { legacy(false); r.hidden = false; render(); }
        else { legacy(true); r.hidden = true; }""")
rep("base.__rvWrapped", "base.__cvWrapped"); rep("w.__rvWrapped = true;", "w.__cvWrapped = true;")
rep("window.accaRevision = {", "window.cafRevision = {")
rep("open: function (sid, cid, mode) { if (typeof applyTrackSwitch === 'function') applyTrackSwitch('acf'); open(sid, cid, mode); },",
    "open: function (sid, cid, mode) { ui.classic = false; if (typeof applyTrackSwitch === 'function') applyTrackSwitch('caf'); open(sid, cid, mode); },")
rep("<div class=\"rv-kicker\">ACCA &middot; Quick Revision Library</div>", "<div class=\"rv-kicker\">CA CAF &middot; Quick Revision Library</div>")
rep("'<h2>Chapter mind maps built from your study texts</h2>'", "'<h2>Chapter mind maps built from the ICAP study texts</h2>'")
rep("placeholder=\"Search every ACCA mind map (eg depreciation, Mendelow, EOQ)\"", "placeholder=\"Search every CAF mind map (eg deferred grant, withholding, materiality)\"")
rep("'<div class=\"rv-step\">1 &middot; Select ACCA level</div>", "'<div class=\"rv-step\">1 &middot; Select paper group</div>")
rep("[['all', 'All levels']]", "[['all', 'All CAF papers']]")
rep("No ACCA mind maps are available for your plan at this level.", "No CAF mind maps are available for your plan in this group.")
rep("[['ACCA Mind Maps', 'home'], [s.level, 'home'], [s.code + ' ' + s.name, '']]", "[['CAF Mind Maps', 'home'], [s.code + ' ' + s.name, '']]")
rep("[['ACCA Mind Maps', 'home'], [s.code + ' ' + s.name, 'subject']", "[['CAF Mind Maps', 'home'], [s.code + ' ' + s.name, 'subject']")
rep("if (LIB.preview) h += '<div class=\"rv-preview\">ADMIN PREVIEW &middot; draft chapters are shown. Students only see published chapters.</div>';",
    "if (LIB.preview) h += '<div class=\"rv-preview\">ADMIN PREVIEW &middot; unpublished chapters are shown with their workflow status. Students only see published chapters.</div>';")
io.open('_build/fragments/_frag_caf_revision.js', 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))

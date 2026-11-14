# -*- coding: utf-8 -*-
"""One-off: turn the CAF revision UI (itself derived from the ACCA one) into
the single shared engine _frag_revision_engine.js used by BOTH libraries.
Kept as a record; the engine is maintained directly afterwards."""
import io, re, sys

SRC = '_build/fragments/_frag_caf_revision.js'
OUT = '_build/fragments/_frag_revision_engine.js'
s = io.open(SRC, encoding='utf-8').read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if (count == 'all' and n == 0) or (count != 'all' and n != count):
        sys.exit('substitution %r: expected %s, found %d' % (old[:80], count, n))
    s = s.replace(old, new)


a = s.index('(function () {')
s = '''/* ==== begin PADHLE BHAI Quick Revision engine (shared by ACCA and CAF) ==== */
/* Source: _build/fragments/_frag_revision_engine.js - installed once, inside the
   ACCA Quick Revision block (apply_acca_revision.py); the CAF block only adds
   its data and a config call. ONE engine, many libraries:

       PBRevision.create({ lib, track, storeKey, cloudDoc, rootId, exportName, ... })

   Each library takes over the Mind Maps view while its track is active:
     library dashboard -> subject (every study-text chapter) -> chapter
   Chapter modes: visual mind map (pan / zoom / expand), complete outline map,
   5-minute revision (with progress), last-minute sheet, comparisons.
   Revision tracking per chapter (not started / in progress / revised / needs
   more practice) and per topic (understood / needs revision), bookmarks, last
   revised date. Progress lives in localStorage[storeKey] and is mirrored to
   Firestore users/{uid}/data/{cloudDoc} (per student, per academic level),
   merged last-writer-wins per chapter / bookmark so devices never overwrite
   each other. Nothing here is subject-specific: content comes from the data. */
window.PBRevision = window.PBRevision || {};
window.PBRevision.create = function (CFG) {
''' + s[a + len('(function () {'):]
rep("    if (typeof CAF_REVISION_LIBRARY === 'undefined' || !CAF_REVISION_LIBRARY) return;\n", "    if (!CFG || !CFG.lib || !CFG.lib.subjects) return null;\n")
rep("var LIB = CAF_REVISION_LIBRARY;", "var LIB = CFG.lib;\n    var TXT = CFG.text || {};\n    var FLAG = '__pbrev_' + CFG.track;\n    function $(sel) { return root ? root.querySelector(sel) : null; }")
rep("var STORE_KEY = 'nsa_caf_revision';", "var STORE_KEY = CFG.storeKey;")
rep("var LEVEL_ORDER = ['Accounting and reporting', 'Management and finance', 'Tax and law', 'Systems, audit and assurance'];", "var LEVEL_ORDER = CFG.levelOrder || [];")
rep("planLevelOf(id) !== 'caf'", "planLevelOf(id) !== CFG.track")
rep(".doc('cafRevision');", ".doc(CFG.cloudDoc);")
rep("currentMMLevel === 'caf' && LIB.subjects.length > 0", "currentMMLevel === CFG.track && LIB.subjects.length > 0")
rep("root.id = 'caf-rev-root';", "root.id = CFG.rootId;")
rep("base.__cvWrapped", "base[FLAG]")
rep("w.__cvWrapped = true;", "w[FLAG] = true;")
rep("window.cafRevision = {", "var api = {")
rep("ui.classic = false; if (typeof applyTrackSwitch === 'function') applyTrackSwitch('caf');", "ui.classic = false; if (typeof applyTrackSwitch === 'function') applyTrackSwitch(CFG.track);")
rep("        ui: ui\n    };\n})();\n/* ==== end CAF Quick Revision mind maps UI ==== */", "        ui: ui\n    };\n    if (CFG.exportName) window[CFG.exportName] = api;\n    return api;\n};\n/* ==== end PADHLE BHAI Quick Revision engine ==== */")
rep("try { if (typeof CAF_BOOKS !== 'undefined') lib = CAF_BOOKS.filter(function (x) { return x.file === b.file; })[0]; } catch (e) { /* ignore */ }",
    "try { if (typeof CFG.findBook === 'function') lib = CFG.findBook(b.file); } catch (e) { /* ignore */ }")
# DOM ids -> classes scoped to this library's root
rep('id="cv-lib-q"', 'class="js-libq"'); rep('<div id="cv-lib-results"></div>', '<div class="js-libres"></div>')
rep('id="cv-q"', 'class="js-q"'); rep('id="cv-qn"', 'class="rv-qn js-qn"')
rep('<div id="cv-print-area" class="rv-stage', '<div class="js-print rv-stage')
rep("t.id === 'cv-q'", "t.classList.contains('js-q')", 2)
rep("t.id === 'cv-lib-q'", "t.classList.contains('js-libq')")
rep("el('cv-q')", "$('.js-q')"); rep("el('cv-qn')", "$('.js-qn')", 2)
rep("el('cv-lib-results')", "$('.js-libres')"); rep("el('cv-print-area')", "$('.js-print')")
rep("var b = el(d.jump);", "var b = $('[data-branch=\"' + d.jump + '\"]');")
# copy -> config
rep("""<div class="rv-kicker">CA CAF &middot; Quick Revision Library</div>'""", """<div class="rv-kicker">' + esc(TXT.kicker) + '</div>'""")
rep("'<h2>Chapter mind maps built from the ICAP study texts</h2>'", "'<h2>' + esc(TXT.title) + '</h2>'")
s = re.sub(r"\+ '<p>Pick a CAF subject and a chapter.*?</p></div>'", "+ '<p>' + esc(TXT.intro) + '</p></div>'", s, count=1)
rep("placeholder=\"Search every CAF mind map (eg deferred grant, withholding, materiality)\"", "placeholder=\"' + esc(TXT.search) + '\"")
rep("1 &middot; Select paper group</div>", "1 &middot; ' + esc(TXT.groupStep) + '</div>")
rep("[['all', 'All CAF papers']]", "[['all', TXT.allGroups]]")
rep("2 &middot; Select CAF subject", "2 &middot; ' + esc(TXT.subjectStep) + '")
rep("No CAF mind maps are available for your plan in this group.", "' + esc(TXT.empty) + '")
rep("crumbs([['CAF Mind Maps', 'home'],", "crumbs([[TXT.crumb, 'home'],", 2)
rep("+ '<button type=\"button\" class=\"rv-btn rv-btn-ghost\" data-act=\"classic\" title=\"The earlier CAF topic maps with teacher notes\">Classic topic maps</button></div></div>';",
    "+ (CFG.classic ? '<button type=\"button\" class=\"rv-btn rv-btn-ghost\" data-act=\"classic\" title=\"The earlier topic maps\">Classic topic maps</button>' : '') + '</div></div>';")
rep("' Classic CAF topic maps</span>'", "' Classic topic maps</span>'")
# ACCA has no study-text chapter list: fall back to the published chapters
rep("var toc = s.toc || [];", "var toc = s.toc || s.chapters.map(function (c) { return { num: c.num, title: c.title, pages: c.pages }; });")
if 'cv-' in s or "'caf'" in s or 'CAF_' in s:
    sys.exit('leftover CAF-specific token: ' + str(re.findall(r".{30}(?:cv-|'caf'|CAF_).{30}", s)[:5]))
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', len(s))

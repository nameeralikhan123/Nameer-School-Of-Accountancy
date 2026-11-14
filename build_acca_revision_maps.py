# -*- coding: utf-8 -*-
"""ACCA Quick Revision mind maps: content files -> validated data fragment.

Source of truth: acca/revision_maps/<subjectId>.md (one file per subject; the
format is documented in acca/revision_maps/README.md). Content is kept apart
from the UI so a new study text or chapter is a new file / new `#` block, not a
code change.

    python _build/pipeline/build_acca_revision_maps.py            # student build
    python _build/pipeline/build_acca_revision_maps.py --preview  # + drafts preview

Outputs
  _build/fragments/_frag_acca_revision_data.js  PUBLISHED chapters only
  acca/revision_maps/COVERAGE.md                content completion report
  _build/out/acca_revision_preview.js           (--preview) drafts included,
                                                for admin review before publish

A chapter is emitted to students only when `@status published` AND it passes
every check below. A failing published chapter stops the build: nothing
incomplete reaches a student.
"""
from __future__ import annotations

import datetime
import hashlib
import io
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "acca", "revision_maps")
FRAG = os.path.join(ROOT, "_build", "fragments", "_frag_acca_revision_data.js")
PREVIEW = os.path.join(ROOT, "_build", "out", "acca_revision_preview.js")
COVERAGE = os.path.join(SRC, "COVERAGE.md")

BRANCH_KINDS = {
    "concept", "def", "rule", "formula", "compare", "process", "decision",
    "exam", "mistakes", "recall", "exceptions", "example",
}
PLACEHOLDER = re.compile(r"\b(TODO|TBD|lorem|placeholder|xxx)\b", re.I)


class ContentError(Exception):
    pass


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def parse_pages(s: str):
    """'3-18' / '3' -> (3, 18); '' -> None."""
    s = (s or "").strip().lower().lstrip("p").strip(". ")
    if not s:
        return None
    m = re.match(r"^(\d+)\s*(?:[-–]\s*(\d+))?$", s)
    if not m:
        raise ContentError("bad page reference %r" % s)
    a = int(m.group(1))
    return (a, int(m.group(2) or a))


ITEM = re.compile(r"^(?P<ind>\s*)- (?P<body>.*)$")


def parse_item(body: str):
    """One `- ...` line -> node dict. Prefixes:
         *            key point (shown in 5-minute mode)
         def T :: D   definition card
         f N :: F :: V :: E    formula card (vars / example optional)
         ! text       exam alert       x text   exception / common mistake
         eg text      example          ? Q :: yes :: no   decision
         tip text     memory tip (shown in the comparisons view)
    """
    node = {"t": "pt"}
    if body.startswith("* "):
        node["k"] = 1
        body = body[2:].lstrip()
    m = re.match(r"^(def|f|eg|tip|!|x|\?)\s+(.*)$", body)
    if m:
        tag, rest = m.group(1), m.group(2)
        parts = [p.strip() for p in rest.split("::")]
        if tag == "def":
            if len(parts) < 2 or not parts[0] or not parts[1]:
                raise ContentError("definition needs `Term :: meaning`: %r" % body)
            node.update(t="def", term=parts[0], text=" :: ".join(parts[1:]))
        elif tag == "f":
            if len(parts) < 2 or not parts[1]:
                raise ContentError("formula needs `Name :: expression`: %r" % body)
            node.update(t="f", term=parts[0], text=parts[1])
            if len(parts) > 2 and parts[2]:
                node["vars"] = parts[2]
            if len(parts) > 3 and parts[3]:
                node["eg"] = parts[3]
            if len(parts) > 4 and parts[4]:
                node["warn"] = parts[4]
        elif tag == "?":
            if len(parts) < 3:
                raise ContentError("decision needs `Question :: if yes :: if no`: %r" % body)
            node.update(t="dq", text=parts[0], yes=parts[1], no=parts[2])
        else:
            node.update(t={"eg": "eg", "tip": "tip", "!": "exam", "x": "x"}[tag], text=rest.strip())
    else:
        node["text"] = body.strip()
    for key in ("text", "term"):
        if key in node and not node[key]:
            raise ContentError("empty item: %r" % body)
    return node


def source_lines(path: str):
    """A subject is either one file or a folder: _subject.md (the @ header)
    followed by one file per chapter, in natural order (ch2 before ch10)."""
    if os.path.isdir(path):
        def nat(fn):
            return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", fn)]
        names = sorted((f for f in os.listdir(path) if f.endswith(".md")),
                       key=lambda f: (f != "_subject.md", nat(f)))
        if not names or names[0] != "_subject.md":
            raise ContentError("%s: folder needs _subject.md" % path)
        out = []
        for fn in names:
            with io.open(os.path.join(path, fn), encoding="utf-8") as f:
                for i, l in enumerate(f.read().split("\n"), 1):
                    out.append(("%s/%s" % (os.path.basename(path), fn), i, l))
            out.append((fn, 0, ""))
        return out
    with io.open(path, encoding="utf-8") as f:
        return [(os.path.basename(path), i, l) for i, l in enumerate(f.read().split("\n"), 1)]


def parse_file(path: str):
    subj = {"chapters": []}
    ch = None
    br = None
    stack = []  # (indent, node)
    table = None
    for fname, ln, raw in source_lines(path):
        line = raw.rstrip()
        try:
            if not line.strip() or line.lstrip().startswith("<!--"):
                table = None if not line.strip() else table
                continue
            if line.startswith("@") and ch is None:
                k, _, v = line[1:].partition(" ")
                subj[k.strip()] = v.strip()
                continue
            if line.startswith("# "):
                parts = [p.strip() for p in line[2:].split("|")]
                if len(parts) < 3:
                    raise ContentError("chapter line needs `# num | title | pages | syllabus`")
                num = parts[0]
                ch = {
                    "num": num,
                    "title": parts[1],
                    "pages": parse_pages(parts[2]),
                    "syllabus": parts[3] if len(parts) > 3 else "",
                    "status": "draft",
                    "branches": [],
                    "line": ln,
                }
                subj["chapters"].append(ch)
                br = None
                stack = []
                table = None
                continue
            if ch is None:
                raise ContentError("content before the first `# chapter` line")
            if line.startswith("@"):
                k, _, v = line[1:].partition(" ")
                ch[k.strip()] = v.strip()
                continue
            if line.startswith("## "):
                head = line[3:]
                kind, _, rest = head.partition(" ")
                if kind not in BRANCH_KINDS:
                    raise ContentError("unknown branch kind %r" % kind)
                title, _, pg = rest.partition("|")
                br = {"kind": kind, "title": title.strip() or kind.title(),
                      "page": parse_pages(pg), "items": []}
                if not br["title"]:
                    raise ContentError("branch without title")
                ch["branches"].append(br)
                stack = []
                table = None
                continue
            if br is None:
                raise ContentError("item outside a `##` branch")
            if line.lstrip().startswith("|"):
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if table is None:
                    table = {"t": "table", "rows": []}
                    br["items"].append(table)
                    stack = []
                table["rows"].append(cells)
                continue
            table = None
            m = ITEM.match(line)
            if not m:
                raise ContentError("unrecognised line")
            ind = len(m.group("ind").replace("\t", "  "))
            node = parse_item(m.group("body"))
            while stack and stack[-1][0] >= ind:
                stack.pop()
            if stack:
                stack[-1][1].setdefault("kids", []).append(node)
            else:
                if ind:
                    raise ContentError("indented item has no parent")
                br["items"].append(node)
            stack.append((ind, node))
        except ContentError as e:
            raise ContentError("%s:%d: %s" % (fname, ln, e))
    return subj


def walk(items):
    for it in items:
        yield it
        yield from walk(it.get("kids", []))


def check_chapter(subj, ch, errors):
    """Content-quality gate. Returns list of problems (empty = publishable)."""
    where = "%s ch%s" % (subj["id"], ch["num"])
    p = []
    if not ch["pages"]:
        p.append("no study-text page range")
    if not ch.get("source"):
        p.append("no @source line")
    kinds = [b["kind"] for b in ch["branches"]]
    content = [b for b in ch["branches"] if b["kind"] not in ("recall", "mistakes", "exam")]
    if len(content) < 2:
        p.append("needs at least 2 content branches (has %d)" % len(content))
    rec = [b for b in ch["branches"] if b["kind"] == "recall"]
    if len(rec) != 1:
        p.append("needs exactly one `## recall` branch")
    else:
        n = sum(1 for it in rec[0]["items"] if it["t"] != "table")
        if not 10 <= n <= 15:
            p.append("recall must hold 10-15 points (has %d)" % n)
    mis = [b for b in ch["branches"] if b["kind"] == "mistakes"]
    if len(mis) != 1:
        p.append("needs exactly one `## mistakes` branch")
    elif not 3 <= len(mis[0]["items"]) <= 6:
        p.append("mistakes must hold 3-6 items (has %d)" % len(mis[0]["items"]))
    if "exam" not in kinds and not any(it["t"] == "exam" for b in ch["branches"] for it in walk(b["items"])):
        p.append("no exam-focus content")
    keys = sum(1 for b in ch["branches"] for it in walk(b["items"]) if it.get("k"))
    if keys < 4:
        p.append("needs at least 4 `*` key points for 5-minute mode (has %d)" % keys)
    lo, hi = ch["pages"] or (0, 10 ** 6)
    for b in ch["branches"]:
        if b["page"] and not (lo <= b["page"][0] and b["page"][1] <= hi):
            p.append("branch %r page %s outside chapter %s-%s" % (b["title"], b["page"], lo, hi))
        if not b["items"]:
            p.append("empty branch %r" % b["title"])
        for it in walk(b["items"]):
            blob = json.dumps(it, ensure_ascii=False)
            if PLACEHOLDER.search(blob):
                p.append("placeholder text in %r" % b["title"])
            if it["t"] == "table":
                w = {len(r) for r in it["rows"]}
                if len(w) != 1 or len(it["rows"]) < 2:
                    p.append("ragged/short table in %r" % b["title"])
    titles = [b["title"].lower() for b in ch["branches"]]
    if len(set(titles)) != len(titles):
        p.append("duplicate branch titles")
    return p


def finalise(subj):
    """Assign stable ids and derive per-chapter metadata."""
    sid = subj["id"]
    for ch in subj["chapters"]:
        # comparison tables: a row whose first cell starts with "* " is the
        # decisive difference (highlighted in the comparisons view)
        for b in ch["branches"]:
            for it in walk(b["items"]):
                if it["t"] == "table":
                    kr = [i for i, r in enumerate(it["rows"]) if i and r and r[0].startswith("* ")]
                    for i in kr:
                        it["rows"][i][0] = it["rows"][i][0][2:].strip()
                    if kr:
                        it["kr"] = kr
        ch["id"] = "%s-rv%s" % (sid, slug(ch["num"]))
        used = set()
        for b in ch["branches"]:
            # ids are content hashes, not positions, so a student's bookmarks and
            # "revised" ticks survive branches being reordered or added
            bid = "%s-%s" % (ch["id"], hashlib.md5(b["title"].lower().encode("utf-8")).hexdigest()[:5])
            while bid in used:
                bid += "x"
            used.add(bid)
            b["id"] = bid
            for it in walk(b["items"]):
                key = (it.get("term", "") + "|" + it.get("text", "") + "|" + json.dumps(it.get("rows", "")))
                nid = "%s-%s" % (bid, hashlib.md5(key.encode("utf-8")).hexdigest()[:6])
                while nid in used:
                    nid += "x"
                used.add(nid)
                it["id"] = nid
        ch.pop("line", None)
        if ch["pages"]:
            ch["pages"] = list(ch["pages"])
        for b in ch["branches"]:
            if b["page"]:
                b["page"] = list(b["page"])
    return subj


def main():
    preview = "--preview" in sys.argv
    files = sorted(f for f in os.listdir(SRC)
                   if (f.endswith(".md") and f[0] != "_" and f not in ("README.md", "COVERAGE.md"))
                   or os.path.isdir(os.path.join(SRC, f)))
    subjects, report, fatal = [], [], []
    for fn in files:
        subj = parse_file(os.path.join(SRC, fn))
        for req in ("id", "code", "name", "level", "book"):
            if not subj.get(req):
                fatal.append("%s: missing @%s" % (fn, req))
        if fatal:
            continue
        nums = [c["num"] for c in subj["chapters"]]
        if len(set(nums)) != len(nums):
            fatal.append("%s: duplicate chapter numbers" % fn)
        for ch in subj["chapters"]:
            probs = check_chapter(subj, ch, fatal)
            ch["_problems"] = probs
            if ch["status"] == "published" and probs:
                fatal.append("%s ch%s is published but fails: %s" % (subj["id"], ch["num"], "; ".join(probs)))
        subjects.append(finalise(subj))
    if fatal:
        print("BUILD FAILED")
        for f in fatal:
            print("  -", f)
        sys.exit(1)

    today = datetime.date.today().isoformat()

    def emit(include_drafts):
        out = {"schema": "acca-revision/1", "generated": today, "subjects": []}
        for s in subjects:
            chs = []
            for ch in s["chapters"]:
                if ch["status"] != "published" and not include_drafts:
                    continue
                c = {k: v for k, v in ch.items() if not k.startswith("_")}
                c.setdefault("updated", s.get("updated", today))
                chs.append(c)
            if not chs:
                continue
            meta = {k: v for k, v in s.items() if k != "chapters"}
            meta["chapters"] = chs
            meta["plannedChapters"] = len(s["chapters"])
            out["subjects"].append(meta)
        return out

    data = emit(False)
    js = ("/* GENERATED by _build/pipeline/build_acca_revision_maps.py from\n"
          "   acca/revision_maps/*.md - do not hand edit. Published chapters only. */\n"
          "var ACCA_REVISION_LIBRARY = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with io.open(FRAG, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    if preview:
        os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
        with io.open(PREVIEW, "w", encoding="utf-8", newline="\n") as f:
            f.write("/* ADMIN PREVIEW - includes draft chapters. Never install this file. */\n"
                    "var ACCA_REVISION_LIBRARY = " + json.dumps(dict(emit(True), preview=True), ensure_ascii=False) + ";\n")

    # coverage report
    rows = ["# ACCA Quick Revision - content coverage", "",
            "Generated %s by `build_acca_revision_maps.py`. Only **published** chapters reach students." % today, "",
            "| Subject | Level | Source | Published | Draft | Nodes | Formulas |", "|---|---|---|---|---|---|---|"]
    detail = []
    for s in subjects:
        pub = [c for c in s["chapters"] if c["status"] == "published"]
        drf = [c for c in s["chapters"] if c["status"] != "published"]
        nodes = sum(1 for c in pub for b in c["branches"] for _ in walk(b["items"]))
        fx = sum(1 for c in pub for b in c["branches"] for it in walk(b["items"]) if it["t"] == "f")
        rows.append("| %s %s | %s | %s | %d | %d | %d | %d |" % (s["code"], s["name"], s["level"], s["book"].split("|")[0].strip(), len(pub), len(drf), nodes, fx))
        if s.get("note"):
            detail.append("- **%s**: %s" % (s["code"], s["note"]))
        for c in drf:
            detail.append("- %s ch%s *%s* - draft: %s" % (s["code"], c["num"], c["title"], "; ".join(c["_problems"]) or "ready, not yet published"))
    with io.open(COVERAGE, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(rows + ["", "## Notes and open items", ""] + (detail or ["- none"])) + "\n")

    tot = sum(len(s["chapters"]) for s in data["subjects"])
    print("ok: %d subjects, %d published chapters -> %s (%d bytes)" % (len(data["subjects"]), tot, os.path.relpath(FRAG, ROOT), len(js)))
    for s in data["subjects"]:
        print("  %-6s %-40s %d/%d chapters" % (s["code"], s["name"][:40], len(s["chapters"]), s["plannedChapters"]))


if __name__ == "__main__":
    try:
        main()
    except ContentError as e:
        print("CONTENT ERROR:", e)
        sys.exit(1)

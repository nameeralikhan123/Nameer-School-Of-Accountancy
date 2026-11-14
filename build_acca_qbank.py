# -*- coding: utf-8 -*-
"""Validate the ACCA question bank and emit the runtime data + progress tracker.

    python _build/pipeline/build_acca_qbank.py              # validate + emit published bank
    python _build/pipeline/build_acca_qbank.py --preview    # also emit preview (review/approved too)
    python _build/pipeline/build_acca_qbank.py --scaffold acfab ch02   # new chapter file from revision map

Publishing states: draft -> validated (automatic, all checks pass) -> review
(submitted for admin) -> approved -> published | rejected. A question whose
automatic checks fail is reported as Draft whatever its file says, and is
never shipped. Only "published" questions go into index.html; --preview adds
validated / review / approved ones to a separate local preview file.

Outputs
    _build/fragments/_frag_acca_qbank_data.js     runtime bank (published only)
    _build/out/acca_qbank_preview_data.js         preview bank (not deployed)
    _build/out/acca_qbank_report.json             full validation report (admin tool)
    acca/question_bank/PROGRESS.md                persistent progress tracker
"""
import base64
import collections
import datetime
import io
import json
import os
import re
import sys
import zlib

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(__file__))
import acca_qbank_lib as L  # noqa: E402

ROOT = L.ROOT
FRAG = os.path.join(ROOT, "_build", "fragments", "_frag_acca_qbank_data.js")
PREVIEW = os.path.join(ROOT, "_build", "out", "acca_qbank_preview_data.js")
REPORT = os.path.join(ROOT, "_build", "out", "acca_qbank_report.json")
TRACKER = os.path.join(L.QB_DIR, "PROGRESS.md")
RMAPS = os.path.join(ROOT, "acca", "revision_maps")
TARGET_MIN = 50


def revision_chapters():
    """All 125 portal chapters from the revision maps: sid -> [(file, num, title, lo)]."""
    out = collections.OrderedDict()
    for sid in L.SUBJECT_META:
        d = os.path.join(RMAPS, sid)
        rows = []
        for fn in sorted(os.listdir(d), key=L._chkey):
            if not re.match(r"ch\d+[a-z]?\.md$", fn):
                continue
            first = io.open(os.path.join(d, fn), encoding="utf-8").readline()
            p = [x.strip() for x in first.lstrip("# ").split("|")]
            rows.append((fn[:-3], p[0], p[1], p[3] if len(p) > 3 else ""))
        out[sid] = rows
    return out


def scaffold(sid, stem):
    src = os.path.join(RMAPS, sid, stem + ".md")
    lines = io.open(src, encoding="utf-8").read().split("\n")
    p = [x.strip() for x in lines[0].lstrip("# ").split("|")]
    topics = []
    for ln in lines:
        m = re.match(r"^## (\w+) (.+?)(?: \| [\d\-]+)?$", ln)
        if m and m.group(1) not in ("exam", "mistakes", "recall"):
            topics.append(m.group(2).strip())
    dst = os.path.join(L.QB_DIR, sid, stem + ".qb")
    if os.path.exists(dst):
        sys.exit("exists: " + dst)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out = ["@subject " + sid, "@chapter " + p[0], "@title " + p[1], "@lo " + (p[3] if len(p) > 3 else "")]
    for i, t in enumerate(topics, 1):
        out.append("@topic t%d | %s | %s" % (i, t, p[3] if len(p) > 3 else ""))
    io.open(dst, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
    print("scaffolded", dst, len(topics), "topics")


def pack(rows):
    raw = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(zlib.compress(raw, 9)).decode("ascii")


def main():
    if "--scaffold" in sys.argv:
        i = sys.argv.index("--scaffold")
        scaffold(sys.argv[i + 1], sys.argv[i + 2])
        return
    preview = "--preview" in sys.argv
    files = L.load_all()
    all_qs = []
    report = {"built": datetime.datetime.now().isoformat(timespec="seconds"), "chapters": [], "questions": {}}
    ids_seen = {}
    fatal = []
    per_ch = []
    for path, head, qs in files:
        topic_ids = {t["id"] for t in head["topics"]}
        cid = L.chapter_id(head)
        ch = {"file": os.path.relpath(path, ROOT).replace("\\", "/"), "sid": head["subject"], "id": cid,
              "num": str(head["chapter"]), "title": head["title"], "lo": head.get("lo", ""),
              "topics": head["topics"], "qs": []}
        for q in qs:
            if q["id"] in ids_seen:
                fatal.append("duplicate question id %s (%s and %s)" % (q["id"], ids_seen[q["id"]], ch["file"]))
            ids_seen[q["id"]] = ch["file"]
            E, W = L.validate_question(q, head, topic_ids)
            src, ratio, shared = L.originality(q)
            if shared >= 4 or ratio >= 0.2:
                E.append("wording overlaps %s (%d shared 8-word runs) - rewrite in original words" % (src, shared))
            elif shared >= 1:
                W.append("shares %d 8-word run(s) with %s - check it is a stock phrase" % (shared, src))
            declared = q.get("status", "draft")
            eff = declared
            if E:
                eff = "draft"
            elif declared == "draft":
                eff = "validated"
            q["_eff"], q["_E"], q["_W"] = eff, E, W
            report["questions"][q["id"]] = {"file": ch["file"], "declared": declared, "status": eff,
                                            "errors": E, "warnings": W}
            ch["qs"].append(q)
            all_qs.append(q)
        per_ch.append((head, ch))
    dups = L.near_duplicates(all_qs)
    for a, b, j in dups:
        for x in (a, b):
            report["questions"][x]["warnings"].append("near-duplicate of %s (similarity %.2f)" % (b if x == a else a, j))
    report["duplicates"] = dups

    # ------------------------------------------------ runtime data
    def emit(include):
        subjects = collections.OrderedDict()
        packs = {}
        rows_by_sid = collections.defaultdict(list)
        for head, ch in per_ch:
            sid = head["subject"]
            meta = L.SUBJECT_META[sid]
            s = subjects.setdefault(sid, {"code": meta["code"], "exam": meta["exam"], "syllabus": meta["syllabus"],
                                          "chapters": []})
            live = [q for q in ch["qs"] if q["_eff"] in include]
            cnt = collections.Counter(q["level"] for q in live)
            s["chapters"].append({"id": ch["id"], "num": ch["num"], "title": ch["title"], "lo": ch["lo"],
                                  "topics": [[t["id"], t["name"], t.get("lo", "")] for t in head["topics"]],
                                  "n": len(live), "F": cnt["F"], "S": cnt["S"], "C": cnt["C"]})
            for q in live:
                r = L.to_runtime(q, head, None)
                r["ch"] = ch["id"]
                if include != ("published",):
                    r["status"] = q["_eff"]
                rows_by_sid[sid].append(r)
        for sid, rows in rows_by_sid.items():
            packs[sid] = pack(rows)
        data = {"v": 1, "built": report["built"], "subjects": subjects, "packs": packs,
                "total": sum(len(r) for r in rows_by_sid.values())}
        return ("/* ACCA Foundation Exam Practice Centre - question bank. GENERATED by\n"
                "   _build/pipeline/build_acca_qbank.py from acca/question_bank/*.qb - do not edit. */\n"
                "var ACCA_QBANK = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"), data["total"]

    js, n_pub = emit(("published",))
    io.open(FRAG, "w", encoding="utf-8", newline="\n").write(js)
    print("published bank: %d questions -> %s (%d KB)" % (n_pub, os.path.relpath(FRAG, ROOT), len(js) // 1024))
    if preview:
        pjs, n_prev = emit(("published", "approved", "review", "validated"))
        os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
        io.open(PREVIEW, "w", encoding="utf-8", newline="\n").write(pjs)
        print("preview bank:   %d questions -> %s" % (n_prev, os.path.relpath(PREVIEW, ROOT)))

    # ------------------------------------------------ report for the admin tool
    for head, ch in per_ch:
        report["chapters"].append({k: ch[k] for k in ("file", "sid", "id", "num", "title", "lo", "topics")})
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    json.dump(report, io.open(REPORT, "w", encoding="utf-8"), ensure_ascii=False)

    # ------------------------------------------------ tracker
    write_tracker(per_ch, dups)
    errs = sum(1 for q in all_qs if q["_E"])
    print("questions: %d  | with errors (held as Draft): %d | near-duplicate pairs: %d" % (len(all_qs), errs, len(dups)))
    for q in all_qs:
        for e in q["_E"]:
            print("  ERROR %s: %s" % (q["id"], e))
    if fatal:
        for f in fatal:
            print("FATAL", f)
        sys.exit(1)


def write_tracker(per_ch, dups):
    have = {(h["subject"], L.chapter_id(h)): (h, ch) for h, ch in per_ch}
    revs = revision_chapters()
    lines = ["# ACCA Foundation question bank - progress tracker", "",
             "Generated by `_build/pipeline/build_acca_qbank.py` - do not edit by hand.",
             "Last build: %s" % datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "",
             "Target per chapter: at least %d original questions; difficulty mix about 20%% Foundation / "
             "50%% Standard / 30%% Challenging." % TARGET_MIN, "",
             "| Subject | Chapters | With questions | Complete (>= %d valid) | Questions | Valid | Awaiting review | Published | Errors |" % TARGET_MIN,
             "|---|---|---|---|---|---|---|---|---|"]
    detail = []
    tot = collections.Counter()
    for sid, rows in revs.items():
        st = collections.Counter()
        detail.append("")
        detail.append("## %s - %s" % (L.SUBJECT_META[sid]["code"], sid))
        detail.append("")
        detail.append("| Ch | Title | Qs | Valid | F/S/C % | Types | Review | Published | Errors | Topics untested |")
        detail.append("|---|---|---|---|---|---|---|---|---|---|")
        for stem, num, title, lo in rows:
            cid = "%s-ch%s" % (sid, num)
            st["chapters"] += 1
            if (sid, cid) not in have:
                detail.append("| %s | %s | 0 | 0 | - | - | 0 | 0 | 0 | all (not started) |" % (num, title))
                continue
            h, ch = have[(sid, cid)]
            qs = ch["qs"]
            valid = [q for q in qs if not q["_E"]]
            lv = collections.Counter(q["level"] for q in valid)
            nv = len(valid) or 1
            types = collections.Counter(q["type"] for q in valid)
            used = {q["topic"] for q in valid}
            missing = [t["name"] for t in h["topics"] if t["id"] not in used]
            rev = sum(1 for q in qs if q["_eff"] in ("validated", "review", "approved"))
            pub = sum(1 for q in qs if q["_eff"] == "published")
            err = sum(1 for q in qs if q["_E"])
            st["with"] += 1
            st["complete"] += 1 if len(valid) >= TARGET_MIN and not missing else 0
            st["qs"] += len(qs)
            st["valid"] += len(valid)
            st["review"] += rev
            st["pub"] += pub
            st["err"] += err
            detail.append("| %s | %s | %d | %d | %d/%d/%d | %s | %d | %d | %d | %s |" % (
                num, title, len(qs), len(valid), round(100 * lv["F"] / nv), round(100 * lv["S"] / nv),
                round(100 * lv["C"] / nv), " ".join("%s:%d" % kv for kv in sorted(types.items())), rev, pub, err,
                "; ".join(missing) if missing else "none"))
        lines.append("| %s | %d | %d | %d | %d | %d | %d | %d | %d |" % (
            L.SUBJECT_META[sid]["code"], st["chapters"], st["with"], st["complete"], st["qs"], st["valid"],
            st["review"], st["pub"], st["err"]))
        tot.update(st)
    lines.append("| **All** | %d | %d | %d | %d | %d | %d | %d | %d |" % (
        tot["chapters"], tot["with"], tot["complete"], tot["qs"], tot["valid"], tot["review"], tot["pub"], tot["err"]))
    lines += ["", "Near-duplicate pairs flagged: %d" % len(dups)]
    lines += detail
    io.open(TRACKER, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("tracker ->", os.path.relpath(TRACKER, ROOT))


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Print a study-text chapter for map authoring, with printed page markers.

    python _build/pipeline/caf_chapter_digest.py caf1 1            # whole chapter
    python _build/pipeline/caf_chapter_digest.py caf1 1 --lean     # examples trimmed

Reads _build/out/caf_pages/<book>.json (caf_extract_pages.py). Strips running
heads and the AT A GLANCE / SPOTLIGHT / STICKY NOTES navigation strip. With
--lean, each worked example keeps only its first lines so the chapter's
structure and rules can be read in one pass.
"""
import io, json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BOOK = {"caf4": "caf4v1"}
NAV = {"AT A GLANCE", "SPOTLIGHT", "STICKY NOTES"}


def toc(sid):
    out = {}
    for l in io.open(os.path.join(ROOT, "caf", "revision_maps", sid, "_subject.md"), encoding="utf-8"):
        if l.startswith("@toc "):
            n, t, r = [x.strip() for x in l[5:].split("|")]
            a, b = r.split("-")
            out[n] = (t, int(a), int(b))
    return out


def clean(text):
    keep = []
    for i, l in enumerate(text.split("\n")):
        s = re.sub(r"[-]", "", l).strip()
        if not s:
            continue
        if i < 14 and (s in NAV or s.startswith("CAF ") or s.startswith("CHAPTER ") or re.fullmatch(r"\d{1,4}", s)
                       or s.startswith("THE INSTITUTE OF CHARTERED")):
            continue
        if s in NAV:
            continue
        keep.append(s)
    return keep


def main():
    sid, num = sys.argv[1], sys.argv[2]
    lean = "--lean" in sys.argv
    title, a, b = toc(sid)[num]
    pages = json.load(io.open(os.path.join(ROOT, "_build", "out", "caf_pages", BOOK.get(sid, sid) + ".json"), encoding="utf-8"))
    print("#### %s ch%s %s (printed pp. %d-%d)" % (sid, num, title, a, b))
    in_eg = 0
    for p in pages:
        if not p["printed"] or not (a <= int(p["printed"]) <= b):
            continue
        print("\n[p.%s]" % p["printed"])
        for s in clean(p["text"]):
            if lean:
                if re.match(r"^(Example|Illustration)\s*\d+", s, re.I):
                    in_eg = 3
                    print(s)
                    continue
                if re.match(r"^\d+\.\d+(\.\d+)*\s+[A-Z]|^\d+\s+[A-Z][A-Z ,&'()-]{4,}$", s):
                    in_eg = 0
                if in_eg:
                    if in_eg > 1:
                        print("   " + s[:140])
                    in_eg -= 1 if in_eg > 1 else 0
                    continue
            print(s)


if __name__ == "__main__":
    main()

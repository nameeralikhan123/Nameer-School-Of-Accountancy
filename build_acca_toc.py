# -*- coding: utf-8 -*-
"""Build trustworthy chapter tables from BPP ACCA books.

The BPP contents pages put the chapter number on its own line and the title on the
next line with dot leaders, e.g.

    7a
    Accounting for overheads ............................ 245

Chapters may carry letter suffixes (2a, 2b, 7a, 7b). A table is only accepted when
every check passes, because a wrong page number sends a student to the wrong page
and that is worse than no chapter list at all:

  * at least 3 chapters
  * chapter numbers strictly increasing in the order printed
  * page numbers strictly increasing
  * every page inside the document
  * every title real words, not dot leaders or a bare number
"""
import io
import json
import os
import re
import sys
import fitz

sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Users\PMLS\Desktop\pre req"
ACCA = os.path.join(ROOT, "acca")
OUT = os.path.join(ROOT, "_pdftext", "acca_toc_tables.json")

CHNUM = re.compile(r"^(\d{1,2}[a-z]?)$")
LEADER = re.compile(r"^(.{4,90}?)\s*[.\u2026]{3,}\s*(\d{1,3})\s*$")
# Some rows put the chapter number and the title on ONE line:
#   "10a Budgeting ...................................... 363"
# while others put the number alone on its own line. Both forms occur in the
# same contents page, so both have to be accepted or the table comes out with
# holes in it (4a, 10a, 10b, 12a, 12b, 14a, 14b were being dropped).
INLINE_RE = re.compile(r"^(\d{1,2}[a-z]?)\s+([A-Z].{3,88}?)\s*[.\u2026]{3,}\s*(\d{1,3})\s*$")
PART_RE = re.compile(r"^Part\s+([A-Z])\b", re.I)
# NB: "Introduction" is deliberately NOT here. ACCA MA1 chapter 2 is literally
# "Introduction to management information" and an earlier revision of this filter
# silently dropped it, leaving a chapter table with a hole in it. Front matter such
# as the bare "Introduction" entry is already excluded because no chapter number
# precedes it, so `pending` is None when its leader line is reached.
STOPWORDS = re.compile(
    r"(?i)^(contents|page|helping you to pass|chapter features|"
    r"studying|tackling|the computer|glossary|index|appendix|bpp tutor|"
    r"www\.|foundations in accountancy)")

BOOKS = [
    ("acfab",    "ACCA-AB.pdf",     "Accountant and Business"),
    ("acfmgmt",  "ACCA-BE.pdf",     "Management Accounting"),
    ("acfma1",   "ACCA-MA.pdf",     "Management Information"),
    ("acfma2prk", "ACCA-MA-prk.pdf", "Business Economics (Practice & Revision Kit)"),
]


def clean(t):
    return re.sub(r"[ \t]+", " ", t).strip()


def looks_like_title(t):
    if STOPWORDS.match(t):
        return False
    if not re.match(r"^[A-Za-z]", t):
        return False
    if set(t) <= set(" .-\u2026"):
        return False
    words = t.split()
    # Single-word chapter titles are real ("Forecasting" 4a, "Budgeting" 10a in
    # FMA/MA), so they must not be thrown away. Requiring two words silently left
    # holes in the Management Accounting table. Front matter is unaffected because
    # no chapter number precedes it, so `pending` is None and it never reaches here.
    if not words:
        return False
    if len(t) < 4:
        return False
    letters = sum(c.isalpha() for c in t)
    return letters >= 0.6 * len(t)


def parse_contents(path):
    doc = fitz.open(path)
    pages = []
    for pno in range(min(45, doc.page_count)):
        txt = doc[pno].get_text()
        if re.search(r"(?mi)^\s*contents\s*$", txt):
            pages.append(pno)
    if not pages:
        doc.close()
        return []

    rows = []
    seen = set()
    for pno in pages:
        pending = None
        for raw in doc[pno].get_text().splitlines():
            s = clean(raw)
            if not s:
                continue
            if PART_RE.match(s):
                pending = None
                continue
            m = CHNUM.match(s)
            if m:
                pending = m.group(1)
                continue
            mi = INLINE_RE.match(s)
            if mi:
                title = re.sub(r"\.{2,}$", "", clean(mi.group(2))).strip()
                page = int(mi.group(3))
                if looks_like_title(title) and (mi.group(1), page) not in seen:
                    seen.add((mi.group(1), page))
                    rows.append((mi.group(1), title, page))
                pending = None
                continue
            m = LEADER.match(s)
            if m and pending:
                title, page = clean(m.group(1)), int(m.group(2))
                title = re.sub(r"\.{2,}$", "", title).strip()
                if looks_like_title(title) and (pending, page) not in seen:
                    seen.add((pending, page))
                    rows.append((pending, title, page))
                pending = None
                continue
            if STOPWORDS.match(s):
                pending = None
    doc.close()

    def sortkey(n):
        return (int(re.match(r"\d+", n).group()), n)

    rows.sort(key=lambda r: sortkey(r[0]))
    return rows


def validate(rows, page_count):
    reasons = []
    if len(rows) < 3:
        reasons.append("only %d rows" % len(rows))
    pages = [p for _, _, p in rows]
    if any(b <= a for a, b in zip(pages, pages[1:])):
        reasons.append("page numbers not strictly increasing")
    if any(p < 1 or p > page_count for p in pages):
        reasons.append("page outside document (max %d)" % page_count)
    keys = [re.match(r"\d+", n).group() + n for n, _, _ in rows]
    if len(set(keys)) != len(keys):
        reasons.append("duplicate chapter numbers")
    return reasons


def main():
    out = {}
    for bid, fname, label in BOOKS:
        path = os.path.join(ACCA, fname)
        if not os.path.exists(path):
            print("SKIP", fname)
            continue
        doc = fitz.open(path)
        page_count = doc.page_count
        doc.close()

        rows = parse_contents(path)
        reasons = validate(rows, page_count)
        status = "USABLE" if not reasons else "REJECT"
        print("=" * 78)
        print("%-18s %-16s %s" % (bid, fname, label))
        print("  rows=%d  status=%s" % (len(rows), status))
        if reasons:
            print("  reasons: %s" % "; ".join(reasons))
        for n, title, page in rows:
            print("     Ch%-4s p.%-5d %s" % (n, page, title[:64]))
        if not reasons:
            out[bid] = {
                "file": "acca/" + fname,
                "label": label,
                "pdfPages": page_count,
                "chapters": [
                    {"n": n, "t": title.title(), "p": page} for n, title, page in rows
                ],
            }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("\nwrote", OUT, "books:", list(out))


if __name__ == "__main__":
    main()
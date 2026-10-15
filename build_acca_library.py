# -*- coding: utf-8 -*-
"""Regenerate the ACCA Foundation study library.

SUPERSEDES the earlier generator of the same name, which read chapter tables from
_pdftext/acca_foundation_chapters.json (produced by extract_acca_chapters.py). Those
tables came from the mis-segmenting detector and are what shipped "Ch 1 p.30,
Ch 2 p.17" style rows -- page numbers that ran backwards. That pipeline is now dead:
nothing reads acca_foundation_chapters.json any more. build_acca_toc.py replaces it,
and this script reads its verified output.

Every book is filed by the paper its own cover names, not by its filename. The
filenames in acca/ are legacy and several are wrong:

    ACCA-BE.pdf     cover reads "Management Accounting (FMA/MA)"  -> was shown as BE
    ACCA-MA.pdf     cover reads "MA1 Management Information"     -> was shown as MA
    ACCA-MA-prk.pdf cover reads "MA2 Practice & Revision Kit"    -> was shown as MA

Chapter pages come from _pdftext/acca_toc_tables.json, which only accepts a table
that passes every check in build_acca_toc.py. Books whose table was rejected (or
that have no text layer at all, so no contents page can be read) open whole rather
than showing page numbers we cannot stand behind.

`offset` is the number of front-matter pages ahead of printed page 1, derived in
derive_acca_offset.py by locating each chapter's title in the body of the file. The
reader computes physical = printed + offset. Every ACCA book previously carried
offset 1, so every chapter jump landed in the front matter.

Book ids are kept unchanged even where the id no longer matches the paper, because
ACCA_MINDMAPS and mmSubjectsList are keyed by id and the mind maps were generated
from these exact files. Renaming the ids would silently orphan them.
"""
import io
import json
import os
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"C:\Users\PMLS\Desktop\pre req"
ACCA = os.path.join(ROOT, "acca")
TABLES = os.path.join(ROOT, "_pdftext", "acca_toc_tables.json")
FRAG = os.path.join(ROOT, "_build", "fragments", "_frag_acca_library.js")

with io.open(TABLES, encoding="utf-8") as fh:
    TOC = json.load(fh)


def size_mb(path):
    return "%.1f MB" % (os.path.getsize(path) / (1024 * 1024))


def page_count(path):
    doc = fitz.open(path)
    n = doc.page_count
    doc.close()
    return n


def chapters_for(toc_id):
    tbl = TOC.get(toc_id)
    if not tbl:
        return []
    return [{"n": c["n"], "t": c["t"], "p": c["p"]} for c in tbl["chapters"]]


# id, code, title, file, accent, edition, offset, toc id
#
# Re-added at the user's request as "F1 study text new.pdf" / "F2 study text new.pdf".
# These are byte-identical to the acca/ACCA-AB.pdf and acca/ACCA-BE.pdf copies that
# were removed earlier (verified against commit 7c8efd9), i.e. the same two books
# under new filenames. The uploads were renamed at the top level, so there was never
# a second copy -- nothing new was supplied, only the old pair restored.
#
# Removed at the user's request:
#   accfma1st  acca/ACCA-MA1-ST.pdf == "MA1 TEXT BPP.pdf"      MA1 Management Information
#   acffa2kit acca/ACCA-FA2-KIT.pdf == "FA2 KIT BPP.pdf"      FA2 practice kit
#   acfmaprk  acca/ACCA-MA-prk.pdf == no duplicate in the project root. Unlike the
#             removals above it had no copy at the top level, so deleting it is only
#             reversible from git history (added in 7c8efd9) or from the backup at
#             %TEMP%\opencode\acca-removed-backup.
#   acffa     acca/ACCA-FA.pdf     == no duplicate at the top level either. Same two
#             recovery routes.
BOOKS = [
    ("acfab",     "F1",  "Accountant and Business",
     "ACCA-AB.pdf", "#0ea5e9", "ACCA study text", 10, "acfab"),
    ("acffa2",    "F3",  "Financial Accounting (2024/25 edition)",
     "ACCA-FA-ed2.pdf", "#a78bfa", "second edition", 1, None),
    ("acffa1st",  "FA1", "Financial Accounting 1 - Recording Financial Transactions",
     "ACCA-FA1-ST.pdf", "#f472b6", "ACCA study text", 1, None),

    ("acfma",     "MA1", "Management Information (2017 edition)",
     "ACCA-MA.pdf", "#059669", "ACCA study text", 19, "acfma1"),
    ("acfbe",     "F2",  "Management Accounting",
     "ACCA-BE.pdf", "#10b981", "ACCA study text", 10, "acfmgmt"),

    ("acfma2",    "MA2", "Business Economics",
     "ACCA-MA2-ST.pdf", "#22d3ee", "ACCA study text", 1, None),
]

books = []
for bid, code, title, fname, accent, edition, offset, toc_id in BOOKS:
    path = os.path.join(ACCA, fname)
    if not os.path.exists(path):
        print("MISSING %-18s (%s) - skipped" % (fname, bid))
        continue
    chaps = chapters_for(toc_id) if toc_id else []
    entry = {
        "id": bid,
        "code": code,
        "title": title,
        "file": "acca/" + fname,
        "accent": accent,
        "sizeMB": size_mb(path),
        "pdfPages": page_count(path),
        "offset": offset,
        "edition": edition,
        "chapters": chaps,
    }
    books.append(entry)
    print("%-10s %-4s %-52s offset=%-3d chapters=%d" %
          (bid, code, title[:52], offset, len(chaps)))

payload = {"books": books}

header = ("/* ==== start of ACCA Foundation study library ==== */\n"
          "/* GENERATED by _build/pipeline/build_acca_library.py - do not hand edit.\n"
          "   Books are filed by the paper named on their own cover; filenames in\n"
          "   acca/ are legacy and several were misleading. Chapter pages are PRINTED\n"
          "   pages; the reader adds `offset` to reach the physical page. A book with\n"
          "   no reliable chapter table opens whole rather than risking a wrong jump. */\n")

line = "const ACCA_FOUNDATION_BOOKS = " + json.dumps(payload, ensure_ascii=False) + ";"
footer = "/* ==== end of ACCA Foundation study library ==== */"

text = header + line + "\n" + footer + "\n"
with io.open(FRAG, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(text)

total = sum(len(b["chapters"]) for b in books)
print("\nbooks=%d  chapters=%d" % (len(books), total))
print("wrote", FRAG, "(%.1f KB)" % (os.path.getsize(FRAG) / 1024))
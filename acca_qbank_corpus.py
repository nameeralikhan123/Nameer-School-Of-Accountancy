# -*- coding: utf-8 -*-
"""Build the originality reference corpus for the ACCA question bank.

Reads the text layer of the ACCA exam kits and study texts that sit in the
project and stores a set of hashed 8-word shingles per source. The question
bank builder compares every question stem + options against this set and
flags any question that shares wording with a kit or study text, so nothing
copied can reach "AI Validated" status.

Only hashes are stored (never the text), in _build/out/acca_qbank_corpus.json,
which is not deployed. Scanned PDFs without a text layer contribute nothing and
are listed as "no text layer" so the gap is visible.

    python _build/pipeline/acca_qbank_corpus.py
"""
import io
import json
import os
import re
import sys
import zlib

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "_build", "out", "acca_qbank_corpus.json")

SOURCES = [
    ("F1 exam kit", "F1 exam kit.pdf"),
    ("F2 exam kit", "F2 exam kit.pdf"),
    ("F3 exam kit", "F3 exan kit.pdf"),
    ("FA1 exam kit", "FA1 exam kit.pdf"),
    ("FA2 exam kit", "FA2 exam kit.pdf"),
    ("MA1 exam kit", "MA1 exam kit.pdf"),
    ("MA2 exam kit", "Ma2 exam kit.pdf"),
    ("F1 study text", "ACCA-AB.pdf"),
    ("F2 study text", "ACCA-BE.pdf"),
    ("F3 study text", "ACCA-FA-ed2.pdf"),
    ("FA1 study text", "ACCA-FA1-ST.pdf"),
    ("MA1 study text", "ACCA-MA.pdf"),
    ("MA2 study text", "ACCA-MA2-ST.pdf"),
]
N = 8


sys.path.insert(0, os.path.dirname(__file__))
from acca_qbank_lib import norm_words  # noqa: E402  (same stock-phrase handling as the checker)


def words(text):
    return norm_words(text)


def shingles(ws, n=N):
    return {zlib.crc32(" ".join(ws[i:i + n]).encode()) for i in range(len(ws) - n + 1)}


def main():
    import fitz
    out = {"n": N, "sources": {}}
    for label, fn in SOURCES:
        path = os.path.join(ROOT, fn)
        if not os.path.exists(path):
            print("missing  ", label, fn)
            out["sources"][label] = {"file": fn, "status": "missing", "h": []}
            continue
        doc = fitz.open(path)
        text = " ".join(p.get_text() for p in doc)
        ws = words(text)
        if len(ws) < 5000:
            print("no text  ", label, fn, len(ws), "words (scanned?)")
            out["sources"][label] = {"file": fn, "status": "no text layer", "h": []}
            continue
        h = sorted(shingles(ws))
        out["sources"][label] = {"file": fn, "status": "ok", "words": len(ws), "h": h}
        print("ok       ", label, fn, len(ws), "words", len(h), "shingles")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("wrote", OUT)


if __name__ == "__main__":
    main()

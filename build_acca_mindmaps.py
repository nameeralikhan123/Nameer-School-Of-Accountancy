# -*- coding: utf-8 -*-
"""
Phase 2+3: Build ACCA Foundation mind maps from extracted structure.
Creates one topic per section (not just per chapter).

Reads:   _pdftext/acca_foundation_structure.json
Writes:  _build/fragments/_frag_acca_mindmaps_data.js
"""
from __future__ import annotations
import io, json, os, re, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

import caf_diagrams as DIA
import caf_teacher  as TEA

HERE      = os.path.dirname(os.path.abspath(__file__))
ROOT      = os.path.dirname(os.path.dirname(HERE))
PDFTEXT   = os.path.join(ROOT, "_pdftext")
FRAGMENTS = os.path.join(ROOT, "_build", "fragments")
STRUCT_IN = os.path.join(PDFTEXT, "acca_foundation_structure.json")
FRAG_OUT  = os.path.join(FRAGMENTS, "_frag_acca_mindmaps_data.js")

ACCA_BOOKS = ["acfab", "acffa", "acffa2", "acfma", "acfbe", "acffa1st"]

# ── ACCA Foundation subject teacher voices ────────────────────────────────────
ACCA_SUBJECTS = {
    "acfab": {
        "code": "ACCA-AB", "name": "Accountant and Business",
        "teach": "AB ka kaam business ke andar accountant ki jagah aur zimmedari samajhna hai.",
        "why":   "ACCA yahan purpose, stakeholders aur ethical framework test karta hai.",
        "ladder": ["Role ya concept ka naam aur us ka purpose",
                   "Key stakeholder ya party",
                   "Practical impact ya real-world example",
                   "Relevant principle ya framework",
                   "Ethical / professional dimension"],
        "trap": "Framework ka naam yaad kar ke uski application bhool jana.",
        "vocab": {"stakeholder": "mutassireen", "ethics": "akhlaaqiat", "risk": "khatra"},
    },
    "acffa": {
        "code": "ACCA-FA", "name": "Financial Accounting",
        "teach": "FA mein har masla teen sawalon ka jawaab deta hai: recognize, measure, aur present.",
        "why":   "ACCA yahan double-entry, trial balance aur financial statements test karta hai.",
        "ladder": ["Account identify karo (asset / liability / income / expense / equity)",
                   "Dr / Cr side decide karo aur journal entry likho",
                   "Relevant financial statement aur line item batao",
                   "Amount calculate karo (working show karo)",
                   "Disclosure ya note, agar required ho"],
        "trap": "Journal entry likh kar financial statements mein presentation bhool jana.",
        "vocab": {"debit": "Dr side", "credit": "Cr side", "accrual": "hisaab lagana",
                  "depreciation": "tanazzul", "provision": "intizaam"},
    },
    "acffa2": {
        "code": "ACCA-FA", "name": "Financial Accounting (2024/25)",
        "teach": "FA 2024/25 wahi core double-entry hai — updated IFRS examples ke saath.",
        "why":   "ACCA yahan updated IFRS rules ke application par marks deta hai.",
        "ladder": ["Account identify karo", "Dr / Cr side decide karo",
                   "Financial statement mein line item batao",
                   "Amount calculate karo", "IFRS reference likho"],
        "trap": "Purani rules apply karna — 2024/25 edition mein IFRS changes hain.",
        "vocab": {"debit": "Dr side", "credit": "Cr side", "depreciation": "tanazzul"},
    },
    "acfma": {
        "code": "ACCA-MA", "name": "Management Accounting",
        "teach": "MA mein har cost ka behaviour decide karta hai kaunsa formula lagega.",
        "why":   "ACCA yahan cost classification, budgeting aur variance analysis test karta hai.",
        "ladder": ["Cost classify karo: fixed / variable / semi-variable",
                   "Relevant cost identify karo",
                   "Formula likho aur variables define karo",
                   "Values substitute karo, units ke saath",
                   "Interpretation ya management decision"],
        "trap": "Fixed aur variable cost ko mix karna.",
        "vocab": {"overhead": "ohra", "marginal": "hissa", "variance": "farq"},
    },
    "acfbe": {
        "code": "ACCA-BE", "name": "Business Economics",
        "teach": "BE mein har concept define, graph se explain, phir business par apply hota hai.",
        "why":   "ACCA yahan demand/supply, elasticity aur market structure test karta hai.",
        "ladder": ["Concept ki definition apne alfaz mein",
                   "Relevant formula ya relationship",
                   "Graph ya diagram mein location",
                   "Business ya economic impact",
                   "Practical example ya policy implication"],
        "trap": "Graph draw kar ke movement ya shift direction bhool jana.",
        "vocab": {"elasticity": "lachak", "equilibrium": "tawaazun", "inflation": "mehngai"},
    },
    "acffa1st": {
        "code": "ACCA-FA1", "name": "Financial Accounting 1 (Kaplan)",
        "teach": "FA1 basic double-entry se shuru ho kar ledger, trial balance aur simple financial statements tak.",
        "why":   "ACCA yahan basic bookkeeping aur simple financial statements test karta hai.",
        "ladder": ["Account identify karo (asset / liability / capital / income / expense)",
                   "Debit/Credit rule apply karo",
                   "Journal entry likho — date, debit, credit, narration",
                   "Ledger mein post karo",
                   "Trial balance mein check karo"],
        "trap": "Debit aur credit side ulat dena.",
        "vocab": {"debit": "Dr side", "credit": "Cr side", "ledger": "khaata",
                  "journal": "roznamcha", "capital": "sarmaya"},
    },
}

# Patch into CAF teacher so teach_topic() can look up our subjects
TEA.SUBJECTS.update(ACCA_SUBJECTS)

# ── Kind inference ─────────────────────────────────────────────────────────────
KIND_SIGNALS = [
    ("formula",     re.compile(r"\b(formula|equation|calculation|rate|ratio|depreciation|interest|budget|variance|cost|price)\b", re.I)),
    ("practice",    re.compile(r"\b(example|question|self.?test|practice|exercise|quiz|mcq|worked)\b", re.I)),
    ("recognition", re.compile(r"\b(recogni[sz]|classification|criteria|conditions|when to|measurement)\b", re.I)),
    ("disclosure",  re.compile(r"\b(disclos|presentat|note|display|report)\b", re.I)),
    ("procedure",   re.compile(r"\b(process|procedure|steps?|cycle|stages?|sequence|accounting for)\b", re.I)),
    ("analysis",    re.compile(r"\b(analysis|interpret|ratio|performance|trend)\b", re.I)),
    ("list",        re.compile(r"\b(types? of|kinds? of|categories|features?|characteristics?|advantages?|disadvantages?|factors?|effects?|causes?|methods?)\b", re.I)),
    ("definition",  re.compile(r"\b(introduc|definit|concept|meaning|nature|scope|overview|background|what is|principles?)\b", re.I)),
]

def infer_kind(heading: str) -> str:
    for kind, pat in KIND_SIGNALS:
        if pat.search(heading):
            return kind
    return "definition"


# ── Chapter builder ─────────────────────────────────────────────────────────────
def build_chapter(book_id: str, ch: dict) -> dict | None:
    sections = ch.get("sections") or []
    ch_num   = ch.get("num", 0)

    # If no sections, create one synthetic topic from the chapter title
    if not sections:
        sections = [{"heading": ch.get("title", "Chapter %d" % ch_num),
                     "label": "1", "page": ch.get("startPage"),
                     "body": [], "subsub": [], "formula": []}]

    topics = []
    for i, sec in enumerate(sections):
        heading = (sec.get("heading") or "").strip()
        if not heading:
            continue

        kind    = infer_kind(heading)
        tid     = "%s-ch%d-t%d" % (book_id, ch_num, i + 1)
        sec_shaped = {
            "heading": heading,
            "label":   sec.get("label", str(i + 1)),
            "page":    sec.get("page"),
            "body":    sec.get("body", []),
            "subsub":  sec.get("subsub", []),
            "formula": sec.get("formula", []),
        }

        try:
            title   = DIA.clean_label(DIA.heading_label(heading, sec.get("subsub")), 90)
            ref     = DIA.parse_reference(heading)
            dia     = DIA.diagram_for(sec_shaped, heading, kind)
            outline = DIA.build_outline(sec_shaped, title)
        except Exception:
            title   = heading[:80]
            ref     = ""
            dia     = {"type": "tree", "labels": [title], "nodes": []}
            outline = []

        try:
            teach = TEA.teach_topic(book_id, sec_shaped, title, kind, ref)
        except Exception:
            teach = {
                "what": "", "why": "", "ladder": [],
                "trap": "", "example": "", "vocab": {},
            }

        topics.append({
            "id":      tid,
            "num":     sec.get("label") or str(i + 1),
            "title":   title,
            "kind":    kind,
            "page":    sec.get("page"),
            "diagram": dia,
            "outline": outline,
            "teach":   teach,
        })

    if not topics:
        return None

    try:
        cmap = DIA.chapter_map(
            {"title": DIA.clean_label(ch.get("title", "Chapter %d" % ch_num), 90)},
            topics, max_branches=9)
    except Exception:
        cmap = {"type": "tree", "center": ch.get("title", ""), "branches": []}

    subj = ACCA_SUBJECTS.get(book_id, {})
    start = ch.get("startPage", 0)
    end   = ch.get("endPage", 0)

    return {
        "id":          "%s-ch%d" % (book_id, ch_num),
        "num":         ch_num,
        "title":       DIA.clean_label(ch.get("title", "Chapter %d" % ch_num), 110),
        "pages":       "p. %d – %d" % (start, end) if start else "",
        "subject":     subj.get("code", book_id.upper()),
        "subjectName": subj.get("name", ""),
        "map":         cmap,
        "summary":     _chapter_summary(ch),
        "revision":    _revision_notes(ch, book_id),
        "topics":      topics,
    }


def _chapter_summary(ch: dict) -> list[str]:
    bits = []
    sections = ch.get("sections") or []
    if sections and sections[0].get("body"):
        lead = re.sub(r"\s+", " ", sections[0]["body"][0]).strip()
        if len(lead) > 20:
            bits.append(lead[:240])
    heads = [s.get("heading","") for s in sections[:4] if s.get("heading","")]
    if heads:
        bits.append("Is chapter ke aham topics: " + "; ".join(heads[:6]) + ".")
    return bits


def _revision_notes(ch: dict, book_id: str) -> list[str]:
    meta  = ACCA_SUBJECTS.get(book_id, {})
    notes = [meta.get("teach", "")]
    for sec in (ch.get("sections") or [])[:3]:
        h = sec.get("heading","")
        if h:
            notes.append("— " + h[:70])
    return [n for n in notes if n][:6]


# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(STRUCT_IN):
        print("ERROR: Run extract_acca_foundation_text.py first."); return 1

    with io.open(STRUCT_IN, encoding="utf-8") as f:
        structure = json.load(f)

    out   = {}
    stats = Counter()
    dist  = Counter()

    for book_id in ACCA_BOOKS:
        book_data = structure.get(book_id)
        if not book_data:
            print("  MISSING structure for", book_id); continue

        out_ch = []
        for ch in (book_data.get("chapters") or []):
            built = build_chapter(book_id, ch)
            if built is None:
                stats["emptyChapters"] += 1
                continue
            out_ch.append(built)
            stats["chapters"] += 1
            stats["topics"]   += len(built["topics"])
            for t in built["topics"]:
                dist[t["diagram"]["type"]] += 1

        out[book_id] = out_ch
        total_t = sum(len(c["topics"]) for c in out_ch)
        print("  %-12s  %2d chapters  %3d topics" % (book_id, len(out_ch), total_t))

    # emit JS fragment
    os.makedirs(FRAGMENTS, exist_ok=True)
    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    js = ("/* GENERATED by build_acca_mindmaps.py — do not hand-edit.\n"
          "   ACCA Foundation mind maps: chapter + topic diagrams + teacher notes. */\n"
          "var ACCA_MINDMAPS = " + payload + ";\n")
    with io.open(FRAG_OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)

    print("\n  ACCA Foundation mind maps")
    print("  chapters built      : %d" % stats["chapters"])
    print("  topics built        : %d" % stats["topics"])
    print("  empty chapters skip : %d" % stats["emptyChapters"])
    print("\n  diagram types:")
    total = max(1, stats["topics"])
    for t, n in dist.most_common():
        print("     %-9s %4d  (%.0f%%)" % (t, n, 100.0 * n / total))
    print("\n  wrote: %s  (%.1f KB)" % (FRAG_OUT, os.path.getsize(FRAG_OUT) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# -*- coding: utf-8 -*-
"""ACCA Foundation question bank: format, parser, serializer and validator.

Source of truth: acca/question_bank/<subjectId>/chNN.qb  (one file per chapter,
same file names as acca/revision_maps). Human-editable, diff-friendly.

FILE HEADER
    @subject acfab
    @chapter 1                      -> portal chapter id  acfab-ch1
    @title Business Organisations and Their Stakeholders
    @lo A1, A2
    @topic t1 | Purpose of business organisations | A1     (one per topic)

QUESTION BLOCK  (starts with "=== Q<nnn>"; id = <subject>-<chapter>-<nnn>)
    type: mcq | mr | num | match | order
    level: F | S | C               foundation 20% / standard 50% / challenging 30%
    cat: concept, calc, scenario, trap, mixed, revision   (one or more)
    topic: t1
    status: draft | validated | review | approved | published | rejected
    important: 1                   optional - shows in Important Revision
    scenario: text                 optional supporting information
    q: question text
    + correct option || why it is correct          (mcq / mr)
    - wrong option || why it is wrong
    select: 2                      (mr) how many to choose
    answer: 12500  tol: 0  unit: $   (num)  -> written as separate lines
    pair: left => right            (match) correct pairs, in any order
    choice: extra right-hand choice (match distractor)
    item: text                     (order) listed in the CORRECT order
    explain: the underlying concept / rule applied to this scenario
    formula: relevant formula
    step: one working step         (repeat; numeric questions)
    check: python arithmetic        must equal the numeric answer
    mistake: common student mistake
    tip: exam tip
    src: source reference metadata (concept basis only - never copied text)
    noshuffle: 1                   options refer to each other - keep order
Lines starting with two spaces continue the previous field.
"""
import io
import json
import os
import re
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
QB_DIR = os.path.join(ROOT, "acca", "question_bank")
CORPUS = os.path.join(ROOT, "_build", "out", "acca_qbank_corpus.json")

STATUSES = ["draft", "validated", "review", "approved", "published", "rejected"]
STATUS_LABEL = {"draft": "Draft", "validated": "AI Validated", "review": "Admin Review",
                "approved": "Approved", "published": "Published", "rejected": "Rejected"}
TYPES = ["mcq", "mr", "num", "match", "order"]
LEVELS = {"F": "Foundation", "S": "Standard", "C": "Challenging"}
CATS = ["concept", "calc", "scenario", "trap", "mixed", "revision"]

# Question formats each examination actually uses (ACCA exam-format pages):
#  FA1 / MA1: 50 x 2-mark multiple choice only.
#  FA2 / MA2: MCQ, multiple response, number entry, multiple response matching.
#  BT / MA / FA (F1-F3): Section A objective test (MCQ, MR, number entry,
#  matching/drag-and-drop style) + Section B multi-task questions.
SUBJECT_META = {
    "acfab": {"code": "F1", "exam": "BT / FAB", "types": ["mcq", "mr", "num", "match", "order"],
              "syllabus": "ACCA BT (F1/FAB) - per BPP study text in portal"},
    "acfbe": {"code": "F2", "exam": "MA / FMA", "types": ["mcq", "mr", "num", "match", "order"],
              "syllabus": "ACCA MA (F2/FMA) - per BPP study text in portal"},
    "acffa2": {"code": "F3", "exam": "FA / FFA", "types": ["mcq", "mr", "num", "match", "order"],
               "syllabus": "ACCA FA (F3/FFA) - per study text ed.2 in portal"},
    "acffa1st": {"code": "FA1", "exam": "FA1", "types": ["mcq"],
                 "syllabus": "FIA FA1 - per Kaplan 2022-23 study text in portal"},
    "acffa2st": {"code": "FA2", "exam": "FA2", "types": ["mcq", "mr", "num", "match"],
                 "syllabus": "FIA FA2 - syllabus areas per BPP kit (no FA2 study text in portal)"},
    "acfma": {"code": "MA1", "exam": "MA1", "types": ["mcq"],
              "syllabus": "FIA MA1 - per BPP study text in portal"},
    "acfma2": {"code": "MA2", "exam": "MA2", "types": ["mcq", "mr", "num", "match"],
               "syllabus": "FIA MA2 - per BPP study text in portal"},
}

LIST_KEYS = {"step", "pair", "choice", "item"}
SCALAR_KEYS = ["type", "level", "cat", "topic", "status", "important", "scenario", "q", "select",
               "answer", "tol", "unit", "explain", "formula", "check", "mistake", "tip", "src", "noshuffle"]
KEY_ORDER = ["type", "level", "cat", "topic", "status", "important", "noshuffle", "scenario", "q", "select",
             "OPTIONS", "pair", "choice", "item", "answer", "tol", "unit", "explain", "formula", "step",
             "check", "mistake", "tip", "src"]


class QBError(Exception):
    pass


# ---------------------------------------------------------------- parsing
def parse_file(path):
    with io.open(path, encoding="utf-8") as f:
        text = f.read().replace("\r\n", "\n")
    return parse_text(text, path)


def parse_text(text, where="<text>"):
    head = {"topics": [], "lo": ""}
    qs = []
    cur = None
    last = None  # (container, key) for continuation lines
    for ln_no, raw in enumerate(text.split("\n"), 1):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("  ") and last is not None:
            obj, key = last
            if key == "__opt__":  # option reason continuation
                obj["why"] = (obj["why"] + "\n" + line.strip()).strip()
            elif isinstance(obj[key], list):
                obj[key][-1] = obj[key][-1] + "\n" + line.strip()
            else:
                obj[key] = obj[key] + "\n" + line.strip()
            continue
        if line.startswith("#"):
            continue
        m = re.match(r"^===\s*Q(\d+)\s*$", line)
        if m:
            cur = {"num": m.group(1), "options": [], "line": ln_no}
            for k in LIST_KEYS:
                cur[k] = []
            qs.append(cur)
            last = None
            continue
        if cur is None:
            m = re.match(r"^@(\w+)\s+(.*)$", line)
            if not m:
                raise QBError("%s:%d: expected @header or === Q block" % (where, ln_no))
            k, v = m.group(1), m.group(2).strip()
            if k == "retired":
                head.setdefault("retired", []).extend(x.strip().lstrip("Q") for x in v.split(",") if x.strip())
            elif k == "topic":
                parts = [p.strip() for p in v.split("|")]
                if len(parts) < 2:
                    raise QBError("%s:%d: @topic needs 'id | name | lo'" % (where, ln_no))
                head["topics"].append({"id": parts[0], "name": parts[1], "lo": parts[2] if len(parts) > 2 else ""})
            else:
                head[k] = v
            continue
        if line[:2] in ("+ ", "- "):
            body = line[2:]
            txt, _, why = body.partition("||")
            opt = {"text": txt.strip(), "ok": line[0] == "+", "why": why.strip()}
            cur["options"].append(opt)
            last = (opt, "__opt__")
            continue
        m = re.match(r"^([a-z]+):\s?(.*)$", line)
        if not m:
            raise QBError("%s:%d: cannot read line: %s" % (where, ln_no, line[:60]))
        k, v = m.group(1), m.group(2).strip()
        if k in LIST_KEYS:
            cur[k].append(v)
            last = (cur, k)
        elif k in SCALAR_KEYS:
            cur[k] = v
            last = (cur, k)
        else:
            raise QBError("%s:%d: unknown field '%s'" % (where, ln_no, k))
    for k in ("subject", "chapter", "title"):
        if k not in head:
            raise QBError("%s: missing @%s" % (where, k))
    for q in qs:
        q["id"] = "%s-%s-%s" % (head["subject"], head["chapter"], q["num"])
    return head, qs


# ---------------------------------------------------------------- serializing
def _emit_field(k, v):
    lines = str(v).split("\n")
    out = ["%s: %s" % (k, lines[0])]
    out += ["  " + x for x in lines[1:]]
    return out


def serialize(head, qs):
    out = ["@subject " + head["subject"], "@chapter " + str(head["chapter"]), "@title " + head["title"]]
    if head.get("lo"):
        out.append("@lo " + head["lo"])
    for t in head.get("topics", []):
        out.append("@topic %s | %s | %s" % (t["id"], t["name"], t.get("lo", "")))
    if head.get("retired"):
        out.append("@retired " + ", ".join("Q" + x for x in head["retired"]))
    for q in qs:
        out.append("")
        out.append("=== Q" + q["num"])
        for k in KEY_ORDER:
            if k == "OPTIONS":
                for o in q.get("options", []):
                    lines = (o.get("why") or "").split("\n")
                    s = ("+ " if o["ok"] else "- ") + o["text"]
                    if o.get("why"):
                        s += " || " + lines[0]
                    out.append(s)
                    out += ["  " + x for x in lines[1:] if o.get("why")]
            elif k in LIST_KEYS:
                for v in q.get(k, []):
                    out += _emit_field(k, v)
            elif q.get(k) not in (None, ""):
                out += _emit_field(k, q[k])
    return "\n".join(out) + "\n"


def next_number(head, qs):
    """Next free question number; retired (deleted) numbers are never reused."""
    used = [int(q["num"]) for q in qs] + [int(x) for x in head.get("retired", []) if x.isdigit()]
    return "%03d" % (max(used or [0]) + 1)


def from_json(obj):
    """Structured JSON (bulk import / admin form) -> internal question dict."""
    q = {"options": [], "step": [], "pair": [], "choice": [], "item": []}
    m = {"type": "type", "level": "level", "topic": "topic", "question": "q", "scenario": "scenario",
         "explanation": "explain", "formula": "formula", "check": "check", "common_mistake": "mistake",
         "exam_tip": "tip", "source": "src", "select": "select", "answer": "answer", "tol": "tol", "unit": "unit"}
    for jk, k in m.items():
        if obj.get(jk) not in (None, ""):
            q[k] = str(obj[jk])
    cat = obj.get("cat") or obj.get("category") or []
    q["cat"] = ", ".join(cat) if isinstance(cat, list) else str(cat)
    if obj.get("important"):
        q["important"] = "1"
    if obj.get("noshuffle"):
        q["noshuffle"] = "1"
    for o in obj.get("options") or []:
        q["options"].append({"text": str(o.get("text", "")).strip(), "ok": bool(o.get("correct")),
                             "why": str(o.get("why", "")).strip()})
    q["step"] = [str(s) for s in obj.get("steps") or []]
    q["pair"] = ["%s => %s" % (p[0], p[1]) for p in obj.get("pairs") or []]
    q["choice"] = [str(c) for c in obj.get("choices") or []]
    q["item"] = [str(i) for i in obj.get("items") or []]
    q["status"] = "draft"
    return q


def load_all():
    """[(path, head, qs)] for every .qb file, sorted by subject then chapter order."""
    res = []
    if not os.path.isdir(QB_DIR):
        return res
    for sid in sorted(os.listdir(QB_DIR)):
        d = os.path.join(QB_DIR, sid)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d), key=_chkey):
            if fn.endswith(".qb"):
                p = os.path.join(d, fn)
                head, qs = parse_file(p)
                res.append((p, head, qs))
    return res


def _chkey(fn):
    m = re.match(r"ch(\d+)([a-z]?)", fn)
    return (int(m.group(1)), m.group(2)) if m else (999, fn)


def chapter_id(head):
    return "%s-ch%s" % (head["subject"], str(head["chapter"]).lstrip("0") or "0")


# ---------------------------------------------------------------- validation
NUM_RX = re.compile(r"-?\(?\$?-?[0-9][0-9,]*\.?[0-9]*\)?")
SAFE_EXPR = re.compile(r"^[0-9+\-*/().,\s%e]+$")


def to_number(s):
    """First number in an option ('$12,500', '(3,200)', '12.5%') -> float or None."""
    if s is None:
        return None
    t = str(s).replace("−", "-")
    m = re.search(r"\(?-?\$?\s?[0-9][0-9,]*(\.[0-9]+)?\)?", t)
    if not m:
        return None
    g = m.group(0)
    neg = g.startswith("(") and g.endswith(")") or "-" in g
    v = float(re.sub(r"[^0-9.]", "", g))
    return -v if neg else v


def eval_check(expr):
    e = expr.replace(",", "")
    if not SAFE_EXPR.match(e):
        raise QBError("check expression has non-arithmetic characters")
    return eval(e, {"__builtins__": {}}, {})


_STOP = set("the a an of to in and or is are be for on by with as at that this which what from it its was were will".split())


# Standard technical vocabulary and requirement phrasing that every source uses.
# Each is collapsed to one token on BOTH sides of the originality comparison so
# shared terminology is not mistaken for copied expression. Definitions and
# scenario wording are deliberately NOT on this list.
STOCK_PHRASES = [
    "statement of profit or loss and other comprehensive income", "statement of financial position",
    "statement of profit or loss", "statement of cash flows", "statement of changes in equity",
    "property plant and equipment", "full year s charge in the year of acquisition",
    "full year s depreciation in the year of acquisition", "none in the year of disposal",
    "what is the depreciation charge for the year", "using the high low method",
    "which of the following statements is correct", "which of the following statements are correct",
    "which of the following is correct", "which of the following", "for the year ended",
    "as at 31 december", "year ended 31 december",
]
_STOCK_RX = [(re.compile(r"\b" + p.replace(" ", r"\s+") + r"\b"), "zz" + str(i)) for i, p in enumerate(STOCK_PHRASES)]


def norm_words(text):
    t = " ".join(re.findall(r"[a-z0-9]+", text.lower()))
    for rx, tok in _STOCK_RX:
        t = rx.sub(tok, t)
    return t.split()


def stem_words(q):
    txt = " ".join([q.get("scenario", ""), q.get("q", "")] + [o["text"] for o in q.get("options", [])])
    return norm_words(txt)


def shingles(ws, n):
    return {zlib.crc32(" ".join(ws[i:i + n]).encode()) for i in range(len(ws) - n + 1)}


_corpus = None


def corpus():
    global _corpus
    if _corpus is None:
        _corpus = {}
        if os.path.exists(CORPUS):
            data = json.load(io.open(CORPUS, encoding="utf-8"))
            for label, s in data["sources"].items():
                if s.get("h"):
                    _corpus[label] = set(s["h"])
    return _corpus


def validate_question(q, head, topic_ids):
    """-> (errors, warnings). Errors block AI Validated; warnings go to admin."""
    E, W = [], []
    sid = head["subject"]
    meta = SUBJECT_META.get(sid, {"types": TYPES})
    t = q.get("type")
    if t not in TYPES:
        E.append("type must be one of " + "/".join(TYPES))
        return E, W
    if t not in meta["types"]:
        E.append("type '%s' is not used in the %s exam" % (t, meta.get("exam", sid)))
    if q.get("level") not in LEVELS:
        E.append("level must be F, S or C")
    cats = [c.strip() for c in (q.get("cat") or "").split(",") if c.strip()]
    if not cats or any(c not in CATS for c in cats):
        E.append("cat must be from " + ",".join(CATS))
    if q.get("topic") not in topic_ids:
        E.append("topic '%s' not declared in @topic" % q.get("topic"))
    if q.get("status", "draft") not in STATUSES:
        E.append("unknown status")
    if len((q.get("q") or "").strip()) < 15:
        E.append("question text missing/too short")
    for k, label in (("explain", "concept explanation"), ("mistake", "common mistake"), ("tip", "exam tip"),
                     ("src", "source reference")):
        if not (q.get(k) or "").strip():
            E.append("missing " + label)
        elif len((q.get(k) or "").strip()) < 6:
            E.append(label + " is too short to be real content")
    # authoring scratch text must never ship
    blob = " ".join([str(v) for v in q.values() if isinstance(v, str)] +
                    [s for v in q.values() if isinstance(v, list) for s in v if isinstance(s, str)] +
                    [o.get("text", "") + " " + o.get("why", "") for o in q.get("options", []) if isinstance(o, dict)])
    if re.search(r"placeholder|\brecheck\b|needs checking|\bTODO\b|\bTBC\b", blob, re.I):
        E.append("contains authoring scratch text (placeholder/recheck/TODO)")
    opts = q.get("options", [])
    if t in ("mcq", "mr"):
        texts = [re.sub(r"\s+", " ", o["text"].lower()) for o in opts]
        if len(set(texts)) != len(texts):
            E.append("duplicate option text")
        if any(not o["text"] for o in opts):
            E.append("empty option")
        if any(not o.get("why") for o in opts):
            E.append("every option needs a '|| reason' (why right / why wrong)")
        nok = sum(1 for o in opts if o["ok"])
        if t == "mcq":
            if len(opts) != 4:
                E.append("MCQ needs exactly 4 options (has %d)" % len(opts))
            if nok != 1:
                E.append("MCQ needs exactly one correct option (has %d)" % nok)
        else:
            sel = int(q.get("select") or 0)
            if len(opts) < 4:
                E.append("multiple response needs at least 4 options")
            if sel < 2:
                E.append("multiple response needs select: N (N >= 2)")
            if nok != sel:
                E.append("select: %s but %d options marked correct" % (q.get("select"), nok))
            if nok >= len(opts):
                E.append("every option is correct")
        if any(re.search(r"\b(all|none) of the above\b|\bboth [a-d] and [a-d]\b", x) for x in texts) and not q.get("noshuffle"):
            W.append("option refers to other options - add noshuffle: 1")
    elif opts:
        E.append("options are only for mcq / mr")
    if t == "num":
        try:
            float(str(q.get("answer", "")).replace(",", ""))
        except ValueError:
            E.append("number entry needs a numeric answer:")
        if not q.get("check"):
            E.append("number entry needs check: (arithmetic proof)")
    if t == "match":
        if len(q.get("pair", [])) < 3:
            E.append("matching needs at least 3 pairs")
        for p in q.get("pair", []):
            if "=>" not in p:
                E.append("pair needs 'left => right'")
        lefts = [p.split("=>")[0].strip().lower() for p in q.get("pair", [])]
        if len(set(lefts)) != len(lefts):
            E.append("duplicate left-hand item in matching")
    if t == "order" and len(q.get("item", [])) < 4:
        E.append("ordering needs at least 4 items")
    is_calc = "calc" in cats or t == "num"
    if is_calc:
        if len(q.get("step", [])) < 2:
            E.append("calculation question needs step-by-step workings (2+ step: lines)")
        if not q.get("formula"):
            W.append("calculation question has no formula: line")
        if not q.get("check"):
            E.append("calculation question needs check: (the arithmetic is re-done by the validator)")
    if q.get("check"):
        try:
            val = eval_check(q["check"])
            if t == "num":
                ans = float(str(q.get("answer", "0")).replace(",", ""))
                tol = float(q.get("tol") or 0)
                if abs(val - ans) > max(tol, 1e-6):
                    E.append("check gives %s but answer is %s" % (round(val, 4), ans))
            elif t == "mcq":
                ok = [o for o in opts if o["ok"]]
                if ok:
                    num = to_number(ok[0]["text"])
                    if num is None:
                        E.append("check: given but the correct option has no number")
                    elif abs(abs(num) - abs(val)) > max(0.5, abs(val) * 0.0005) and abs(num - round(val, 2)) > 0.01:
                        E.append("check gives %s but correct option says %s" % (round(val, 4), ok[0]["text"]))
                    # Same figure in two options is only ambiguous when the options are bare
                    # numbers; "$500 in funds" vs "$500 overdrawn" deliberately test direction.
                    bare = lambda s: re.match(r"^[\s$%(),.\d\-]+$", s) is not None  # noqa: E731
                    others = [to_number(o["text"]) for o in opts if not o["ok"] and bare(o["text"])]
                    if num is not None and bare(ok[0]["text"]) and any(x is not None and abs(x - num) < 1e-9 for x in others):
                        E.append("a wrong option has the same value as the answer")
        except QBError as e:
            E.append(str(e))
        except Exception as e:  # noqa
            E.append("check expression failed: %s" % e)
    return E, W


def originality(q):
    """Return (worst_source, overlap_ratio, shared) against kits / study texts."""
    ws = stem_words(q)
    sh = shingles(ws, 8)
    if not sh:
        return None, 0.0, 0
    best = (None, 0.0, 0)
    for label, hs in corpus().items():
        shared = len(sh & hs)
        r = shared / float(len(sh))
        if r > best[1]:
            best = (label, r, shared)
    return best


def near_duplicates(all_qs, threshold=0.6):
    """Pairs of question ids that ask essentially the same thing.

    A pair is flagged when the question + options are near-identical (5-word
    shingles, Jaccard >= threshold) AND their scenarios are also similar (or
    neither has one). This lets several questions share one scenario (as in
    multi-task questions) and lets two different scenarios share a short
    standard requirement such as "What is profit under marginal costing?"."""
    def jac(a, b):
        if not a or not b:
            return 1.0 if not a and not b else 0.0
        return len(a & b) / float(len(a | b))
    sigs = []
    for q in all_qs:
        txt = " ".join([q.get("q", "")] + [o["text"] for o in q.get("options", [])] + q.get("pair", []) + q.get("item", []))
        sigs.append((q["id"], shingles(norm_words(txt), 5), shingles(norm_words(q.get("scenario", "")), 5)))
    out = []
    for i in range(len(sigs)):
        a_id, a, sa = sigs[i]
        if not a:
            continue
        for j in range(i + 1, len(sigs)):
            b_id, b, sb = sigs[j]
            if not b or not (a & b):
                continue
            jq = jac(a, b)
            if jq >= threshold and jac(sa, sb) >= 0.5:
                out.append((a_id, b_id, round(jq, 2)))
    return out


def to_runtime(q, head, topic_map):
    """Compact runtime row shipped to the browser."""
    cats = [c.strip() for c in (q.get("cat") or "").split(",") if c.strip()]
    row = {
        "id": q["id"], "t": q["type"], "l": q["level"], "c": cats, "tp": q["topic"],
        "q": q.get("q", ""), "x": q.get("explain", ""), "m": q.get("mistake", ""), "tip": q.get("tip", ""),
        "src": q.get("src", ""),
    }
    for k, rk in (("scenario", "sc"), ("formula", "f"), ("unit", "u")):
        if q.get(k):
            row[rk] = q[k]
    if q.get("step"):
        row["st"] = q["step"]
    if q.get("important"):
        row["imp"] = 1
    if q.get("noshuffle"):
        row["ns"] = 1
    if q["type"] in ("mcq", "mr"):
        row["o"] = [o["text"] for o in q["options"]]
        row["w"] = [o.get("why", "") for o in q["options"]]
        row["a"] = [i for i, o in enumerate(q["options"]) if o["ok"]]
        if q["type"] == "mr":
            row["sel"] = int(q["select"])
    elif q["type"] == "num":
        row["a"] = float(str(q["answer"]).replace(",", ""))
        row["tol"] = float(q.get("tol") or 0)
    elif q["type"] == "match":
        pairs = [[s.strip() for s in p.split("=>", 1)] for p in q["pair"]]
        row["pl"] = [p[0] for p in pairs]
        right = []
        for p in pairs:
            if p[1] not in right:
                right.append(p[1])
        for c in q.get("choice", []):
            if c not in right:
                right.append(c)
        row["pr"] = right
        row["a"] = [right.index(p[1]) for p in pairs]
    elif q["type"] == "order":
        row["it"] = list(q["item"])
    return row

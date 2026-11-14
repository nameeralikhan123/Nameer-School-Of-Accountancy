# -*- coding: utf-8 -*-
"""ACCA question bank ADMIN - local review / approval / import tool.

    python _build/tools/acca_qbank_admin.py          then open http://127.0.0.1:8791

Runs on this computer only (bound to 127.0.0.1) and edits the source files in
acca/question_bank/*.qb directly, so nothing about it is deployed and no admin
credentials ever reach the student site. Every write is validated first and
rebuilds the report; "Install into portal" rebuilds the published bank and
splices it into index.html (then commit + push to deploy as usual).

Safety rules enforced here:
  * question ids are never changed or reused (deleted numbers are retired);
  * bulk import refuses any id that already exists and validates every row;
  * a question with failing checks can be saved, but the builder holds it as
    Draft and it can never be published;
  * student attempt records live per student in Firestore/localStorage and are
    keyed by question id - nothing here touches them.
"""
import http.server
import io
import json
import os
import subprocess
import sys
import urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "pipeline"))
import acca_qbank_lib as L  # noqa: E402

ROOT = L.ROOT
PORT = 8791
PAGE = os.path.join(HERE, "acca_qbank_admin.html")
REPORT = os.path.join(ROOT, "_build", "out", "acca_qbank_report.json")
PY = sys.executable


def run(*args):
    p = subprocess.run([PY] + list(args), cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def rebuild():
    return run(os.path.join("_build", "pipeline", "build_acca_qbank.py"), "--preview")


def file_for(qid):
    sid, ch, num = qid.rsplit("-", 2)
    for path, head, qs in L.load_all():
        if head["subject"] == sid and str(head["chapter"]) == ch:
            return path, head, qs
    raise KeyError("no chapter file for " + qid)


def write(path, head, qs):
    text = L.serialize(head, qs)
    L.parse_text(text, path)  # round-trip check before touching the file
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)


def block_text(q):
    """The DSL block of one question (for the raw editor)."""
    return L.serialize({"subject": "x", "chapter": "0", "title": "x", "topics": []}, [q]).split("\n", 3)[3].strip() + "\n"


def bank_payload():
    rep = json.load(io.open(REPORT, encoding="utf-8")) if os.path.exists(REPORT) else {"questions": {}}
    out = {"chapters": [], "questions": [], "duplicates": rep.get("duplicates", [])}
    for path, head, qs in L.load_all():
        cid = L.chapter_id(head)
        out["chapters"].append({"sid": head["subject"], "id": cid, "num": str(head["chapter"]), "title": head["title"],
                                "topics": head["topics"], "file": os.path.relpath(path, ROOT).replace("\\", "/")})
        for q in qs:
            r = rep["questions"].get(q["id"], {})
            row = {k: v for k, v in q.items() if not k.startswith("_") and k != "line"}
            row.update({"sid": head["subject"], "ch": cid, "eff": r.get("status", "?"), "errors": r.get("errors", []),
                        "warnings": r.get("warnings", []), "raw": block_text(q)})
            out["questions"].append(row)
    return out


def set_status(ids, status):
    if status not in L.STATUSES:
        raise ValueError("bad status")
    rep = json.load(io.open(REPORT, encoding="utf-8"))
    by_file = {}
    for qid in ids:
        if status in ("approved", "published") and rep["questions"].get(qid, {}).get("errors"):
            raise ValueError("%s fails validation - fix it before approving/publishing" % qid)
        path, head, qs = file_for(qid)
        by_file.setdefault(path, (head, qs))
        for q in by_file[path][1]:
            if q["id"] == qid:
                if status == "published" and q.get("status") not in ("approved", "published"):
                    raise ValueError("%s must be Approved before it is Published" % qid)
                q["status"] = status
    for path, (head, qs) in by_file.items():
        write(path, head, qs)


def save_raw(qid, raw):
    path, head, qs = file_for(qid)
    num = qid.rsplit("-", 1)[1]
    _, parsed = L.parse_text("@subject x\n@chapter 0\n@title x\n\n=== Q%s\n%s" % (num, raw.split("\n", 1)[1] if raw.startswith("=== Q") else raw))
    if len(parsed) != 1:
        raise ValueError("the editor must contain exactly one question")
    nq = parsed[0]
    nq["num"] = num
    for i, q in enumerate(qs):
        if q["id"] == qid:
            nq["id"] = qid
            if nq.get("status") in ("approved", "published") and q.get("status") != nq.get("status"):
                nq["status"] = q.get("status")  # status changes go through the approval buttons
            qs[i] = nq
            write(path, head, qs)
            return
    raise KeyError(qid)


def add_raw(cid, raw):
    for path, head, qs in L.load_all():
        if L.chapter_id(head) == cid:
            num = L.next_number(head, qs)
            body = raw.split("\n", 1)[1] if raw.startswith("=== Q") else raw
            _, parsed = L.parse_text("@subject x\n@chapter 0\n@title x\n\n=== Q%s\n%s" % (num, body))
            nq = parsed[0]
            nq["num"] = num
            nq["status"] = "draft"
            qs.append(nq)
            write(path, head, qs)
            return "%s-%s-%s" % (head["subject"], head["chapter"], num)
    raise KeyError(cid)


def delete(qid):
    path, head, qs = file_for(qid)
    num = qid.rsplit("-", 1)[1]
    qs2 = [q for q in qs if q["id"] != qid]
    if len(qs2) == len(qs):
        raise KeyError(qid)
    head.setdefault("retired", []).append(num)
    write(path, head, qs2)


def import_json(rows):
    """Validate every row first; write nothing unless all rows are acceptable."""
    files = {L.chapter_id(h): (p, h, qs) for p, h, qs in L.load_all()}
    existing = {q["id"] for _, _, qs in files.values() for q in qs}
    plan, problems = [], []
    for i, obj in enumerate(rows):
        cid = "%s-ch%s" % (obj.get("subject"), str(obj.get("chapter", "")).lstrip("0"))
        if cid not in files:
            problems.append("row %d: unknown subject/chapter %s" % (i + 1, cid))
            continue
        if obj.get("id") and obj["id"] in existing:
            problems.append("row %d: id %s already exists - imports never overwrite" % (i + 1, obj["id"]))
            continue
        q = L.from_json(obj)
        path, head, qs = files[cid]
        E, W = L.validate_question(q, head, {t["id"] for t in head["topics"]})
        if E:
            problems.append("row %d: %s" % (i + 1, "; ".join(E)))
            continue
        plan.append((cid, q))
    if problems:
        return {"ok": False, "imported": 0, "problems": problems}
    added = []
    for cid, q in plan:
        path, head, qs = files[cid]
        q["num"] = L.next_number(head, qs)
        q["id"] = "%s-%s-%s" % (head["subject"], head["chapter"], q["num"])
        qs.append(q)
        added.append(q["id"])
    for cid in {c for c, _ in plan}:
        path, head, qs = files[cid]
        write(path, head, qs)
    return {"ok": True, "imported": len(added), "ids": added, "problems": []}


class H(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path in ("/", "/index.html"):
            return self._send(200, io.open(PAGE, "rb").read(), "text/html")
        if u.path == "/api/bank":
            return self._send(200, bank_payload())
        if u.path == "/api/progress":
            return self._send(200, io.open(os.path.join(L.QB_DIR, "PROGRESS.md"), "rb").read(), "text/plain")
        self._send(404, {"error": "not found"})

    def do_POST(self):
        # Same-origin only: refuse requests a web page on another site could forge.
        origin = self.headers.get("Origin")
        if origin and origin not in ("http://127.0.0.1:%d" % PORT, "http://localhost:%d" % PORT):
            return self._send(403, {"error": "cross-origin request refused"})
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            p = urllib.parse.urlparse(self.path).path
            res = {"ok": True}
            if p == "/api/status":
                set_status(body["ids"], body["status"])
            elif p == "/api/save":
                save_raw(body["id"], body["raw"])
            elif p == "/api/add":
                res["id"] = add_raw(body["chapter"], body["raw"])
            elif p == "/api/delete":
                delete(body["id"])
            elif p == "/api/import":
                rows = body["rows"]
                if isinstance(rows, dict):
                    rows = rows.get("questions", [rows])
                res = import_json(rows)
            elif p == "/api/install":
                code, out = rebuild()
                code2, out2 = run(os.path.join("_build", "tools", "apply_acca_practice.py"), "--preview")
                return self._send(200 if code == 0 and code2 == 0 else 500, {"ok": code == 0 and code2 == 0, "log": out + out2})
            else:
                return self._send(404, {"error": "unknown action"})
            code, out = rebuild()
            res["build"] = out[-2000:]
            self._send(200, res)
        except (ValueError, KeyError, L.QBError) as e:
            self._send(400, {"ok": False, "error": str(e)})


def main():
    rebuild()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print("ACCA question bank admin: http://127.0.0.1:%d  (Ctrl+C to stop)" % PORT)
    srv.serve_forever()


if __name__ == "__main__":
    main()

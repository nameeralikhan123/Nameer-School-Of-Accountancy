# ACCA question bank - authoring and bulk import

Source of truth: `acca/question_bank/<subjectId>/chNN.qb` (one file per study-text chapter).
The question format is documented at the top of `_build/pipeline/acca_qbank_lib.py`.

## Workflow

| Step | Command / tool |
|---|---|
| New chapter file (topics taken from the revision map) | `python _build/pipeline/build_acca_qbank.py --scaffold acfab ch02` |
| Validate everything, update `PROGRESS.md` | `python _build/pipeline/build_acca_qbank.py --preview` |
| Review, approve, publish, edit, import | `python _build/tools/acca_qbank_admin.py` -> http://127.0.0.1:8791 |
| Install published questions into the portal | admin "Install into portal", or `python _build/tools/apply_acca_practice.py --preview` |
| Gate before deploying | `python _build/guards/verify_acca_practice.py` |

Publishing states: **Draft** (fails a check) -> **AI Validated** (all automatic checks pass) ->
**Admin Review** -> **Approved** -> **Published**, or **Rejected**. Only Published questions are
shipped in `index.html`. `_acca_practice_preview.html` (git-ignored, never deployed) also
shows AI Validated / Admin Review / Approved questions so they can be tried as a student.

Automatic checks: schema and required explanation fields; exactly one correct MCQ option;
multiple-response count; every option has a reason; calculation questions have 2+ workings
steps and a `check:` arithmetic expression that the validator re-computes against the answer;
question formats allowed for that exam (FA1/MA1 are MCQ-only); near-duplicates across the bank;
wording overlap with the exam kits / study texts in the project (8-word runs).

## Bulk JSON import

Upload a JSON array (or `{"questions": [...]}`) in the admin tool. Every row is validated
first and **nothing is written unless every row passes**. Ids are assigned automatically;
a row that names an existing `id` is refused (imports never overwrite).

```json
[
  {
    "subject": "acfab", "chapter": "1", "topic": "t2",
    "type": "mcq", "level": "S", "cat": ["concept"],
    "question": "Which ...?",
    "scenario": "",
    "options": [
      {"text": "Option", "correct": true,  "why": "Why it is right"},
      {"text": "Option", "correct": false, "why": "Why it is wrong"},
      {"text": "Option", "correct": false, "why": "Why it is wrong"},
      {"text": "Option", "correct": false, "why": "Why it is wrong"}
    ],
    "explanation": "Underlying concept applied to the scenario",
    "formula": "", "steps": [], "check": "",
    "common_mistake": "...", "exam_tip": "...",
    "source": "Study text ch1 (concept basis; original question)",
    "important": false
  }
]
```

Other types: `"type": "mr"` + `"select": 2`; `"type": "num"` + `"answer": 12500, "tol": 0, "unit": "$", "check": "50000/4"`;
`"type": "match"` + `"pairs": [["left", "right"], ...], "choices": ["extra right-hand option"]`;
`"type": "order"` + `"items": [...]` in the correct order.

# -*- coding: utf-8 -*-
"""
Build Official ACCA Foundation Final Mock Exams for all 7 Subjects:
  1. F1  (acfab)    - Accountant in Business (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)
  2. F2  (acfbe)    - Management Accounting (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)
  3. F3  (acffa2)   - Financial Accounting (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)
  4. FA1 (acffa1st) - Recording Financial Transactions (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)
  5. FA2 (acffa2st) - Maintaining Financial Records (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)
  6. MA1 (acfma)    - Management Information (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)
  7. MA2 (acfma2)   - Managing Costs and Finances (50 Qs, 100 Marks, 150 Mins / 2.5 Hrs)

Each Final Mock Exam contains:
  - 50 Questions drawn across the entire syllabus
  - 30 Single Choice Scenario & Calculation Questions
  - 10 Select ANY TWO Options (Multiple Response)
  - 10 True / False Statement Analysis Questions
  - 150-minute (2.5-hour) countdown timer
  - Total marks: 100 (2 marks per question), Pass mark: 50%
  - Complete step-by-step working, Roman Urdu explanations, and ACCA CBE examiner tips.
"""
from __future__ import annotations

import io
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
INDEX_PATH = os.path.join(ROOT, "index.html")
FRAG_MCQS = os.path.join(ROOT, "_build", "fragments", "_frag_acca_mcqs.js")
FRAG_MOCKS_OUT = os.path.join(ROOT, "_build", "fragments", "_frag_acca_mock_exams.js")

SUBJECT_METAS = {
    "acfab": {
        "title": "F1: Accountant in Business Final Mock Exam",
        "code": "F1 MOCK",
        "accent": "#0ea5e9"
    },
    "acfbe": {
        "title": "F2: Management Accounting Final Mock Exam",
        "code": "F2 MOCK",
        "accent": "#10b981"
    },
    "acffa2": {
        "title": "F3: Financial Accounting Final Mock Exam",
        "code": "F3 MOCK",
        "accent": "#a78bfa"
    },
    "acffa1st": {
        "title": "FA1: Recording Financial Transactions Final Mock Exam",
        "code": "FA1 MOCK",
        "accent": "#f472b6"
    },
    "acffa2st": {
        "title": "FA2: Maintaining Financial Records Final Mock Exam",
        "code": "FA2 MOCK",
        "accent": "#eab308"
    },
    "acfma": {
        "title": "MA1: Management Information Final Mock Exam",
        "code": "MA1 MOCK",
        "accent": "#059669"
    },
    "acfma2": {
        "title": "MA2: Managing Costs and Finances Final Mock Exam",
        "code": "MA2 MOCK",
        "accent": "#22d3ee"
    }
}

def load_mcq_bank():
    """Load the ACCA MCQ bank from the fragment."""
    with io.open(FRAG_MCQS, "r", encoding="utf-8") as f:
        c = f.read()
    prefix = "var ACCA_MCQ_BANK = "
    pos = c.find(prefix) + len(prefix)
    pos_end = c.find(";\n\n(function attachAccaMcqBank()", pos)
    return json.loads(c[pos:pos_end])

def build_subject_mock(subject_key: str, subj_chaps: dict, meta: dict):
    """
    Select 50 representative questions across all chapters:
      - 30 Single-Choice
      - 10 Multiple Response (Select ANY TWO)
      - 10 True / False
    """
    chap_ids = list(subj_chaps.keys())
    num_chaps = len(chap_ids)

    # Collect questions by category across chapters
    single_pool = []
    multi_pool = []
    tf_pool = []

    for ch_id in chap_ids:
        for q in subj_chaps[ch_id]:
            q_type = q.get("type", "single")
            item = {
                "subject": subject_key,
                "chapter": ch_id,
                "question": q["qText"],
                "options": q["options"],
                "correct": q["correct"],
                "type": q_type,
                "marks": 2,
                "working": q.get("working", ""),
                "romanUrdu": q.get("romanUrdu", ""),
                "examTip": q.get("examTip", ""),
                "explanation": f"{q.get('working', '')}\n\nRoman Urdu: {q.get('romanUrdu', '')}\n\nExaminer Tip: {q.get('examTip', '')}"
            }
            if q_type == "multiple":
                multi_pool.append(item)
            elif q_type == "true_false":
                tf_pool.append(item)
            else:
                single_pool.append(item)

    # Pick 30 single, 10 multi, 10 tf evenly distributed
    selected_questions = []

    # 1. Select 30 single choice
    step_s = max(1, len(single_pool) // 30)
    for i in range(30):
        idx = (i * step_s) % len(single_pool)
        q = dict(single_pool[idx])
        q["id"] = len(selected_questions) + 1
        selected_questions.append(q)

    # 2. Select 10 multi-select
    step_m = max(1, len(multi_pool) // 10)
    for i in range(10):
        idx = (i * step_m) % len(multi_pool)
        q = dict(multi_pool[idx])
        q["id"] = len(selected_questions) + 1
        selected_questions.append(q)

    # 3. Select 10 true/false
    step_t = max(1, len(tf_pool) // 10)
    for i in range(10):
        idx = (i * step_t) % len(tf_pool)
        q = dict(tf_pool[idx])
        q["id"] = len(selected_questions) + 1
        selected_questions.append(q)

    mock_exam_def = {
        "title": meta["title"],
        "code": meta["code"],
        "totalMarks": 100,
        "grandTotal": 100,
        "timeLimit": 150,  # 150 mins = 2.5 hours
        "accent": meta["accent"],
        "marksPerQuestion": 2,
        "passMark": 50,
        "note": f"Official ACCA CBE examination standard final mock exam for {meta['code']}. Covers all syllabus chapters with 50 questions, 100 marks total, and a 150-minute (2.5-hour) countdown timer.",
        "questions": selected_questions
    }

    return mock_exam_def

def main():
    print("=" * 80)
    print(" BUILDING FINAL MOCK EXAMS FOR ALL 7 ACCA FOUNDATION SUBJECTS")
    print(" 50 Questions, 100 Marks, 150 Minutes (2.5 Hours) Timer Each")
    print(" Single Choice (30), Select ANY TWO (10), True / False (10)")
    print("=" * 80)

    mcq_bank = load_mcq_bank()
    acca_mocks = {}

    for subj_key, meta in SUBJECT_METAS.items():
        if subj_key not in mcq_bank:
            print(f"Warning: {subj_key} not found in MCQ bank!")
            continue
        mock_obj = build_subject_mock(subj_key, mcq_bank[subj_key], meta)
        acca_mocks[subj_key] = mock_obj
        print(f"  ✓ {meta['code']} Final Mock built: {len(mock_obj['questions'])} questions, {mock_obj['timeLimit']} mins (2.5 hrs)")

    # 1. Write the fragment
    print(f"\nWriting fragment to {FRAG_MOCKS_OUT}...")
    with io.open(FRAG_MOCKS_OUT, "w", encoding="utf-8") as f:
        f.write("/* ==========================================================================\n")
        f.write(" * ACCA FOUNDATION FINAL MOCK EXAMS  --  generated, do not hand edit\n")
        f.write(" * 7 Subjects: F1, F2, F3, FA1, FA2, MA1, MA2\n")
        f.write(" * Standard: 50 Questions, 100 Marks, 150 Minutes (2.5 Hours) Timer Each\n")
        f.write(" * ========================================================================== */\n")
        f.write("var ACCA_MOCK_EXAMS = ")
        json.dump(acca_mocks, f, ensure_ascii=False, separators=(',', ':'))
        f.write(";\n\n")
        f.write("(function attachAccaMockExams() {\n")
        f.write("    if (typeof mockExamDataStore === 'undefined' || !mockExamDataStore) return;\n")
        f.write("    Object.keys(ACCA_MOCK_EXAMS).forEach(function (key) {\n")
        f.write("        mockExamDataStore[key] = ACCA_MOCK_EXAMS[key];\n")
        f.write("    });\n")
        f.write("})();\n")
        f.write("/* ==== end of ACCA Mock Exams ==== */\n")

    # 2. Patch index.html
    print("\nPatching index.html...")
    with io.open(INDEX_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # A. Splice ACCA_MOCK_EXAMS right after mockExamDataStore initialization
    frag_content = io.open(FRAG_MOCKS_OUT, "r", encoding="utf-8").read()
    mock_start = "/* ==========================================================================\n * ACCA FOUNDATION FINAL MOCK EXAMS"
    mock_sentinel = "/* ==== end of ACCA Mock Exams ==== */"

    if mock_start in html:
        print("  Replacing existing ACCA Mock Exams block...")
        pos_s = html.find(mock_start)
        pos_e = html.find(mock_sentinel, pos_s) + len(mock_sentinel)
        html = html[:pos_s] + frag_content.strip() + html[pos_e:]
    else:
        print("  Inserting ACCA Mock Exams block after mockExamDataStore...")
        pos_mstore = html.find("const mockExamDataStore = {")
        pos_mstore_end = html.find("};let currentMockExam = null;", pos_mstore) + 2
        html = html[:pos_mstore_end] + "\n\n" + frag_content.strip() + "\n\n" + html[pos_mstore_end:]

    # B. Add Level Switcher Tabs to view-mockexams
    old_view_header = """                <section id="view-mockexams" class="view-section">
                    <div class="section-title">
                        <span>PRC Subject-Wise Final Mock Exams &mdash; 60 MCQs Per PRC Subject</span>
                        <span class="badge badge-gold">60 MCQs Per Subject &bull; 150 Minutes (2.5 Hours) Timer</span>
                    </div>

                    <!-- DYNAMIC CONTAINER FOR MOCK EXAM PORTAL & LIVE SIMULATOR -->
                    <div id="mock-exams-portal-container">"""

    new_view_header = """                <section id="view-mockexams" class="view-section">
                    <div class="section-title">
                        <span id="mock-section-title">Final Mock Exam Centre &mdash; Full Examination Standard</span>
                        <span class="badge badge-gold" id="mock-scope-badge">150 Minutes (2.5 Hours) Timer</span>
                    </div>

                    <!-- LEVEL TABS: PRC / ACCA FOUNDATION -->
                    <div class="study-level-tabs" id="mock-level-tabs" style="margin-bottom:20px;">
                        <button class="study-level-btn" onclick="switchMockLevel('prc')" data-track="prc" id="mock-tab-prc">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                            <span>PRC &middot; ICAP</span>
                        </button>
                        <button class="study-level-btn active" onclick="switchMockLevel('acf')" data-track="acf" id="mock-tab-acf">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                            <span>ACCA &middot; Foundation Level</span>
                        </button>
                    </div>

                    <!-- DYNAMIC CONTAINER FOR MOCK EXAM PORTAL & LIVE SIMULATOR -->
                    <div id="mock-exams-portal-container">"""

    if old_view_header in html:
        html = html.replace(old_view_header, new_view_header, 1)
        print("  Added level switcher tabs to view-mockexams!")

    # C. Upgrade switchMockLevel and trackMockKeys
    old_track_keys = """function trackMockKeys() {
    const store = (typeof mockExamDataStore !== 'undefined') ? mockExamDataStore : {};
    return Object.keys(store).filter(function (k) {
        return planAllowsSubject(k);
    });
}"""

    new_track_keys = """let currentMockLevel = 'acf';

function switchMockLevel(level) {
    currentMockLevel = planNormaliseTrack(level);
    syncTrackTabs('mock-level-tabs', currentMockLevel);
    renderMockExamsPortal();
}

function trackMockKeys() {
    const store = (typeof mockExamDataStore !== 'undefined') ? mockExamDataStore : {};
    const level = currentMockLevel || 'acf';
    return Object.keys(store).filter(function (k) {
        return planLevelOf(k) === level && planAllowsSubject(k);
    });
}"""

    if old_track_keys in html:
        html = html.replace(old_track_keys, new_track_keys, 1)
        print("  Updated trackMockKeys and added switchMockLevel!")

    # D. Upgrade renderMockExamsPortal to show dynamic level descriptions
    old_portal_card = "A subject-wise final mock of ${exam.questions.length} MCQs drawn from every chapter of this PRC subject, with a ${exam.timeLimit}-minute timer and ${exam.marksPerQuestion || 2} marks per question. Every question is generated practice grounded in your ICAP study texts &mdash; it is not an official ICAP paper."
    new_portal_card = "${exam.note || `A subject-wise final mock of ${exam.questions.length} questions drawn from across the syllabus, with a ${exam.timeLimit}-minute (2.5-hour) timer and ${exam.marksPerQuestion || 2} marks per question.`}"

    if old_portal_card in html:
        html = html.replace(old_portal_card, new_portal_card, 1)
        print("  Updated renderMockExamsPortal card description!")

    # E. Upgrade Mock Exam Player for Multi-Select (Select TWO) and True/False
    old_render_mock_q = "document.getElementById('mock-question-text').innerText = q.question;\n\n                const optionsContainer = document.getElementById('mock-options-container');\n                optionsContainer.innerHTML = q.options.map((opt, idx) => {\n                    const isSelected = currentMockExam.userAnswers[currentMockExam.currentIndex] === idx;"
    
    new_render_mock_q = """document.getElementById('mock-question-text').innerText = q.question;

                const isMulti = q.type === 'multiple' || Array.isArray(q.correct);
                const isTF = q.type === 'true_false';
                const curAns = currentMockExam.userAnswers[currentMockExam.currentIndex];
                const multiPicks = Array.isArray(curAns) ? curAns : [];

                const optionsContainer = document.getElementById('mock-options-container');
                optionsContainer.innerHTML = (isMulti ? '<div style="margin-bottom:12px;"><span class="badge badge-warning" style="background:#f59e0b; color:#000; font-weight:700;">Select ANY TWO Options</span></div>' : (isTF ? '<div style="margin-bottom:12px;"><span class="badge badge-info" style="background:#0ea5e9; color:#fff; font-weight:700;">True / False</span></div>' : '')) + q.options.map((opt, idx) => {
                    let isSelected = false;
                    if (isMulti) {
                        isSelected = multiPicks.indexOf(idx) !== -1;
                        return `
                            <button onclick="toggleMockExamMultiOption(${idx})" style="width:100%; text-align:left; padding:14px 18px; border-radius:10px; border:1px solid ${isSelected ? '#38bdf8' : 'var(--border-color)'}; background:${isSelected ? 'rgba(56,189,248,0.15)' : 'transparent'}; color:var(--text-main); cursor:pointer; display:flex; align-items:center; gap:12px; transition:all 0.15s; margin-bottom:8px;">
                                <span style="width:24px; height:24px; border-radius:4px; border:2px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.3)'}; display:flex; align-items:center; justify-content:center; background:${isSelected ? '#38bdf8' : 'transparent'}; color:#000; font-weight:700; font-size:13px;">${isSelected ? '✓' : ''}</span>
                                <span style="width:28px; height:28px; border-radius:50%; background:${isSelected ? 'var(--blue-500)' : 'var(--bg-input)'}; color:${isSelected ? 'white' : 'var(--text-main)'}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">${String.fromCharCode(65 + idx)}</span>
                                <span style="flex:1;">${opt}</span>
                            </button>
                        `;
                    } else {
                        isSelected = curAns === idx;
                        return `
                            <button onclick="selectMockExamOption(${idx})" style="width:100%; text-align:left; padding:14px 18px; border-radius:10px; border:1px solid ${isSelected ? 'var(--blue-500)' : 'var(--border-color)'}; background:${isSelected ? 'rgba(37,99,235,0.12)' : 'transparent'}; color:var(--text-main); cursor:pointer; display:flex; align-items:center; gap:12px; transition:all 0.15s; margin-bottom:8px;">
                                <span style="width:28px; height:28px; border-radius:50%; background:${isSelected ? 'var(--blue-500)' : 'var(--bg-input)'}; color:${isSelected ? 'white' : 'var(--text-main)'}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">${String.fromCharCode(65 + idx)}</span>
                                <span style="flex:1;">${opt}</span>
                            </button>
                        `;
                    }"""

    if old_render_mock_q in html:
        html = html.replace(old_render_mock_q, new_render_mock_q, 1)
        print("  Upgraded renderCurrentMockQuestion for Multi-Select and True/False!")

    # Add toggleMockExamMultiOption function
    if "function toggleMockExamMultiOption" not in html:
        old_select_opt = "function selectMockExamOption(optionIdx) {"
        new_select_opt = """function toggleMockExamMultiOption(optionIdx) {
                if (!currentMockExam || currentMockExam.submitted) return;
                let cur = currentMockExam.userAnswers[currentMockExam.currentIndex];
                if (!Array.isArray(cur)) cur = [];
                const existIdx = cur.indexOf(optionIdx);
                if (existIdx !== -1) {
                    cur.splice(existIdx, 1);
                } else {
                    if (cur.length < 2) cur.push(optionIdx);
                }
                currentMockExam.userAnswers[currentMockExam.currentIndex] = cur;
                renderCurrentMockQuestion();
            }

            function selectMockExamOption(optionIdx) {"""
        html = html.replace(old_select_opt, new_select_opt, 1)
        print("  Added toggleMockExamMultiOption function!")

    # F. Upgrade submitMockExam scoring for multi-select
    old_mock_scoring = """                currentMockExam.questions.forEach((q, idx) => {
                    const userAns = currentMockExam.userAnswers[idx];
                    if (userAns === undefined) {
                        unansweredCount++;
                    } else if (userAns === q.correct) {
                        correctCount++;
                        obtainedMarks += q.marks;
                    } else {
                        wrongCount++;
                    }
                });"""

    new_mock_scoring = """                currentMockExam.questions.forEach((q, idx) => {
                    const userAns = currentMockExam.userAnswers[idx];
                    const isMulti = q.type === 'multiple' || Array.isArray(q.correct);
                    if (userAns === undefined || (isMulti && Array.isArray(userAns) && userAns.length === 0)) {
                        unansweredCount++;
                    } else if (isMulti) {
                        const correctList = Array.isArray(q.correct) ? q.correct : [];
                        const allMatch = correctList.length === userAns.length && correctList.every(val => userAns.indexOf(val) !== -1);
                        if (allMatch) {
                            correctCount++;
                            obtainedMarks += q.marks;
                        } else if (userAns.some(val => correctList.indexOf(val) !== -1)) {
                            obtainedMarks += q.marks / 2;
                        } else {
                            wrongCount++;
                        }
                    } else if (userAns === q.correct) {
                        correctCount++;
                        obtainedMarks += q.marks;
                    } else {
                        wrongCount++;
                    }
                });"""

    if old_mock_scoring in html:
        html = html.replace(old_mock_scoring, new_mock_scoring, 1)
        print("  Upgraded submitMockExam scoring for Multi-Select!")

    with io.open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nSuccessfully wrote {INDEX_PATH}!")
    print("ACCA Foundation Mock Exams installation completed!")

if __name__ == "__main__":
    main()

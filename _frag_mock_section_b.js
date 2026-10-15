/* ------------------------------------------- PRC 1 mock paper, Section B
   The four subject papers are 60 MCQs at 2 marks. PRC 1 additionally carries
   ONE 20-mark extended question in Section B, set in the examination's own
   style: a trial balance, a block of additional information and a Required
   list. It is graded figure by figure, counted into the same total as Section
   A, and recorded with the attempt, so the PRC 1 paper is 140 marks in 150
   minutes.

   It reuses the long-form engine unchanged - the same renderer, the same
   marking rule, the same computed figures. */
const MOCK_SECTION_B = {
    questions: [], index: 0, answers: {}, checked: false,
    subjectId: '', chapterId: '', containerId: 'mock-exams-portal-container'
};

function mockSectionBQuestion(subjectKey) {
    if (subjectKey !== 'prc1') return null;
    if (typeof PRC_LONGFORM_BANK === 'undefined' || !PRC_LONGFORM_BANK.examExtended) return null;
    return PRC_LONGFORM_BANK.examExtended;
}

function mockSectionBMarks(subjectKey) {
    const q = mockSectionBQuestion(subjectKey);
    return q ? (q.marks || 20) : 0;
}

function openMockSectionB() {
    const q = mockSectionBQuestion(currentMockExam.subjectKey);
    if (!q) return;
    MOCK_SECTION_B.questions = [q];
    MOCK_SECTION_B.index = 0;
    MOCK_SECTION_B.answers = {};
    MOCK_SECTION_B.checked = false;
    MOCK_SECTION_B.subjectId = q.subjectId || 'prc1';
    MOCK_SECTION_B.chapterId = q.chapter || 'prc1-ch10';
    MOCK_SECTION_B.backHtml =
        '<button class="btn btn-outline" style="padding:6px 14px; font-size:0.8rem;" onclick="closeMockSectionB()">'
        + '&lt;- Back to Section A</button>';
    MOCK_SECTION_B.navHtml =
        '<button class="btn btn-outline" style="padding:8px 16px;" onclick="closeMockSectionB()">&lt; Back to Section A</button>'
        + '<div style="display:flex; gap:10px; flex-wrap:wrap;">'
        + (MOCK_SECTION_B.checked
            ? ''
            : '<button class="btn btn-primary" style="padding:8px 18px;" onclick="mockSectionBCheck()">Check my figures</button>')
        + '</div>';
    renderLongFormQuestion(MOCK_SECTION_B);
}

function closeMockSectionB() {
    PRC_LONGFORM_ACTIVE = PRC_LONGFORM_STATE;
    renderMockExamPlayer();
}

function mockSectionBCheck() {
    MOCK_SECTION_B.checked = true;
    MOCK_SECTION_B.navHtml =
        '<button class="btn btn-outline" style="padding:8px 16px;" onclick="closeMockSectionB()">&lt; Back to Section A</button>'
        + '<div style="display:flex; gap:10px; flex-wrap:wrap;"></div>';
    renderLongFormQuestion(MOCK_SECTION_B);
}

/* Grade Section B and describe every figure that was wrong, for the attempt's
   history and for the Mistake Book. */
function mockSectionBGrade() {
    const q = mockSectionBQuestion(currentMockExam ? currentMockExam.subjectKey : 'prc1');
    const out = { hasQuestion: !!q, awarded: 0, marks: q ? (q.marks || 20) : 0, wrong: [] };
    if (!q) return out;
    const g = prcGradeQuestion(q, MOCK_SECTION_B.answers);
    out.awarded = g.awarded;
    g.rows.forEach(function (r) {
        if (r.awarded >= r.maxMarks) return;
        const f = q.fields.filter(function (x) { return x.id === r.id; })[0];
        const typed = MOCK_SECTION_B.answers[r.id];
        out.wrong.push({
            qid: r.id,
            subjectId: q.subjectId || 'prc1',
            chapter: q.chapter || 'prc1-ch10',
            qText: q.title + ' — ' + f.label,
            options: f.type === 'select' ? f.options.slice() : [],
            typed: (typed === undefined || typed === '') ? '' : prcFormatFigure(typed),
            chosen: (f.type === 'select' && typed !== undefined && typed !== '')
                ? prcParseNumber(typed) : null,
            correct: f.answer,
            correctText: prcFormatFigure(f.answer),
            working: f.guide || '',
            at: pkDateStr(),
            source: 'Mock exam — Section B'
        });
    });
    return out;
}
/* ================================================ long-form question engine
   PRC 1 Chapter 10 is not tested by recall options in the ICAP papers. It is
   set as a full trial balance, a block of additional information and a
   Required list, and the candidate has to produce the statement of
   comprehensive income and the statement of financial position.

   So the student TYPES the figures they calculate into labelled boxes, and for
   the figures the format leaves missing (the opening provision, the closing
   provision, the depreciation charge) they PICK from four options after
   working the answer out. Marking is automatic and per figure, because a
   number is right or wrong - there is nothing in it to interpret.

   Every figure shown after Check is read back out of PRC_LONGFORM_BANK, which
   the builder computed from the trial balance and refused to write unless each
   statement of financial position balanced. Nothing here invents a figure. */

const PRC_LONGFORM_STATE = {
    questions: [], index: 0, answers: {}, checked: false,
    subjectId: '', chapterId: '', chapterTitle: '', startedAt: ''
};

/* The long-form set for a chapter, or null when the chapter has none. */
function prcLongformFor(subjectId, chapterId) {
    if (typeof PRC_LONGFORM_BANK === 'undefined' || !PRC_LONGFORM_BANK.questions) return null;
    return PRC_LONGFORM_BANK.chapter === chapterId ? PRC_LONGFORM_BANK.questions : null;
}

/* "353,300", "353300", "Rs 353 300" and "353300.0" are one figure. */
function prcParseNumber(raw) {
    if (raw === null || raw === undefined) return NaN;
    const s = String(raw).replace(/,/g, '').replace(/\s+/g, '').replace(/^Rs\.?/i, '');
    if (!s || !/^-?\d*\.?\d+$/.test(s)) return NaN;
    return parseFloat(s);
}

function prcFormatFigure(v) {
    const n = prcParseNumber(v);
    return isNaN(n) ? String(v) : n.toLocaleString();
}

/* A figure is marked on the number, not on how it was typed. Rounding to the
   nearest unit is not held against the candidate; anything else is. */
function prcMarkField(field, raw) {
    const got = prcParseNumber(raw);
    const want = prcParseNumber(field.answer);
    if (isNaN(got) || isNaN(want)) return 0;
    const tol = Math.max(0.5, Math.abs(want) * 0.005);
    return Math.abs(got - want) <= tol ? field.marks : 0;
}

function prcGradeQuestion(q, answers) {
    const a = answers || {};
    let awarded = 0;
    const rows = q.fields.map(function (f) {
        const got = prcMarkField(f, a[f.id]);
        awarded += got;
        return { id: f.id, awarded: got, maxMarks: f.marks, ok: got >= f.marks };
    });
    return {
        awarded: awarded, maxMarks: q.marks,
        percent: q.marks ? Math.round(awarded / q.marks * 100) : 0,
        rows: rows
    };
}

/* Data is plain text with **amount** emphasis; escape it, then mark it up, so
   nothing from the bank can reach innerHTML as markup. */
function prcLongformEmph(text) {
    return mmEsc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function prcLongformTrialBalanceHtml(tb) {
    const cell = 'padding:6px 10px; border-bottom:1px solid var(--border-color); font-size:0.85rem;';
    const head = 'padding:7px 10px; border-bottom:1px solid var(--border-color); font-size:0.72rem;'
        + ' text-transform:uppercase; letter-spacing:0.05em; color:var(--gold-500); font-weight:700;';
    const tot = 'padding:8px 10px; border-top:2px solid var(--border-color); font-weight:800; font-size:0.88rem;';
    let rows = '<div style="display:grid; grid-template-columns:1fr 118px 118px;">'
        + '<div style="' + head + '">Particulars</div>'
        + '<div style="' + head + ' text-align:right;">Debit</div>'
        + '<div style="' + head + ' text-align:right;">Credit</div></div>';
    (tb.rows || []).forEach(function (r) {
        const d = (r.length > 1 && r[1] !== null && r[1] !== undefined) ? prcFormatFigure(r[1]) : '';
        const c = (r.length > 2 && r[2] !== null && r[2] !== undefined) ? prcFormatFigure(r[2]) : '';
        rows += '<div style="display:grid; grid-template-columns:1fr 118px 118px;">'
            + '<div style="' + cell + '">' + mmEsc(r[0]) + '</div>'
            + '<div style="' + cell + ' text-align:right;">' + d + '</div>'
            + '<div style="' + cell + ' text-align:right;">' + c + '</div></div>';
    });
    rows += '<div style="display:grid; grid-template-columns:1fr 118px 118px;">'
        + '<div style="' + tot + '">Total</div>'
        + '<div style="' + tot + ' text-align:right;">' + prcFormatFigure(tb.totals[0]) + '</div>'
        + '<div style="' + tot + ' text-align:right;">' + prcFormatFigure(tb.totals[1]) + '</div></div>';
    return '<div style="margin:14px 0;">'
        + '<div style="font-size:0.82rem; color:var(--text-subtle); margin-bottom:4px;">'
        + mmEsc(tb.caption || 'Trial Balance') + ' &nbsp;|&nbsp; ' + mmEsc(tb.unit || '') + '</div>'
        + '<div style="border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">'
        + rows + '</div></div>';
}

function startLongFormPractice(subjectId, chapterId, chapterTitle) {
    const list = prcLongformFor(subjectId, chapterId);
    if (!list || !list.length) return;
    PRC_LONGFORM_STATE.questions = list;
    PRC_LONGFORM_STATE.index = 0;
    PRC_LONGFORM_STATE.answers = {};
    PRC_LONGFORM_STATE.checked = false;
    PRC_LONGFORM_STATE.subjectId = subjectId;
    PRC_LONGFORM_STATE.chapterId = chapterId;
    PRC_LONGFORM_STATE.chapterTitle = chapterTitle || '';
    PRC_LONGFORM_STATE.startedAt = new Date().toISOString();
    renderLongFormQuestion();
}

function prcLongformSetAnswer(fieldId, value) {
    PRC_LONGFORM_STATE.answers[fieldId] = value;
}

function prcLongformCheck() {
    PRC_LONGFORM_STATE.checked = true;
    renderLongFormQuestion();
}

function prcLongformGo(index) {
    const S = PRC_LONGFORM_STATE;
    if (index < 0 || index >= S.questions.length) return;
    S.index = index;
    S.checked = false;
    renderLongFormQuestion();
}

function renderLongFormQuestion() {
    const container = document.getElementById('practice-main-container');
    if (!container) return;
    const S = PRC_LONGFORM_STATE;
    const q = S.questions[S.index];
    if (!q) return;
    const activeSubject = mmSubjectsList.find(s => s.id === S.subjectId);
    const graded = S.checked ? prcGradeQuestion(q, S.answers) : null;
    const rowById = {};
    if (graded) graded.rows.forEach(function (r) { rowById[r.id] = r; });

    const fieldsHtml = q.fields.map(function (f) {
        const raw = S.answers[f.id] === undefined ? '' : S.answers[f.id];
        const row = rowById[f.id];
        const inputStyle = 'width:100%; padding:9px 11px; border-radius:8px; border:1px solid '
            + (row ? (row.ok ? '#10b981' : '#ef4444') : 'var(--border-color)')
            + '; background:var(--bg-input); color:var(--text-main); font-size:0.95rem;'
            + ' font-variant-numeric:tabular-nums; box-sizing:border-box;';
        const input = f.type === 'select'
            ? '<select ' + (S.checked ? 'disabled ' : '')
            + 'onchange="prcLongformSetAnswer(\'' + f.id + '\', this.value)" style="' + inputStyle + '">'
            + '<option value="">Select the figure</option>'
            + f.options.map(function (o) {
                return '<option value="' + mmEsc(o) + '"'
                    + (String(raw) === String(o) ? ' selected' : '') + '>' + mmEsc(o) + '</option>';
            }).join('') + '</select>'
            : '<input type="text" inputmode="numeric" placeholder="Type the figure" value="' + mmEsc(raw) + '" '
            + (S.checked ? 'disabled ' : '')
            + 'oninput="prcLongformSetAnswer(\'' + f.id + '\', this.value)" style="' + inputStyle + '" />';

        const badge = row
            ? (row.ok
                ? '<span style="font-size:0.75rem; font-weight:700; color:#4ade80;">&#10003; '
                + row.awarded + '/' + row.maxMarks + '</span>'
                : '<span style="font-size:0.75rem; font-weight:700; color:#f87171;">&#10007; 0/'
                + row.maxMarks + '</span>')
            : '<span style="font-size:0.75rem; color:var(--text-muted);">' + f.marks
            + ' mark' + (f.marks === 1 ? '' : 's') + '</span>';

        const hint = row && !row.ok && f.guide
            ? '<div style="margin-top:6px; font-size:0.8rem; color:var(--text-muted);">'
            + mmEsc(f.guide) + '</div>'
            : '';
        const kind = f.type === 'select'
            ? '<span style="font-size:0.68rem; color:var(--blue-400); font-weight:700; '
            + 'letter-spacing:0.04em;">PICK</span>'
            : '';
        return '<div style="padding:12px 0; border-bottom:1px solid var(--border-color);">'
            + '<div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline; margin-bottom:6px;">'
            + '<label style="font-size:0.9rem; color:var(--text-main); font-weight:600;">' + kind
            + (kind ? ' &nbsp;' : '') + mmEsc(f.label) + '</label>' + badge + '</div>'
            + input + hint + '</div>';
    }).join('');

    const workingHtml = graded
        ? '<div class="explanation-box" style="margin-top:18px;">'
        + '<div style="font-weight:700; color:#60a5fa; margin-bottom:8px;">Step-by-Step Working</div>'
        + '<div style="font-size:0.88rem; color:var(--text-main); line-height:1.7;">'
        + q.working.split('\n').map(function (line) {
            return '<div style="margin-bottom:6px;">' + prcLongformEmph(line) + '</div>';
        }).join('') + '</div></div>'
        : '';

    container.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <button class="btn btn-outline" style="padding:6px 14px; font-size:0.8rem;" onclick="renderPracticeChapterGrid('${S.subjectId}')">
                    &lt;- Back to Chapters
                </button>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span class="badge badge-blue">${activeSubject ? activeSubject.code : S.subjectId} &bull; Chapter 10</span>
                    <span class="badge badge-gold">Question ${S.index + 1} of ${S.questions.length}</span>
                    <span class="badge badge-gold">${q.marks} Marks</span>
                    ${graded ? '<span class="badge ' + (graded.percent >= 50 ? 'badge-green' : 'badge-red') + '">'
                        + graded.awarded + ' / ' + graded.maxMarks + '</span>' : ''}
                </div>
            </div>

            <h3 style="margin:0 0 4px; font-size:1.12rem; color:var(--text-main);">${mmEsc(q.title)}</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin:0 0 6px;">${mmEsc(q.stem)}</p>
            ${prcLongformTrialBalanceHtml(q.trialBalance)}

            <div style="margin:16px 0;">
                <div style="font-weight:700; font-size:0.9rem; color:var(--text-main); margin-bottom:6px;">Additional information:</div>
                <div style="font-size:0.88rem; color:var(--text-muted); line-height:1.7;">
                    ${q.additional.map(function (a) { return '<div style="margin-bottom:4px;">' + prcLongformEmph(a) + '</div>'; }).join('')}
                </div>
            </div>

            <div style="margin:16px 0;">
                <div style="font-weight:700; font-size:0.9rem; color:var(--text-main); margin-bottom:6px;">Required:</div>
                <div style="font-size:0.88rem; color:var(--text-muted); line-height:1.7;">
                    ${q.required.map(function (r) { return '<div>' + prcLongformEmph(r) + '</div>'; }).join('')}
                </div>
            </div>

            <div style="margin-top:18px; border-top:2px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; padding-top:10px;">
                    <div style="font-weight:700; font-size:0.95rem; color:var(--text-main);">Your figures</div>
                    <div style="font-size:0.78rem; color:var(--text-muted);">Type every figure you calculated. Figures marked PICK are the ones the format leaves missing.</div>
                </div>
                ${fieldsHtml}
            </div>

            ${workingHtml}

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; flex-wrap:wrap; gap:10px;">
                <button class="btn btn-outline" style="padding:8px 16px;" ${S.index === 0 ? 'disabled' : ''} onclick="prcLongformGo(${S.index - 1})">
                    &lt; Previous
                </button>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${!S.checked ? '<button class="btn btn-primary" style="padding:8px 18px;" onclick="prcLongformCheck()">Check my figures</button>' : ''}
                    ${S.index < S.questions.length - 1
                        ? '<button class="btn btn-primary" style="padding:8px 18px;" onclick="prcLongformGo(' + (S.index + 1) + ')">Next question &rarr;</button>'
                        : '<button class="btn btn-primary" style="padding:8px 18px;" onclick="finishLongFormPractice()">Finish &amp; see result</button>'}
                </div>
            </div>
            <p style="margin:16px 0 0; font-size:0.78rem; color:var(--text-muted);">
                ${mmEsc(q.source || '')}
            </p>
        </div>
    `;
}

/* One record for the whole set, in the same shape as every other session the
   app stores, so the Dashboard, Evaluation, Progress log and Mistake Book all
   pick this work up without knowing that long-form questions exist. */
function finishLongFormPractice() {
    const S = PRC_LONGFORM_STATE;
    if (!S.questions.length) return;
    const container = document.getElementById('practice-main-container');
    if (!container) return;

    const activeSubject = mmSubjectsList.find(s => s.id === S.subjectId);
    const questionRows = [], results = [], wrong = [];
    let awarded = 0, marks = 0;

    S.questions.forEach(function (q) {
        const g = prcGradeQuestion(q, S.answers);
        awarded += g.awarded;
        marks += g.maxMarks;
        questionRows.push({
            id: q.id, subjectId: q.subjectId || S.subjectId,
            chapter: q.chapter || S.chapterId, marks: q.marks, status: 'answered'
        });
        g.rows.forEach(function (r) {
            const f = q.fields.filter(function (x) { return x.id === r.id; })[0];
            results.push({
                questionId: r.id, awarded: r.awarded, maxMarks: r.marks || 1,
                percent: (r.marks || 1) ? Math.round(r.awarded / r.marks * 100) : 0
            });
            if (r.awarded < r.marks) {
                const typed = S.answers[r.id];
                wrong.push({
                    qid: r.id,
                    subjectId: q.subjectId || S.subjectId,
                    chapter: q.chapter || S.chapterId,
                    qText: q.title + ' — ' + f.label,
                    options: f.type === 'select' ? f.options.slice() : [],
                    typed: (typed === undefined || typed === '') ? '' : prcFormatFigure(typed),
                    chosen: (f.type === 'select' && typed !== undefined && typed !== '')
                        ? prcParseNumber(typed) : null,
                    correct: f.answer,
                    correctText: prcFormatFigure(f.answer),
                    working: f.guide || '',
                    at: new Date().toISOString(),
                    source: 'Long-form question'
                });
            }
        });
    });

    try {
        practiceCentrePersistSession({
            version: 'longform-1',
            sessionId: 'lf-' + S.subjectId + '-' + Date.now().toString(36),
            subjectId: S.subjectId,
            label: (activeSubject ? activeSubject.code : S.subjectId)
                + ' - Chapter 10 long-form questions',
            mode: 'LONGFORM_QUIZ',
            startedAt: S.startedAt,
            finishedAt: new Date().toISOString(),
            questions: questionRows,
            results: results,
            wrong: wrong,
            totals: { questions: S.questions.length, awarded: awarded, marks: marks }
        });
        if (typeof renderRealStats === 'function') renderRealStats();
    } catch (err) { /* never let recording block the result screen */ }

    const pct = marks ? Math.round(awarded / marks * 100) : 0;
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px 20px;">
            <span class="badge badge-gold">${activeSubject ? activeSubject.code : S.subjectId} &bull; Chapter 10 Long-Form Set</span>
            <h2 style="margin:10px 0 6px; font-size:1.6rem; color:var(--text-main);">Set Complete</h2>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:20px;">
                ${S.questions.length} questions &bull; ${marks} marks
            </p>
            <div style="display:inline-flex; align-items:center; gap:20px; background:var(--bg-input); border:1px solid var(--border-color); padding:16px 32px; border-radius:14px; margin-bottom:24px;">
                <div>
                    <div style="font-size:2rem; font-weight:800; color:${pct >= 50 ? '#4ade80' : '#f87171'};">${pct}%</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Overall Score</div>
                </div>
                <div style="width:1px; height:40px; background:var(--border-color);"></div>
                <div>
                    <div style="font-size:1.5rem; font-weight:700; color:var(--text-main);">${awarded} / ${marks}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Marks Earned</div>
                </div>
            </div>
            ${wrong.length ? `<p style="color:var(--rose-500); font-size:0.9rem; margin:0 0 8px;">${wrong.length} figure${wrong.length === 1 ? '' : 's'} to revisit in your Mistake Book.</p>` : ''}
            <p style="color:var(--text-muted); font-size:0.8rem; margin:0 0 20px;">
                Saved to your Dashboard, Progress and Evaluation.
            </p>
            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="startLongFormPractice('${S.subjectId}', '${S.chapterId}')">Retake the set</button>
                <button class="btn btn-outline" onclick="renderPracticeChapterGrid('${S.subjectId}')">Back to Chapters</button>
            </div>
        </div>
    `;
}
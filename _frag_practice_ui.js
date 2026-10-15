/* ============================ CAF Practice Centre UI ============================
 * The face of the practice engine (see _frag_practice_engine.js).
 *
 * Scope decision: this does NOT replace the existing chapter-wise MCQ practice
 * centre. It ships as a self-contained overlay with its own launcher, because
 * the MCQ quiz re-renders `#practice-main-container` wholesale and anything
 * injected in there would be destroyed on the next subject switch. The launcher
 * lives in its own container inside #view-practice and the session itself lives
 * in an overlay on <body>, so neither can be clobbered.
 *
 * The one thing that matters most here is that an expected answer never reaches
 * the DOM during an attempt. `practiceQuestionView` is the only question source
 * used while a session is live, and it carries no answer material at all.
 * ============================================================================= */

const PRACTICE_CENTRE_LAUNCHER_ID = 'practice-centre-launcher';
const PRACTICE_CENTRE_OVERLAY_ID = 'practice-centre-overlay';

/* Subject labels are DERIVED from `mmSubjectsList`, the app's own subject table.
 *
 * This used to be a second hand-written list of the same eight subjects, and there
 * were three names in play rather than one: the app's table, this list, and whatever
 * name each supplied past paper prints on its own cover. Three lists is two more
 * than there should be, and they had already drifted - this one said "Taxation"
 * where both the app's table and the papers say "Taxation Principles & Compliance",
 * and "Business & Company Law" where the app's table says "Business Law Dynamics".
 * Any future correction to a subject name would have had to be made in the right one
 * of three places, and there was nothing that could tell you which.
 *
 * Deriving the label from mmSubjectsList removes the duplicate: the Practice Centre
 * can only display the name the rest of the app displays.
 *
 * `corpusName` is what the supplied PAST PAPERS call the same subject, read off their
 * covers and carried in PRACTICE_BANK.subjectNames. Where it differs from the app's
 * name the difference is kept, not resolved here. CAF-6 is the live case: both
 * supplied CAF-6 papers print "Corporate Reporting" on their cover, while the app's
 * subject table - built from the study text CAF-6-ST.pdf - says "Managerial &
 * Financial Analysis". Those are different subjects, not two spellings of one, so
 * `practiceCentreNameConflicts` records the pair and the app decides what to show.
 */
/* Return the CAF subjects, in the app's own order, from `mmSubjectsList`.
 *
 * The list of ids is derived too, and it has to be. This used to enumerate
 * 'caf1' ... 'caf8' literally, which looks correct and is not: the app carries a
 * NINTH CAF row, `caf4v2` - "CAF 4 - VOL 2, Business Law Dynamics - Vol II" - and
 * the generated bank holds 46 Vol II questions under that id. Selecting by the
 * literal list left all 46 unreachable, while the screen cheerfully counted 56
 * questions for CAF-4 (46 Vol I plus 10 official) as though nothing were missing.
 * A count that silently omits a fifth of the bank is worse than no count.
 *
 * The volume is not repeated in the label. `mmSubjectsList` already says "Vol I" or
 * "Vol II" in the name and "VOL 1"/"VOL 2" in the code; printing "CAF-4v2" as well
 * would say the same thing a third way. Only the subject number is added, taken from
 * the digits of the id, so both volumes read CAF-4 and are told apart by their names.
 */
function practiceCentreCafSubjects() {
    const rows = (typeof mmSubjectsList !== 'undefined' && mmSubjectsList
        && mmSubjectsList) ? mmSubjectsList : [];
    return rows.filter(function (s) {
        return s && typeof s.id === 'string' && /^caf\d/i.test(s.id);
    });
}

/* Every subject id here is also the id the question bank uses, so nothing needs
 * translating today. `bankIds` exists so that IF the study texts and the bank
 * ever disagree about a subject again, one row can carry both spellings and
 * every lookup resolves either - rather than the row quietly matching nothing.
 *
 * That was checked rather than assumed: an earlier reading of the subject list
 * suggested the dropdown called Business Law Vol 1 `caf4v1` while the bank
 * called it `caf4`, which would have made all 46 of its questions unreachable.
 * The page uses `caf4` for both, so the alias table was removed rather than left
 * in place covering an id that does not exist. */
const PRACTICE_CENTRE_SUBJECT_ALIASES = {};

const PRACTICE_CENTRE_SUBJECTS = (function () {
    const byId = {};
    (typeof mmSubjectsList !== 'undefined' && mmSubjectsList ? mmSubjectsList : [])
        .forEach(function (s) { if (s && s.id) byId[s.id] = s; });
    const corpusNames = (typeof PRACTICE_BANK !== 'undefined' && PRACTICE_BANK
        && PRACTICE_BANK.subjectNames) ? PRACTICE_BANK.subjectNames : {};
    return practiceCentreCafSubjects().map(function (s) {
        const id = s.id;
        const num = (id.match(/^caf(\d+)/i) || ['', ''])[1];
        const name = s.name || id;
        const bankIds = [id];
        const alias = PRACTICE_CENTRE_SUBJECT_ALIASES[id];
        if (alias) bankIds.push(alias);
        return {
            id: id,
            bankIds: bankIds,
            label: (num ? 'CAF-' + num + ' ' : '') + name,
            shortName: s.shortName || '',
            appName: name,
            color: s.color || '',
            corpusName: (corpusNames[id] && corpusNames[id].name) || null
        };
    });
})();

/* Resolve a subject row from EITHER the app's id or the bank's. Business Law
 * Vol 1 is the only subject the two name differently, and a lookup that
 * understood only one of them either returned nothing or printed the raw id
 * next to a chapter title. */
function practiceCentreSubjectFor(id) {
    if (!id) return null;
    for (var i = 0; i < PRACTICE_CENTRE_SUBJECTS.length; i++) {
        if (PRACTICE_CENTRE_SUBJECTS[i].id === id) return PRACTICE_CENTRE_SUBJECTS[i];
    }
    for (var j = 0; j < PRACTICE_CENTRE_SUBJECTS.length; j++) {
        if (PRACTICE_CENTRE_SUBJECTS[j].bankIds.indexOf(id) !== -1) {
            return PRACTICE_CENTRE_SUBJECTS[j];
        }
    }
    return null;
}

/* Chapters of one subject, from the study text, in printed order.
 *
 * `id` is taken from the chapter when present and otherwise derived from its
 * first topic's id, because the chapter list and the question bank have to agree
 * on what a chapter is called or every count comes back zero. */
function practiceCentreChapters(subjectId) {
    const store = (typeof mmDataStore !== 'undefined' && mmDataStore) ? mmDataStore : {};
    const rows = store[subjectId] || [];
    const out = [];
    rows.forEach(function (c, i) {
        const topics = c.topics || [];
        const first = topics[0] || {};
        const id = c.id || String(first.id || '').replace(/-t\d+$/, '');
        if (!id) return;
        out.push({
            id: id,
            number: (c.chapterNumber === undefined ? i + 1 : c.chapterNumber),
            title: c.title || ''
        });
    });
    out.sort(function (a, b) { return a.number - b.number; });
    return out;
}

/* --------------------------------------------------------- chapter focus sets
 *
 * ICAP does not examine the eight CAF subjects the same way, and a candidate
 * revising for one of them wants the kind of question that subject actually
 * sets. These are the three slices, offered in the Question source selector
 * beside "All generated practice".
 *
 * RECALL is excluded from all three, deliberately. The bank also holds recall
 * prompts, and a source called "Numerical focus" that answered "Define primary
 * data" five times would be worse than no source at all. Those questions stay
 * reachable through "All generated practice".
 *
 * `verify_caf_focus.py` reads this table back out of the page and asserts it
 * against `_build/pipeline/caf_focus_bank.SUBJECT_FOCUS` - the table that
 * GENERATES these questions - so a focus set can never name a subject/type pair
 * that does not exist, or miss one that does. */
const PRACTICE_CENTRE_FOCUS = [
    {
        id: 'FOCUS_NUMERICAL',
        short: 'numerical',
        label: 'Chapter-wise numerical - CAF-1, CAF-2, CAF-5, CAF-6',
        subjects: ['caf1', 'caf2', 'caf5', 'caf6'],
        types: ['NUMERICAL'],
        note: 'Every question carries figures, a working and an answer computed '
            + 'from those same figures. Where the chapter has a registered '
            + 'computation the stem, the workings and the answer are rendered '
            + 'from one figure set and cannot disagree.'
    },
    {
        id: 'FOCUS_SCENARIO',
        short: 'scenario',
        label: 'Chapter-wise scenario - CAF-3, CAF-4, CAF-8',
        /* `caf4` is Business Law Vol I and `caf4v2` Vol II. They are two rows
         * here because the study text is split, and both are Business Law, so
         * scenario focus covers both volumes - 43 questions instead of the 53 a
         * single `caf4` row would suggest, and all 10 of Vol I's included. */
        subjects: ['caf3', 'caf4', 'caf4v2', 'caf8'],
        types: ['SCENARIO'],
        note: 'Every question puts you inside a named company - invented for '
            + 'practice, and never presented as an ICAP question - with three '
            + 'parts and a model answer. These subjects are examined on '
            + 'application and reasoning, not on arithmetic.'
    },
    {
        id: 'FOCUS_MIXED',
        short: 'numerical and scenario',
        label: 'Chapter-wise numerical and scenario - CAF-2, CAF-7',
        subjects: ['caf2', 'caf7'],
        types: ['NUMERICAL', 'SCENARIO'],
        note: 'Both written types together, in the two subjects ICAP examines '
            + 'with a genuine mix. A session here alternates between a '
            + 'computation and a case rather than being all of one.'
    }
];

function practiceCentreFocusById(id) {
    if (!id) return null;
    for (var i = 0; i < PRACTICE_CENTRE_FOCUS.length; i++) {
        if (PRACTICE_CENTRE_FOCUS[i].id === id) return PRACTICE_CENTRE_FOCUS[i];
    }
    return null;
}

/* The generated questions a focus set actually draws on. Page ids are expanded
 * through `bankIds` first, so naming `caf4v1` reaches the bank's `caf4` rows
 * rather than matching nothing. */
function practiceCentreFocusPool(focus) {
    const bank = practiceIndexBank();
    if (!bank || !focus) return [];
    const want = {};
    focus.subjects.forEach(function (s) {
        const row = practiceCentreSubjectFor(s);
        (row ? row.bankIds : [s]).forEach(function (b) { want[b] = true; });
    });
    return (bank.generated || []).filter(function (q) {
        return !!want[q.subjectId] && focus.types.indexOf(q.type) !== -1;
    });
}

/* Where a subject's app name and its papers' own name differ. Surfaced, not
 * resolved: see the note above.
 *
 * Punctuation and the ampersand are not differences. The app writes "&" and the
 * papers write "and", so "Financial Accounting & Reporting" against "Financial
 * Accounting and Reporting" is the same name and reporting it as a conflict would
 * bury the one that matters. "&" is folded to "and" before comparing.
 *
 * What survives that fold is worth knowing about, and the differing words are named
 * rather than left for the reader to diff:
 *
 *   caf4  Business Law Dynamics - Vol I   vs  Business Law Dynamics
 *         the app splits a two-volume subject into one row per volume, and the
 *         papers are named for the subject. Expected.
 *   caf6  Managerial & Financial Analysis vs  Corporate Reporting
 *         DIFFERENT SUBJECTS. The app's name comes from CAF-6-ST.pdf; both supplied
 *         CAF-6 papers print "Corporate Reporting" on their cover.
 *   caf7  Business Information Analysis  vs  Business Insights and Analysis
 *         the app's name appears to be a transposition; "Insights" is ICAP's usage.
 *   caf8  Audit & Assurance               vs  Audit and Assurance Essentials
 *         the app's name is a short form of the papers'.
 */
function practiceCentreNameKey(text) {
    return String(text == null ? '' : text)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '');
}

const practiceCentreNameConflicts = PRACTICE_CENTRE_SUBJECTS
    .filter(function (s) {
        if (!s.corpusName) return false;
        return practiceCentreNameKey(s.corpusName) !== practiceCentreNameKey(s.appName);
    })
    .map(function (s) {
        function words(t) {
            return String(t).toLowerCase().replace(/&/g, ' and ')
                .split(/[^a-z0-9]+/).filter(Boolean);
        }
        var app = words(s.appName), cor = words(s.corpusName);
        var onlyApp = app.filter(function (w) { return cor.indexOf(w) < 0; });
        var onlyCor = cor.filter(function (w) { return app.indexOf(w) < 0; });
        return {
            id: s.id,
            appName: s.appName,
            corpusName: s.corpusName,
            onlyInAppName: onlyApp,
            onlyInPapersName: onlyCor
        };
    });

const PRACTICE_CENTRE_DIFFICULTIES = [
    { id: '', label: 'Any difficulty' },
    { id: 'FOUNDATION', label: 'Foundation' },
    { id: 'APPLICATION', label: 'Application' },
    { id: 'ADVANCED', label: 'Advanced' },
    { id: 'EXAM_LEVEL', label: 'Exam level' }
];

let PRACTICE_CENTRE = {
    session: null,
    questions: [],
    index: 0,
    answers: {},
    lastResult: null,
    overlayOpen: false
};

function practiceCentreEscape(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ launcher */

function initPracticeCentre() {
    if (document.getElementById(PRACTICE_CENTRE_LAUNCHER_ID)) return;
    const host = document.getElementById('practice-main-container');
    if (!host) return;
    const box = document.createElement('div');
    box.id = PRACTICE_CENTRE_LAUNCHER_ID;
    box.className = 'pc-launcher';
    box.innerHTML =
        '<div class="pc-launcher-inner">' +
        '  <div>' +
        '    <div class="pc-launcher-title">Written Practice Centre</div>' +
        '    <div class="pc-launcher-sub">Handwritten or typed answers, marked ' +
        '      criterion by criterion against the CAF study text. ' +
        '      Practice questions are generated, not official ICAP questions.</div>' +
        '  </div>' +
        '  <button type="button" class="pc-btn pc-btn-primary" id="pc-open-btn">' +
        '    Open Practice Centre</button>' +
        '</div>';
    host.parentNode.insertBefore(box, host);
    box.querySelector('#pc-open-btn').addEventListener('click', function () {
        practiceCentreOpen();
    });
}

/* ------------------------------------------------------------------- overlay */

function practiceCentreOverlay() {
    let ov = document.getElementById(PRACTICE_CENTRE_OVERLAY_ID);
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = PRACTICE_CENTRE_OVERLAY_ID;
    ov.className = 'pc-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.addEventListener('click', function (e) {
        if (e.target === ov) practiceCentreClose();
    });
    document.body.appendChild(ov);
    return ov;
}

function practiceCentreClose() {
    const ov = document.getElementById(PRACTICE_CENTRE_OVERLAY_ID);
    if (ov) ov.classList.remove('pc-open');
    PRACTICE_CENTRE.overlayOpen = false;
}

function practiceCentreOpen() {
    practiceCentreOverlay().classList.add('pc-open');
    PRACTICE_CENTRE.overlayOpen = true;
    practiceCentreRenderSetup();
}

function practiceCentrePanel(html) {
    const ov = practiceCentreOverlay();
    let panel = ov.querySelector('.pc-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'pc-panel';
        ov.appendChild(panel);
    }
    panel.innerHTML =
        '<button type="button" class="pc-close" id="pc-close" aria-label="Close">&#10005;</button>'
        + html;
    panel.querySelector('#pc-close').addEventListener('click', practiceCentreClose);
    return panel;
}

function practiceCentreHeader(subtitle) {
    const provider = getOCRProvider();
    return '<div class="pc-head">' +
        '<div class="pc-head-title">CAF Written Practice Centre</div>' +
        '<div class="pc-head-sub">' + practiceCentreEscape(subtitle || '') + '</div>' +
        '<div class="pc-head-ocr">Answer input: <strong>' +
        practiceCentreEscape(provider.describe()) + '</strong></div>' +
        '</div>';
}

/* --------------------------------------------------------------- setup screen */

function practiceCentreRenderSetup() {
    const bank = practiceIndexBank();
    if (!bank) {
        practiceCentrePanel(practiceCentreHeader('Bank unavailable') +
            '<p class="pc-note">The practice bank did not load.</p>');
        return;
    }
    const available = {};
    /* Per-subject counts for the Subject dropdown and for the note under it.
     *
     * These must be read for the SELECTED source, not for the bank as a whole.
     * "CAF-1 (64)" beside a source called "Numerical focus" would promise 64
     * numerical questions out of the 13 that exist - so the count comes from the
     * same pool the session will be drawn from. Alias-aware, so CAF-4 Vol 1
     * counts the bank's `caf4` rows instead of showing "- none yet". */
    /* One pool, one count. This used to branch on the focus source and fall back
     * to `bank.bySubject`, which is a THIRD way of counting the same questions -
     * three is one too many. `practiceSelectPool` is what the draw uses, so
     * asking it is the only way the numbers can be right. */
    function countsForSource(kind) {
        const bySubj = {};
        practiceSelectPool({ kind: kind }).forEach(function (q) {
            bySubj[q.subjectId] = (bySubj[q.subjectId] || 0) + 1;
        });
        return bySubj;
    }

    const allCounts = countsForSource('GENERATED_PRACTICE');
    Object.keys(allCounts).forEach(function (s) { available[s] = allCounts[s]; });

    /* Official questions are counted per subject from the official pool directly,
     * not from `bank.bySubject`. That index is built over the generated questions
     * only, so reusing it would have shown the generated count beside an
     * "Official past-paper questions" label - the same number twice, for two
     * different sets of questions. */
    const officialBySubject = {};
    (bank.official || []).forEach(function (q) {
        officialBySubject[q.subjectId] = (officialBySubject[q.subjectId] || 0) + 1;
    });

    /* The Subject rows for a source, as data.
     *
     * ALL subjects stay listed under every source. A focus set used to hide the
     * subjects it did not cover, which read as the app having lost five of the
     * nine volumes - and switching source silently moved the candidate to a
     * different subject. A subject with no questions under the current source is
     * shown disabled and marked "- none", so the full set is always visible and
     * the emptiness is stated rather than concealed.
     *
     * Counts come from the same pool the session is drawn from (practiceSelectPool),
     * so the number beside a subject and the questions that arrive cannot disagree.
     * Alias-aware, so CAF-4 Vol 1 counts the bank's `caf4` rows. */
    function subjectRowsFor(kind) {
        const counts = {};
        practiceSelectPool({ kind: kind }).forEach(function (q) {
            counts[q.subjectId] = (counts[q.subjectId] || 0) + 1;
        });
        return PRACTICE_CENTRE_SUBJECTS.map(function (s) {
            let n = 0;
            s.bankIds.forEach(function (b) { n += counts[b] || 0; });
            return { value: s.id, label: s.label, n: n };
        });
    }

    function subjectOptionsFor(kind) {
        return subjectRowsFor(kind).map(function (r) {
            return '<option value="' + r.value + '"' + (r.n ? '' : ' disabled') + '>' +
                practiceCentreEscape(r.label) + (r.n ? ' (' + r.n + ')' : ' - none') + '</option>';
        }).join('');
    }

    /* Chapters for the chosen subject, from the study text, with counts from the
     * current pool. Derived from `topicId` (`<subject>-ch<N>-t<M>`) rather than a
     * stored chapterId, because the runtime bank row does not carry one.
     *
     * Returns [] when no subject is chosen: a chapter list across all nine
     * volumes would be 128 rows and would read as a subject list in disguise. */
    function chapterRowsFor(kind, subjectId) {
        if (!subjectId) return [];
        const counts = {};
        practiceSelectPool({ kind: kind, subjectId: subjectId })
            .forEach(function (q) {
                const c = practiceChapterId(q);
                if (c) counts[c] = (counts[c] || 0) + 1;
            });
        return practiceCentreChapters(subjectId).map(function (c) {
            return {
                value: c.id,
                label: 'Chapter ' + c.number + ' - ' + c.title,
                n: counts[c.id] || 0
            };
        });
    }

    function chapterOptionsFor(kind, subjectId) {
        const rows = chapterRowsFor(kind, subjectId);
        if (!subjectId) {
            return '<option value="">Choose a subject first</option>';
        }
        const total = rows.reduce(function (t, r) { return t + r.n; }, 0);
        return '<option value="">All chapters</option>' + rows.map(function (r) {
            return '<option value="' + r.value + '"' + (r.n ? '' : ' disabled') + '>' +
                practiceCentreEscape(r.label) + (r.n ? ' (' + r.n + ')' : ' - none') + '</option>';
        }).join('') + (total ? '' : '');
    }

    const subjectOptions = subjectOptionsFor('GENERATED_PACTICE');
    const chapterOptions = chapterOptionsFor('GENERATED_PACTICE', '');

    const diffOptions = PRACTICE_CENTRE_DIFFICULTIES.map(function (d) {
        return '<option value="' + d.id + '">' + practiceCentreEscape(d.label) + '</option>';
    }).join('');

    // A source selector, because the three kinds are marked by different engines
    // and a candidate should not have to call `practiceSelectQuestions` from the
    // console to reach the official past-paper questions. The note below used to
    // say those questions "can be marked in past-paper mode from the API" - which
    // described a capability while giving no route to it, for 61 questions that
    // are the only ones in the bank with an examiner's own mark scheme attached.
    //
    // OFFICIAL is listed with its count and is disabled when the selected subject has
    // none. Of the 35 supplied papers only 7 could be paired with an answer key
    // exactly and 2 with a numbering mismatch, so most subjects have few or none -
    // showing it as available everywhere would be a promise the bank cannot keep.
    //
    // GENERATED_PAPER is a whole 100-mark paper in paper order, with the paper's
    // own rubric, so difficulty and question count do not apply to it - the paper
    // decides both - and the controls say so by being disabled rather than by
    // being ignored.
    const paperList = bank.paperList || [];

    /* The three focus sets are CHAPTER-WISE slices of generated practice, so
     * they are nested inside an <optgroup> headed by it rather than listed as
     * siblings. As siblings they read as four unrelated sources, and choosing
     * "numerical focus" looked like leaving generated practice altogether.
     *
     * Each option carries its own live count, taken from the same pool the
     * session is drawn from, so a disabled option can never be a promise the
     * bank cannot keep. */
    function kindOptionRow(k) {
        return '<option value="' + k.id + '"' + (k.n ? '' : ' disabled') + '>' +
            practiceCentreEscape(k.label) + (k.n ? ' (' + k.n + ')' : ' - none') + '</option>';
    }

    const focusKindOptions = PRACTICE_CENTRE_FOCUS.map(function (f) {
        return kindOptionRow({
            id: f.id, label: f.label, n: practiceCentreFocusPool(f).length
        });
    }).join('');

    const kindOptions =
        '<optgroup label="Generated practice (from the CAF study text)">'
        + kindOptionRow({
            id: 'GENERATED_PRACTICE',
            label: 'All chapters - numerical, scenario and recall',
            n: bank.generated.length
        })
        + focusKindOptions
        + '</optgroup>'
        + kindOptionRow({
            id: 'OFFICIAL_PAST_PAPER',
            label: 'Official past-paper questions (marked against ICAP suggested answers)',
            n: bank.official.length
        })
        + kindOptionRow({
            id: 'GENERATED_PAPER',
            label: 'Full generated paper (100-mark paper in paper order)',
            n: paperList.length
        });

    practiceCentrePanel(practiceCentreHeader(
        bank.generated.length + ' generated practice questions, '
        + bank.official.length + ' official past-paper questions and '
        + paperList.length + ' full generated papers, across '
        + Object.keys(available).length + ' CAF subjects') +
        '<div class="pc-setup">' +
        '  <label class="pc-field pc-field-wide"><span>Question source</span>' +
        '    <select id="pc-kind">' + kindOptions + '</select></label>' +
        '  <label class="pc-field"><span>Subject</span>' +
        '    <select id="pc-subject">' + subjectOptions + '</select></label>' +
        '  <label class="pc-field"><span>Chapter</span>' +
        '    <select id="pc-chapter">' + chapterOptions + '</select></label>' +
        '  <label class="pc-field"><span>Paper</span>' +
        '    <select id="pc-paper" disabled><option value="">Choose a source first</option></select></label>' +
        '  <label class="pc-field"><span>Difficulty</span>' +
        '    <select id="pc-difficulty">' + diffOptions + '</select></label>' +
        '  <label class="pc-field"><span>Questions</span>' +
        '    <select id="pc-count">' +
        '      <option value="3">3</option><option value="5" selected>5</option>' +
        '      <option value="10">10</option><option value="15">15</option>' +
        '    </select></label>' +
        '  <button type="button" class="pc-btn pc-btn-primary" id="pc-start">Start session</button>' +
        '</div>' +
        '<div class="pc-note" id="pc-kind-note"></div>' +
        '<div class="pc-note">' +
        '  Generated questions and generated papers are <strong>practice</strong>, built ' +
        '  from the CAF study text and shaped by patterns measured in real ICAP past ' +
        '  papers. They are not ICAP questions and are never presented as such. Official ' +
        '  past-paper questions are reproduced from the supplied papers and marked ' +
        '  against the examiner\'s own suggested answer, with no partial credit on ' +
        '  multiple-choice items.' +
        '</div>' +
        (practiceCentreLoadSessions().length
            ? '<div class="pc-note">' +
              '<button type="button" class="pc-btn pc-btn-primary" id="pc-weak">' +
              'Where am I weak?</button> ' +
              '<button type="button" class="pc-btn" id="pc-analytics">' +
              'Progress &amp; analytics</button> ' +
              '<button type="button" class="pc-btn" id="pc-mb">' +
              'View mistake book</button></div>'
            : '') +
        '<div class="pc-note"><button type="button" class="pc-btn pc-btn-quiet" id="pc-review">' +
        'Content review &amp; approval (admin)</button> ' +
        '<span class="pc-quiet">The build-time pipeline record re-checked against ' +
        'the bank loaded in this page; sign-off is exported as a file.</span></div>');

    const panel = document.querySelector('.pc-panel');
    const kindSel = panel.querySelector('#pc-kind');
    const subjSel = panel.querySelector('#pc-subject');
    const chapSel = panel.querySelector('#pc-chapter');
    const diffSel = panel.querySelector('#pc-difficulty');
    const countSel = panel.querySelector('#pc-count');
    const paperSel = panel.querySelector('#pc-paper');
    const startBtn = panel.querySelector('#pc-start');

    /* The difficulty tiers are a property of the generated questions. Official
     * questions carry the paper's own difficulty, which is not on one of these four
     * scales, so the control is disabled and says why rather than silently returning
     * every question when a tier is chosen. A full paper disables it for a simpler
     * reason: the paper's questions are fixed, so difficulty and count are the
     * paper's decisions, not the candidate's. */
    function papersForSubject() {
        return (bank.paperList || []).filter(function (p) {
            return !subjSel.value || p.subject === subjSel.value;
        });
    }

    function syncKind() {
        const official = kindSel.value === 'OFFICIAL_PAST_PAPER';
        const paper = kindSel.value === 'GENERATED_PAPER';
        diffSel.disabled = official || paper;
        if (official || paper) diffSel.value = '';
        countSel.disabled = paper;
        paperSel.disabled = !paper;

        /* Rebuild the subject list for this source, keeping the candidate's
         * subject. Every subject is listed under every source now, so the only
         * question is whether the one they chose is still there - and it is.
         *
         * It used to fall back to "the first subject with questions", which
         * quietly MOVED them: picking "scenario focus" while on CAF-1 switched
         * the subject to CAF-3. Better to leave them on CAF-1 showing zero and
         * say which subjects do have questions, than to answer a different
         * question than the one they set up.
         *
         * The candidate's CHAPTER is reset with the source, because a chapter id
         * means nothing under a source that no longer offers its subject - and a
         * stale chapter is how a session silently comes back empty.
         *
         * The fallback comes from the rows just built, not from reading
         * `select.options` back: the rendered HTML is the one thing known to
         * agree with what was set, and re-reading the DOM is a second source of
         * truth that can disagree with it. */
        const hadSubject = subjSel.value;
        const rows = subjectRowsFor(kindSel.value);
        const freshSubjects = subjectOptionsFor(kindSel.value);
        if (subjSel.innerHTML !== freshSubjects) {
            subjSel.innerHTML = freshSubjects;
            const present = rows.map(function (r) { return r.value; });
            const usable = rows.filter(function (r) { return r.n; })
                .map(function (r) { return r.value; });
            subjSel.value = (present.indexOf(hadSubject) !== -1) ? hadSubject
                : (usable[0] || '');
        }

        /* Chapter list, for the subject now chosen. Disabled where a chapter
         * cannot mean anything: a full paper is a fixed sequence, and none of
         * the 61 official past-paper questions carries a study-text topicId, so
         * a chapter filter there would match nothing. Said, not silently empty. */
        const chapterSupported = !paper && !official;
        chapSel.innerHTML = chapterSupported
            ? chapterOptionsFor(kindSel.value, subjSel.value)
            : (paper
                ? '<option value="">Not applicable to a full paper</option>'
                : '<option value="">Official questions are not tied to a chapter</option>');
        chapSel.disabled = !chapterSupported || !subjSel.value;
        if (!chapSel.value || !practiceChapterRowUsable(kindSel.value, subjSel.value, chapSel.value)) {
            chapSel.value = '';
        }

        const list = papersForSubject();
        paperSel.innerHTML = list.length
            ? list.map(function (p) {
                return '<option value="' + p.paperId + '">' +
                    practiceCentreEscape('Paper ' + p.paperId.split('-').pop()
                        + ' - ' + p.focus.toLowerCase() + ' focus, ' + p.totalMarks
                        + ' marks, ' + p.questions.length + ' written questions') +
                    '</option>';
            }).join('')
            : '<option value="">No paper for this subject yet</option>';

        const note = panel.querySelector('#pc-kind-note');
        if (paper) {
            startBtn.disabled = !list.length;
            note.innerHTML = list.length
                ? '<strong>' + list.length + ' paper' + (list.length === 1 ? '' : 's')
                  + '</strong> for this subject, taken in paper order and marked '
                  + 'against the rubric the paper was designed with. Its Section A '
                  + 'is declared on the overview but is not answerable here - the '
                  + 'item text was not recoverable, and inventing it would be worse.'
                : 'No generated paper for this subject yet. Use generated practice '
                  + 'questions, or pick another subject.';
            return;
        }

        /* A focus source. The note says what the pool actually contains, and the
         * button is disabled when it is empty rather than starting a session that
         * would immediately report nothing was selected. */
        const focus = practiceCentreFocusById(kindSel.value);
        if (focus) {
            const n = practiceSelectPool({
                kind: kindSel.value, subjectId: subjSel.value, chapterId: chapSel.value
            }).length;
            const scope = chapSel.value ? 'this chapter'
                : (subjSel.value ? 'this subject' : 'these subjects');
            startBtn.disabled = !n;
            note.innerHTML = '<strong>' + n + ' ' + practiceCentreEscape(focus.short)
                + ' question' + (n === 1 ? '' : 's') + '</strong> for '
                + scope + '. ' + practiceCentreEscape(focus.note)
                /* Zero is a dead end unless it says where the questions are.
                 * Without this the candidate is left staring at a disabled
                 * button on a subject they chose themselves. */
                + (n ? '' : ' Nothing matches here - the subjects with '
                    + practiceCentreEscape(focus.short) + ' questions are '
                    + practiceCentreEscape(focusSubjectList(kindSel.value)) + '.');
            return;
        }

        /* Every count on this screen comes from `practiceSelectPool`, the same
         * function the draw uses, so the number in the note and the questions
         * that arrive cannot disagree. */
        const n = practiceSelectPool({
            kind: kindSel.value, subjectId: subjSel.value, chapterId: chapSel.value
        }).length;
        startBtn.disabled = !n;
        const scope = chapSel.value ? 'this chapter'
            : (subjSel.value ? 'this subject' : 'these subjects');
        note.innerHTML = official
            ? '<strong>' + n + ' official question' + (n === 1 ? '' : 's')
              + '</strong> for ' + scope + '. Only papers supplied with an ICAP '
              + 'suggested answer can be marked against the examiner\'s own scheme; '
              + 'the rest are absent from this list rather than shown without a mark scheme.'
            : '<strong>' + n + ' generated question' + (n === 1 ? '' : 's')
              + '</strong> for ' + scope + '. Marked against a criteria-based rubric.';
    }

    /* Which subjects a source can actually answer, by their short names, for the
     * "nothing here - try these" line. Read from the same rows the Subject
     * dropdown shows, so the hint cannot name a subject the list lacks. */
    function focusSubjectList(kind) {
        const names = [];
        subjectRowsFor(kind).forEach(function (r) {
            if (r.n) names.push(r.label.replace(/^CAF-\d+\s*/, '').split(' - ')[0]);
        });
        return names.length ? names.join(', ') : 'none yet';
    }

    /* Does this chapter still have questions under the current source? Used to
     * clear a chapter that the new source cannot satisfy. */
    function practiceChapterRowUsable(kind, subjectId, chapterId) {
        if (!chapterId) return true;
        return chapterRowsFor(kind, subjectId)
            .some(function (r) { return r.value === chapterId && r.n > 0; });
    }
    kindSel.addEventListener('change', syncKind);
    subjSel.addEventListener('change', syncKind);
    /* The chapter control re-runs syncKind rather than only refreshing the note:
     * the subject is left alone here, so the list must not be rebuilt (that would
     * discard the chapter), but the note and the button both depend on it. */
    chapSel.addEventListener('change', function () {
        const note = panel.querySelector('#pc-kind-note');
        const focus = practiceCentreFocusById(kindSel.value);
        const n = practiceSelectPool({
            kind: kindSel.value, subjectId: subjSel.value, chapterId: chapSel.value
        }).length;
        startBtn.disabled = !n;
        const scope = chapSel.value ? 'this chapter'
            : (subjSel.value ? 'this subject' : 'these subjects');
        const heading = focus
            ? '<strong>' + n + ' ' + practiceCentreEscape(focus.short) + ' question'
                + (n === 1 ? '' : 's') + '</strong> for ' + scope + '. '
                + practiceCentreEscape(focus.note)
            : '<strong>' + n + ' generated question' + (n === 1 ? '' : 's')
                + '</strong> for ' + scope + '. Marked against a criteria-based rubric.';
        note.innerHTML = heading;
    });
    syncKind();

    startBtn.addEventListener('click', function () {
        if (kindSel.value === 'GENERATED_PAPER') {
            if (paperSel.value) practiceCentreRenderPaperOverview(paperSel.value);
            return;
        }
        practiceCentreStartSession({
            kind: kindSel.value,
            subjectId: subjSel.value,
            chapterId: chapSel.value || null,
            difficulty: diffSel.value || null,
            count: parseInt(countSel.value, 10) || 5
        });
    });
    const mbBtn = panel.querySelector('#pc-mb');
    if (mbBtn) {
        mbBtn.addEventListener('click', function () {
            practiceCentreRenderMistakeBook();
        });
    }
    const weakBtn = panel.querySelector('#pc-weak');
    if (weakBtn) {
        weakBtn.addEventListener('click', function () {
            practiceCentreRenderWeakness();
        });
    }
    const analyticsBtn = panel.querySelector('#pc-analytics');
    if (analyticsBtn) {
        analyticsBtn.addEventListener('click', function () {
            practiceCentreRenderAnalytics();
        });
    }
    const reviewBtn = panel.querySelector('#pc-review');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', function () {
            practiceCentreRenderReview();
        });
    }
}

function practiceCentreStartSession(opts) {
    /* `questions` lets a recommendation start a session the form cannot express
     * - the handful a weak topic has left, unattempted - while every other
     * route still goes through the same selection. */
    const questions = (opts.questions && opts.questions.length)
        ? opts.questions
        : practiceSelectQuestions(opts);
    if (!questions.length) {
        practiceCentrePanel(practiceCentreHeader('Nothing selected') +
            '<p class="pc-note">No questions match that combination. Try another subject or difficulty.</p>');
        return;
    }
    PRACTICE_CENTRE.questions = questions;
    PRACTICE_CENTRE.index = 0;
    PRACTICE_CENTRE.answers = {};
    PRACTICE_CENTRE.lastResult = null;
    // `kind` comes from the source selector rather than being hardcoded, so an
    // official session is recorded as official. Hardcoding it here meant every
    // session was labelled GENERATED_PRACTICE while the question inside it was an
    // official past-paper question - so the mistake book, the analytics and any
    // export all attributed ICAP questions to the generator.
    // A focus session says which focus it was, so a mixed CAF-2/CAF-7 record is
    // legible in the history instead of looking like undifferentiated practice.
    const focus = practiceCentreFocusById(opts.kind);
    const sessionLabel = opts.kind === 'OFFICIAL_PAST_PAPER'
        ? 'CAF past-paper practice'
        : (focus ? ('CAF practice - ' + focus.short + ' focus') : 'CAF written practice');
    PRACTICE_CENTRE.session = practiceCreateSession({
        questions: questions,
        subjectId: opts.subjectId,
        label: sessionLabel,
        kind: opts.kind || 'GENERATED_PRACTICE'
    });
    practiceCentreRenderQuestion();
}

/* --------------------------------------------------------- paper overview
 * A paper is not a bag of questions. It has a total, a duration, a design mix
 * and a Section A this build cannot serve, and all four are shown before the
 * candidate commits to it: starting a "100-mark paper" that can only award 90
 * has to be said on the screen, not discovered at the end of it. So does what
 * the paper IS - generated practice, not an ICAP paper - which is stated in the
 * paper's own provenance line rather than in a footnote of ours.
 */
function practiceCentreRenderPaperOverview(paperId) {
    const bank = practiceIndexBank();
    const p = bank && bank.paperById ? bank.paperById[paperId] : null;
    if (!p) { practiceCentreRenderSetup(); return; }

    const subject = practiceCentreSubjectFor(p.subject);
    const subjectLabel = subject ? subject.label : (p.subjectName || p.subject);
    const secA = p.sectionA || {};
    const prov = p.provenance || {};

    const qrows = p.questions.map(function (q) {
        return '<tr><td class="pc-num">' + q.number + '</td>' +
            '<td>' + practiceCentreEscape(q.section || '-') + '</td>' +
            '<td>' + practiceCentreEscape(q.type) + '</td>' +
            '<td class="pc-num">' + q.marks + '</td></tr>';
    }).join('');

    /* Designed, achieved and measured side by side. This is the paper's answer
     * to "why is this paper mostly numbers?" - the design mix was set from what
     * this subject's real papers measure, and the achieved column is what this
     * paper actually came out at. */
    const basis = p.designBasis || {};
    const design = basis.designMix || {};
    const measured = basis.measuredMix || {};
    const achieved = (p.achieved && p.achieved.marksShareByType) || {};
    const types = Object.keys(achieved).concat(
        Object.keys(design).filter(function (t) {
            return Object.keys(achieved).indexOf(t) === -1;
        }));
    const mixrows = types.map(function (t) {
        function pct(m) { return m[t] === undefined ? '-' : m[t] + '%'; }
        return '<tr><td>' + practiceCentreEscape(t) + '</td>' +
            '<td class="pc-num">' + pct(design) + '</td>' +
            '<td class="pc-num">' + pct(achieved) + '</td>' +
            '<td class="pc-num">' + pct(measured) + '</td></tr>';
    }).join('');

    const secABox = secA.itemsAvailable
        ? '<div class="pc-note"><strong>Section ' +
          practiceCentreEscape(secA.section || 'A') + ':</strong> ' +
          practiceCentreEscape(String(secA.marks)) + ' marks of objective items.</div>'
        : '<div class="pc-warnbox"><strong>Section ' +
          practiceCentreEscape(secA.section || 'A') + ' is declared at ' +
          practiceCentreEscape(String(secA.marks)) + ' marks but cannot be sat here.</strong> ' +
          practiceCentreEscape(secA.reason || 'Its items were not recoverable.') +
          ' The written section below is what this session will mark.</div>';

    const aligned = p.questions.filter(function (q) {
        return q.requirementFromTopic;
    }).length;
    const traceLine = aligned
        ? '<strong>' + aligned + ' of ' + p.questions.length + '</strong> questions take '
          + 'their requirement from a named study-text topic; the rest are filed under a '
          + 'topic while their figures are composed for practice. The topic is shown with '
          + 'each marked answer, and which of the two it is.'
        : 'No question in this paper draws its requirement from a named study-text topic.';

    practiceCentrePanel(practiceCentreHeader(subjectLabel + ' - generated paper ' + p.paperId) +
        '<div class="pc-progress">' +
        '  <span class="pc-badge">' + practiceCentreEscape(p.focus || '') + ' focus</span>' +
        '  <span class="pc-badge">' + p.totalMarks + ' marks</span>' +
        '  <span class="pc-badge">' + (p.durationHours || '-') + ' hours</span>' +
        '  <span class="pc-badge">' + p.questions.length + ' written questions (' +
              p.writtenMarks + ' marks)</span>' +
        '</div>' +
        '<div class="pc-question">' + practiceCentreEscape(p.instruction || '') + '</div>' +
        secABox +
        '<div class="pc-note">' + practiceCentreEscape(
            prov.statement || 'Generated practice paper.') + '</div>' +
        '<h4 class="pc-h">Where the marks sit</h4>' +
        '<table class="pc-criteria"><thead><tr><th>Type</th><th>Designed</th>' +
        '<th>This paper</th><th>Measured in real papers</th></tr></thead><tbody>' +
        mixrows + '</tbody></table>' +
        '<h4 class="pc-h">Written section</h4>' +
        '<table class="pc-criteria"><thead><tr><th>Q</th><th>Section</th><th>Type</th>' +
        '<th>Marks</th></tr></thead><tbody>' + qrows + '</tbody></table>' +
        '<div class="pc-note">' + traceLine + '</div>' +
        '<div class="pc-actions">' +
        '  <button type="button" class="pc-btn" id="pc-paper-back">Back</button>' +
        '  <button type="button" class="pc-btn pc-btn-primary" id="pc-paper-start">' +
        '    Start paper</button>' +
        '</div>' +
        '<div class="pc-note">Your expected answer and the paper\'s model workings are ' +
        'hidden until you submit each question.</div>');

    const panel = document.querySelector('.pc-panel');
    panel.querySelector('#pc-paper-back').addEventListener('click',
        practiceCentreRenderSetup);
    panel.querySelector('#pc-paper-start').addEventListener('click', function () {
        practiceCentreStartPaper(paperId);
    });
}

/* Start a paper: its own questions, in the paper's own order, as one session. */
function practiceCentreStartPaper(paperId) {
    const bank = practiceIndexBank();
    const p = bank && bank.paperById ? bank.paperById[paperId] : null;
    const questions = p ? bank.paperQuestions.filter(function (q) {
        return q.paperId === paperId;
    }) : [];
    if (!p || !questions.length) { practiceCentreRenderSetup(); return; }

    const subject = practiceCentreSubjectFor(p.subject);
    PRACTICE_CENTRE.questions = questions;
    PRACTICE_CENTRE.index = 0;
    PRACTICE_CENTRE.answers = {};
    PRACTICE_CENTRE.lastResult = null;
    PRACTICE_CENTRE.session = practiceCreateSession({
        questions: questions,
        subjectId: p.subject,
        paperId: paperId,
        label: (subject ? subject.label : p.subject) + ' - generated paper ' + paperId,
        kind: 'GENERATED_PAPER'
    });
    practiceCentreRenderQuestion();
}

/* ------------------------------------------------------------- question screen */

function practiceCentreRenderQuestion() {
    const C = PRACTICE_CENTRE;
    const q = C.questions[C.index];
    if (!q) { practiceCentreRenderSummary(); return; }

    // The attempt view is the ONLY question source used here. It carries no
    // expected answer, no rubric and no option letters.
    const view = practiceQuestionView(C.session, q.id);
    const saved = (C.answers[q.id] && C.answers[q.id].text) || '';
    const isObjective = view.isObjective;
    const progress = 'Question ' + (C.index + 1) + ' of ' + C.questions.length;

    const body = isObjective
        ? '<p class="pc-note">This is an official past-paper multiple-choice question. ' +
          'Select the option letters, then submit. It is marked exactly against the ' +
          'examiner\'s own answer key, with no partial credit.</p>' +
          '<div class="pc-mcq-grid" id="pc-mcq"></div>'
        : '<textarea id="pc-answer" class="pc-textarea" rows="12" ' +
          'placeholder="Type your answer here, or upload a photo of your handwritten answer below.">' +
          practiceCentreEscape(saved) + '</textarea>' +
          '<div class="pc-upload">' +
          '  <label class="pc-file">Upload handwritten answer' +
          '    <input type="file" id="pc-image" accept="image/*" capture="environment">' +
          '  </label>' +
          '  <button type="button" class="pc-btn" id="pc-ocr">Transcribe with OCR</button>' +
          '  <span class="pc-ocr-note" id="pc-ocr-note"></span>' +
          '</div>';

    practiceCentrePanel(practiceCentreHeader(view.sourceLabel) +
        '<div class="pc-progress">' + practiceCentreEscape(progress) +
        '  <span class="pc-badge">' + view.marks + ' mark' + (view.marks === 1 ? '' : 's') +
        '</span>' +
        (view.paperId
            ? '<span class="pc-badge">Section ' +
              practiceCentreEscape(view.paperSection || '-') + ' - Q' +
              practiceCentreEscape(String(view.paperQuestionNumber)) + '</span>'
            : '') +
        (view.difficulty ? '<span class="pc-badge">' + practiceCentreEscape(view.difficulty) + '</span>' : '') +
        (view.estimatedMinutes ? '<span class="pc-badge">~' + view.estimatedMinutes + ' min</span>' : '') +
        '</div>' +
        '<div class="pc-question">' + practiceCentreEscape(view.text) + '</div>' +
        body +
        '<div class="pc-actions">' +
        '  <button type="button" class="pc-btn" id="pc-prev"' +
            (C.index === 0 ? ' disabled' : '') + '>Previous</button>' +
        '  <button type="button" class="pc-btn pc-btn-primary" id="pc-submit">Submit answer</button>' +
        '  <button type="button" class="pc-btn" id="pc-next"' +
            (C.index >= C.questions.length - 1 ? ' disabled' : '') + '>Skip for now</button>' +
        '</div>' +
        '<div class="pc-note">Your expected answer is not shown while the session is live.</div>');

    const panel = document.querySelector('.pc-panel');

    if (isObjective) practiceCentreRenderMCQInputs(q);

    const submit = panel.querySelector('#pc-submit');
    if (submit) submit.addEventListener('click', function () { practiceCentreSubmit(); });
    const prev = panel.querySelector('#pc-prev');
    if (prev && !prev.disabled) {
        prev.addEventListener('click', function () {
            if (C.index > 0) { C.index -= 1; practiceCentreRenderQuestion(); }
        });
    }
    const next = panel.querySelector('#pc-next');
    if (next && !next.disabled) {
        next.addEventListener('click', function () {
            C.index += 1; practiceCentreRenderQuestion();
        });
    }

    const imgInput = panel.querySelector('#pc-image');
    const ocrBtn = panel.querySelector('#pc-ocr');
    if (ocrBtn && imgInput) {
        ocrBtn.addEventListener('click', function () {
            const file = imgInput.files && imgInput.files[0];
            const note = panel.querySelector('#pc-ocr-note');
            if (!file) {
                note.textContent = 'Choose a photo of your answer first.';
                note.className = 'pc-ocr-note pc-warn';
                return;
            }
            const provider = getOCRProvider();
            if (!provider.available) {
                note.textContent = 'No OCR endpoint configured. Type your answer instead.';
                note.className = 'pc-ocr-note pc-warn';
                return;
            }
            note.textContent = 'Transcribing...';
            note.className = 'pc-ocr-note';
            ocrBtn.disabled = true;
            const reader = new FileReader();
            reader.onload = function () {
                transcribeAnswer(reader.result).then(function (res) {
                    ocrBtn.disabled = false;
                    panel.querySelector('#pc-answer').value = res.text;
                    PRACTICE_CENTRE.answers[q.id] = res;
                    note.textContent = 'Transcribed (' + provider.name + '). '
                        + (res.confidence === null ? 'confidence not reported.'
                            : 'confidence ' + Math.round(res.confidence * 100) + '%.')
                        + (res.lowConfidence ? ' Low confidence - check it before submitting.' : '');
                    note.className = 'pc-ocr-note' + (res.lowConfidence ? ' pc-warn' : '');
                }).catch(function (err) {
                    ocrBtn.disabled = false;
                    note.textContent = 'OCR failed: ' + err.message;
                    note.className = 'pc-ocr-note pc-warn';
                });
            };
            reader.onerror = function () {
                ocrBtn.disabled = false;
                note.textContent = 'Could not read that image file.';
                note.className = 'pc-ocr-note pc-warn';
            };
            reader.readAsDataURL(file);
        });
    }
}

function practiceCentreRenderMCQInputs(q) {
    const grid = document.querySelector('#pc-mcq');
    if (!grid) return;

    // The view carries the item set for official Section A, or nothing for
    // generated practice MCQs. The two shapes are:
    //   official: mcqItems = [{item, marks, stem, a, textA, b, textB, ...}, ...]
    //   generated: mcqItems = undefined, fallback to single A/B/C/D grid.
    const view = practiceQuestionView(PRACTICE_CENTRE.session, q.id);
    const items = view && view.mcqItems;

    const saved = (PRACTICE_CENTRE.answers[q.id]
        && PRACTICE_CENTRE.answers[q.id].selectedOptions) || {};

    if (items && items.length) {
        // Section A: each item gets its own group of radio buttons.
        // The selectedOptions map is keyed by roman numeral ("i", "ii"...),
        // each value being the chosen option letter ("a".."d").
        const html = items.map(function (it) {
            const roman = it[0];
            const marks = it[1];
            const stem = it[2] || '';
            const opts = [];
            for (let k = 3; k < it.length; k += 2) {
                if (it[k]) opts.push([it[k], it[k + 1] || '']);
            }
            const sel = saved[roman] || '';
            return '<fieldset class="pc-mcq-item">' +
                '<legend>' + practiceCentreEscape(roman.toUpperCase()) +
                (marks ? ' <span class="pc-mcq-marks">[' + marks + ' mark' + (marks === 1 ? '' : 's') + ']</span>' : '') +
                '</legend>' +
                '<div class="pc-mcq-stem">' + practiceCentreEscape(stem) + '</div>' +
                '<div class="pc-mcq-options">' +
                opts.map(function (o) {
                    return '<label class="pc-mcq-cell">' +
                        '<input type="radio" name="pc-opt-' + roman + '" value="' + o[0] + '"' +
                        (sel === o[0] ? ' checked' : '') + '>' +
                        '<span>' + o[0].toUpperCase() + '</span> ' +
                        practiceCentreEscape(o[1]) + '</label>';
                }).join('') +
                '</div>' +
                '</fieldset>';
        }).join('');
        grid.innerHTML = html;
        return;
    }

    // Generated practice MCQ: single A/B/C/D grid keyed by a single letter.
    grid.innerHTML = ['', 'A', 'B', 'C', 'D'].map(function (letter) {
        return '<label class="pc-mcq-cell">' +
            '<input type="radio" name="pc-opt" value="' + letter + '"' +
            (saved[letter] === letter ? ' checked' : '') + '>' +
            '<span>' + letter + '</span></label>';
    }).join('');
}

/* ------------------------------------------------------------------- submit */

function practiceCentreSubmit() {
    const C = PRACTICE_CENTRE;
    const q = C.questions[C.index];
    if (!q) return;
    const view = practiceQuestionView(C.session, q.id);
    const panel = document.querySelector('.pc-panel');
    let transcription;

    if (view.isObjective) {
        const items = view.mcqItems;
        const chosen = {};
        if (items && items.length) {
            // Section A: each item has its own radio group named pc-opt-<roman>
            items.forEach(function (it) {
                const roman = it[0];
                const r = panel.querySelector('input[name="pc-opt-' + roman + '"]:checked');
                if (r) chosen[roman] = r.value;
            });
        } else {
            // Generated practice MCQ: single radio group named pc-opt
            panel.querySelectorAll('input[name="pc-opt"]:checked').forEach(function (r) {
                chosen[r.value] = r.value;
            });
        }
        transcription = { selectedOptions: chosen, rawText: '', text: '', confidence: 1 };
    } else {
        const ta = panel.querySelector('#pc-answer');
        const text = ta ? ta.value : '';
        const prior = C.answers[q.id] || {};
        if (!text.trim()) {
            const note = panel.querySelector('#pc-ocr-note');
            if (note) {
                note.textContent = 'Write or transcribe an answer before submitting.';
                note.className = 'pc-ocr-note pc-warn';
            }
            if (ta) ta.focus();
            return;
        }
        transcription = {
            rawText: text,
            text: practiceNormalize(text),
            // A typed answer is exact by definition; an OCR answer carries the
            // confidence it actually reported.
            confidence: prior.provider && !prior.manual ? prior.confidence : 1,
            provider: prior.provider || 'typed',
            manual: true,
            lowConfidence: prior.provider && !prior.manual ? !!prior.lowConfidence : false
        };
    }

    const result = practiceSubmit(C.session, q.id, transcription);
    C.answers[q.id] = transcription;
    C.lastResult = result;
    practiceCentreRenderFeedback();
}

/* ----------------------------------------------------------------- feedback */

function practiceCentreRenderFeedback() {
    const C = PRACTICE_CENTRE;
    const q = C.questions[C.index];
    const fb = practiceFeedback(C.session, q.id);
    if (!fb) { practiceCentreRenderQuestion(); return; }

    const criteriaRows = fb.criteria.map(function (c) {
        const pct = c.maxMarks ? Math.round(c.awarded / c.maxMarks * 100) : 0;
        const cls = c.awarded >= c.maxMarks ? 'pc-full'
            : (c.awarded > 0 ? 'pc-part' : 'pc-zero');
        const evidence = [];
        if (c.matchedEvidence.length) {
            evidence.push('<span class="pc-ev pc-ev-hit">shown: '
                + practiceCentreEscape(c.matchedEvidence.slice(0, 10).join(', ')) + '</span>');
        }
        if (c.missingEvidence.length) {
            evidence.push('<span class="pc-ev pc-ev-miss">not evidenced: '
                + practiceCentreEscape(c.missingEvidence.slice(0, 10).join(', ')) + '</span>');
        }
        return '<tr class="' + cls + '">' +
            '<td>' + practiceCentreEscape(c.label) + '</td>' +
            '<td class="pc-num">' + c.awarded + ' / ' + c.maxMarks + '</td>' +
            '<td class="pc-bar"><span style="width:' + pct + '%"></span></td>' +
            '<td class="pc-ev-cell">' + (evidence.join('<br>') || '&mdash;') + '</td>' +
            '</tr>';
    }).join('');

    const unreadableBanner = fb.unreadable
        ? '<div class="pc-warnbox"><strong>This answer could not be read.</strong> ' +
          practiceCentreEscape(fb.note) +
          '. No marks have been awarded, because guessing would misreport your performance. ' +
          'Retype the answer and submit again.</div>'
        : '';

    /* Study source. For a paper question the topic is one of two different
     * things and the screen has to say which: some questions take their
     * requirement FROM the topic, the rest are merely FILED under it while their
     * figures are composed for practice. Printing both as "Study text:" is how a
     * depreciation question ends up citing Not for Profit Organisations. */
    let source = '';
    if (fb.grounding && fb.grounding.topicId) {
        const g = fb.grounding;
        const st = fb.studySource;
        source = '<div class="pc-source"><strong>' +
            (g.aligned ? 'Requirement drawn from the study text topic:'
                        : 'Filed under this study text topic:') + '</strong> ' +
            practiceCentreEscape(g.topicTitle || g.topicId) +
            (g.chapter ? ' &mdash; ' + practiceCentreEscape(g.chapter) : '') +
            (g.aligned && st && st.studyPage
                ? ' (p. ' + practiceCentreEscape(st.studyPage) + ')' : '') +
            (g.aligned ? '' :
                '<div>The figures and facts in this question are composed for ' +
                'practice, not quoted from that topic.</div>') +
            '</div>';
    } else if (fb.studySource) {
        source = '<div class="pc-source"><strong>Study text:</strong> '
          + practiceCentreEscape(fb.studySource.title)
          + (fb.studySource.chapterTitle
              ? ' &mdash; ' + practiceCentreEscape(fb.studySource.chapterTitle) : '')
          + (fb.studySource.studyPage
              ? ' (p. ' + practiceCentreEscape(fb.studySource.studyPage) + ')' : '')
          + '</div>';
    }

    const expected = fb.expectedAnswer
        ? '<div class="pc-expected"><div class="pc-expected-title">Expected answer</div>'
          + '<div>' + practiceCentreEscape(fb.expectedAnswer.slice(0, 1200)) + '</div></div>'
        : (fb.markingNote ? ''
            : '<div class="pc-note">No expected answer could be resolved for this question.</div>');

    /* The paper's own model workings, shown after submission like any other
     * answer material. A SCENARIO paper has none and prints a marking note
     * instead of an answer, which is worth showing as the paper wrote it. */
    const workings = fb.workings
        ? '<div class="pc-expected"><div class="pc-expected-title">Model workings</div>'
          + '<div>' + practiceCentreEscape(fb.workings) + '</div></div>'
        : '';
    const markingNote = fb.markingNote
        ? '<div class="pc-note"><strong>Marking note printed with the paper:</strong> '
          + practiceCentreEscape(fb.markingNote) + '</div>'
        : '';

    const tip = fb.examTip
        ? '<div class="pc-tip"><strong>Examiner tip from the study text:</strong> '
          + practiceCentreEscape(fb.examTip) + '</div>'
        : '';

    const pct = fb.marks ? Math.round(fb.awarded / fb.marks * 100) : 0;
    const isLast = C.index >= C.questions.length - 1;

    practiceCentrePanel(practiceCentreHeader(fb.sourceLabel) +
        '<div class="pc-score" data-awarded="' + fb.awarded + '" data-marks="' + fb.marks +
        '" data-percent="' + pct + '">' +
        '<div class="pc-score-num">' + fb.awarded + '<span>/' + fb.marks + '</span></div>' +
        '<div class="pc-score-pct">' + pct + '%</div>' +
        '</div>' +
        unreadableBanner +
        '<div class="pc-question">' + practiceCentreEscape(fb.questionText) + '</div>' +
        '<table class="pc-criteria"><thead><tr><th>Criterion</th><th>Marks</th>' +
        '<th></th><th>Evidence</th></tr></thead><tbody>' + criteriaRows + '</tbody></table>' +
        expected + workings + markingNote + source + tip +
        '<div class="pc-disclaimer">' + practiceCentreEscape(fb.disclaimer) + '</div>' +
        '<div class="pc-actions">' +
        (C.index > 0 ? '<button type="button" class="pc-btn" id="pc-retry">Answer again</button>' : '') +
        (isLast
            ? '<button type="button" class="pc-btn pc-btn-primary" id="pc-finish">See session summary</button>'
            : '<button type="button" class="pc-btn pc-btn-primary" id="pc-continue">Next question</button>') +
        '</div>');

    const panel = document.querySelector('.pc-panel');
    const retry = panel.querySelector('#pc-retry');
    if (retry) {
        retry.addEventListener('click', function () {
            delete C.answers[q.id];
            practiceCentreRenderQuestion();
        });
    }
    const cont = panel.querySelector('#pc-continue');
    if (cont) {
        cont.addEventListener('click', function () {
            C.index += 1; practiceCentreRenderQuestion();
        });
    }
    const fin = panel.querySelector('#pc-finish');
    if (fin) {
        fin.addEventListener('click', function () {
            C.index = C.questions.length; practiceCentreRenderSummary();
        });
    }
}

/* ------------------------------------------------------------------ summary */

function practiceCentreRenderSummary() {
    const C = PRACTICE_CENTRE;
    // Finished and persisted exactly once per session. Re-rendering the summary
    // would otherwise re-run the totals and store the same session twice, which
    // double-counts every entry in the mistake book.
    if (!C.session.finishedAt) {
        practiceFinish(C.session);
        practiceCentrePersistSession(C.session);
    }
    const totals = C.session;
    const t = totals && totals.totals;
    if (!t) return;

    const byDiff = Object.keys(t.byDifficulty).map(function (k) {
        const b = t.byDifficulty[k];
        return '<tr><td>' + practiceCentreEscape(k) + '</td><td class="pc-num">' +
            b.awarded + ' / ' + b.marks + '</td><td class="pc-num">' + b.percent + '%</td>' +
            '<td class="pc-num">' + b.count + '</td></tr>';
    }).join('');

    const perQuestion = (totals.results || []).map(function (r, i) {
        const status = r.unreadable ? 'unreadable'
            : (r.percent >= 70 ? 'strong' : (r.percent >= 40 ? 'partial' : 'weak'));
        return '<tr class="pc-q-' + status + '"><td>' + (i + 1) + '</td>' +
            '<td>' + practiceCentreEscape(PRACTICE_CENTRE.questions[i] ? PRACTICE_CENTRE.questions[i].text : r.questionId).slice(0, 110) + '</td>' +
            '<td class="pc-num">' + r.awarded + ' / ' + r.maxMarks + '</td>' +
            '<td>' + practiceCentreEscape(status) + '</td></tr>';
    }).join('');

    const mb = practiceCentreMistakeBook();
    const mbRows = mb.entries.slice(0, 8).map(function (e) {
        return '<tr><td>' + practiceCentreEscape(e.errorType.replace(/_/g, ' ').toLowerCase()) + '</td>' +
            '<td>' + practiceCentreEscape(e.criterionId) + '</td>' +
            '<td class="pc-num">' + e.marksLost + '</td>' +
            '<td class="pc-num">' + e.questionCount + '</td></tr>';
    }).join('');

    const unreadableNote = t.unreadable
        ? '<div class="pc-warnbox">' + t.unreadable + ' answer(s) could not be transcribed ' +
          'and scored zero. Those marks say nothing about your knowledge - retype them.</div>'
        : '';

    /* Which paper this was, and what part of it could be sat. The denominator of
     * this score is the written section; saying so is the difference between an
     * honest mark and one that looks 10 marks short for no stated reason. */
    const paper = C.session.paperId ? practicePaperById(C.session.paperId) : null;
    const paperNote = paper
        ? '<div class="pc-note"><strong>' + practiceCentreEscape(paper.paperId) +
          '</strong> &mdash; ' + paper.writtenMarks + ' written marks sat' +
          (paper.sectionA && !paper.sectionA.itemsAvailable
              ? ', plus ' + paper.sectionA.marks +
                ' marks of Section A that this build cannot serve (the item text was ' +
                'not recoverable, and it was not invented)'
              : '') + '.</div>'
        : '';

    practiceCentrePanel(practiceCentreHeader('Session complete') +
        '<div class="pc-score"><div class="pc-score-num">' + t.awarded +
        '<span>/' + t.marks + '</span></div><div class="pc-score-pct">' + t.percent + '%</div></div>' +
        unreadableNote + paperNote +
        (byDiff ? '<h4 class="pc-h">By difficulty</h4><table class="pc-criteria"><tbody>' +
            byDiff + '</tbody></table>' : '') +
        (mbRows ? '<h4 class="pc-h">Where marks were lost</h4><table class="pc-criteria"><tbody>' +
            mbRows + '</tbody></table>' : '') +
        '<h4 class="pc-h">Every question</h4><table class="pc-criteria"><tbody>' +
        perQuestion + '</tbody></table>' +
        '<div class="pc-disclaimer">This mark is an automated estimate from the evidence in ' +
        'your answer, for self-study. It is not an official ICAP result.</div>' +
        '<div class="pc-actions">' +
        '  <button type="button" class="pc-btn" id="pc-again">New session</button>' +
        '  <button type="button" class="pc-btn" id="pc-mistakes">Mistake book</button>' +
        '</div>');

    const panel = document.querySelector('.pc-panel');
    panel.querySelector('#pc-again').addEventListener('click', practiceCentreRenderSetup);
    panel.querySelector('#pc-mistakes').addEventListener('click', practiceCentreRenderMistakeBook);
}

/* One reader for the local session cache, used by both the mistake book and the
 * weakness screen so the two can never disagree about what has been attempted.
 * It is a cache, not a store: nothing in the marking depends on it. */
function practiceCentreLoadSessions() {
    try {
        const raw = localStorage.getItem('pc_sessions');
        if (!raw) return [];
        const all = JSON.parse(raw);
        if (!Array.isArray(all)) return [];
        return all.filter(function (s) { return s && (s.results || []).length; });
    } catch (e) {
        return [];
    }
}

function practiceCentreMistakeBook() {
    const all = practiceCentreLoadSessions();
    if (!all.length) return {};
    return practiceMistakeBook(all);
}

function practiceCentreRenderMistakeBook() {
    const mb = practiceCentreMistakeBook();
    if (!mb.entries || !mb.entries.length) {
        practiceCentrePanel(practiceCentreHeader('Mistake book') +
            '<p class="pc-note">No marks have been lost yet. Complete a session and the ' +
            'patterns will appear here.</p>');
        return;
    }
    const rows = mb.entries.map(function (e) {
        return '<tr><td>' + practiceCentreEscape(e.errorType.replace(/_/g, ' ').toLowerCase()) + '</td>' +
            '<td>' + practiceCentreEscape(e.criterionId) + '</td>' +
            '<td class="pc-num">' + e.marksLost + '</td>' +
            '<td class="pc-num">' + e.occurrences + '</td></tr>';
    }).join('');
    practiceCentrePanel(practiceCentreHeader('Mistake book') +
        '<p class="pc-note">' + mb.entries.length + ' pattern(s) across your sessions.</p>' +
        '<table class="pc-criteria"><thead><tr><th>Error</th><th>Criterion</th>' +
        '<th>Marks lost</th><th>Times</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="pc-actions"><button type="button" class="pc-btn" id="pc-back">Back</button></div>');
    document.querySelector('.pc-panel').querySelector('#pc-back')
        .addEventListener('click', practiceCentreRenderSetup);
}

/* ------------------------------------------------------ weakness screen
 * Phase 15's screen. Every number on it comes from `practiceWeaknessReport`,
 * so this function only renders: it counts nothing, judges nothing and
 * recommends nothing of its own. The one judgement it does make visible is the
 * evidence rule - a topic under three attempts reads "Not enough evidence"
 * rather than a colour, because a verdict built on one answer would send the
 * candidate to revise the wrong thing. */
function practiceCentreRenderWeakness() {
    const bank = practiceIndexBank();
    const sessions = practiceCentreLoadSessions();

    function subjectName(id) {
        const s = practiceCentreSubjectFor(id);
        return s ? s.label : id;
    }
    function topicName(id) {
        const t = practiceStudyTopic(id);
        if (!t) return id;
        return t.title + (t.chapterTitle ? ' - ' + t.chapterTitle : '');
    }
    function badge(verdict) {
        const cls = verdict === 'WEAK' ? 'pc-v-weak'
            : verdict === 'DEVELOPING' ? 'pc-v-dev'
            : verdict === 'STRONG' ? 'pc-v-strong' : 'pc-v-none';
        const label = verdict === 'INSUFFICIENT_EVIDENCE' ? 'Not enough evidence' : verdict;
        return '<span class="pc-badge ' + cls + '">' + practiceCentreEscape(label) + '</span>';
    }

    const report = practiceWeaknessReport(sessions, bank, { subjectLabel: subjectName });

    if (!report.attempted) {
        practiceCentrePanel(practiceCentreHeader('Where am I weak?') +
            '<p class="pc-note">Nothing has been marked yet. Answer a few questions first and ' +
            'this will show which subjects, topics and question types are costing marks, with ' +
            'what to do about each one.</p>' +
            '<div class="pc-actions"><button type="button" class="pc-btn" id="pc-back">' +
            'Back</button></div>');
        document.querySelector('.pc-panel').querySelector('#pc-back')
            .addEventListener('click', practiceCentreRenderSetup);
        return;
    }

    const subjRows = report.subjects.map(function (s) {
        return '<tr><td>' + practiceCentreEscape(subjectName(s.id)) + '</td>' +
            '<td class="pc-num">' + s.unique + '</td>' +
            '<td class="pc-num">' + s.awarded + '/' + s.possible + '</td>' +
            '<td class="pc-num">' + s.percent + '%</td>' +
            '<td>' + badge(s.verdict) + '</td></tr>';
    }).join('');

    const chapterRows = report.chapters.slice(0, 10).map(function (c) {
        return '<tr><td>' + practiceCentreEscape(c.title) + '</td>' +
            '<td class="pc-num">' + c.unique + '</td>' +
            '<td class="pc-num">' + c.awarded + '/' + c.possible + '</td>' +
            '<td class="pc-num">' + c.percent + '%</td>' +
            '<td>' + badge(c.verdict) + '</td></tr>';
    }).join('');

    const topicRows = report.topics.slice(0, 8).map(function (t) {
        return '<tr><td>' + practiceCentreEscape(topicName(t.id)) + '</td>' +
            '<td class="pc-num">' + t.unique + '</td>' +
            '<td class="pc-num">' + t.percent + '%</td>' +
            '<td class="pc-num">' + t.marksLost + '</td>' +
            '<td>' + badge(t.verdict) + '</td></tr>';
    }).join('');

    const typeRows = report.types.map(function (t) {
        return '<tr><td>' + practiceCentreEscape(String(t.id).toLowerCase()) + '</td>' +
            '<td class="pc-num">' + t.unique + '</td>' +
            '<td class="pc-num">' + t.percent + '%</td>' +
            '<td>' + badge(t.verdict) + '</td></tr>';
    }).join('');

    const errRows = report.errors.slice(0, 8).map(function (e) {
        return '<tr><td>' + practiceCentreEscape(
            String(e.errorType).replace(/_/g, ' ').toLowerCase()) + '</td>' +
            '<td class="pc-num">' + e.marksLost + '</td>' +
            '<td class="pc-num">' + e.occurrences + '</td>' +
            '<td>' + practiceCentreEscape(e.hint) + '</td></tr>';
    }).join('');

    const recHtml = report.recommendations.length
        ? report.recommendations.map(function (r) {
            let action = '';
            if (r.kind === 'STUDY') {
                action = ' <button type="button" class="pc-btn" data-pc-rec="topic" data-pc-id="' +
                    practiceCentreEscape(r.topicId) + '">Open the topic</button>';
            } else if (r.kind === 'PRACTICE') {
                action = ' <button type="button" class="pc-btn" data-pc-rec="type" data-pc-id="' +
                    practiceCentreEscape(r.type) + '">Start 5 questions</button>';
            } else if (r.kind === 'PAPER') {
                action = ' <button type="button" class="pc-btn" data-pc-rec="paper" data-pc-id="' +
                    practiceCentreEscape(r.paperId) + '">Open the paper</button>';
            } else if (r.kind === 'MORE_ATTEMPTS') {
                action = ' <button type="button" class="pc-btn" data-pc-rec="more" data-pc-id="' +
                    practiceCentreEscape(r.chapterId) + '">Answer what is left</button>';
            }
            return '<div class="pc-rec"><strong>' + r.rank + '. '
                + practiceCentreEscape({ STUDY: 'Revise', PRACTICE: 'Drill', PAPER: 'Paper',
                    MORE_ATTEMPTS: 'More evidence', TECHNIQUE: 'Technique' }[r.kind] || r.kind)
                + '</strong><br>' + practiceCentreEscape(r.text) + action + '</div>';
        }).join('')
        : '<p class="pc-note">Nothing has cost enough marks yet to point at. Keep going.</p>';

    practiceCentrePanel(practiceCentreHeader('Where am I weak?') +
        '<div class="pc-score"><div class="pc-score-num">' + report.awarded +
        '<span>/' + report.possible + '</span></div>' +
        '<div class="pc-score-pct">' + report.percent + '%</div></div>' +
        '<p class="pc-note">' + report.attempted + ' question(s) across ' + report.sessions +
        ' session(s).' + (report.objectiveAttempts
            ? ' ' + report.objectiveAttempts +
              ' of them were objective items, marked on the examiner\'s own letters with no partial credit.'
            : '') + '</p>' +
        (report.unreadable
            ? '<div class="pc-warnbox"><strong>' + report.unreadable +
              ' answer(s) could not be read</strong> and are counted as zero. Retype and ' +
              'resubmit them before reading the rest of this report - the weakness below ' +
              'may be a reading failure rather than a knowledge one.</div>'
            : '') +
        '<div class="pc-h">By subject</div>' +
        '<table class="pc-criteria"><thead><tr><th>Subject</th><th>Questions</th>' +
        '<th>Marks</th><th>Score</th><th>Verdict</th></tr></thead><tbody>' +
        subjRows + '</tbody></table>' +
        '<div class="pc-h">Chapters, worst first - verdicts are made here</div>' +
        '<table class="pc-criteria"><thead><tr><th>Chapter</th><th>Questions</th>' +
        '<th>Marks</th><th>Score</th><th>Verdict</th></tr></thead><tbody>' +
        chapterRows + '</tbody></table>' +
        '<div class="pc-h">Topics, worst first</div>' +
        '<table class="pc-criteria"><thead><tr><th>Topic</th><th>Questions</th>' +
        '<th>Score</th><th>Marks lost</th><th>Verdict</th></tr></thead><tbody>' +
        topicRows + '</tbody></table>' +
        '<div class="pc-h">By question type</div>' +
        '<table class="pc-criteria"><thead><tr><th>Type</th><th>Questions</th>' +
        '<th>Score</th><th>Verdict</th></tr></thead><tbody>' + typeRows + '</tbody></table>' +
        '<p class="pc-note">Verdicts are made on chapters because this bank files ' +
        'one generated question per topic: one answer cannot decide a topic. So ' +
        report.insufficient.length + ' chapter(s) and ' + report.insufficientTopics +
        ' topic(s) still read "Not enough evidence" instead of weak - which is the ' +
        'truth, not a gap in the report.</p>' +
        '<div class="pc-h">Where the marks went</div>' +
        '<table class="pc-criteria"><thead><tr><th>What happened</th><th>Marks lost</th>' +
        '<th>Times</th><th>What to do</th></tr></thead><tbody>' + errRows + '</tbody></table>' +
        '<div class="pc-h">What to do next</div>' + recHtml +
        '<div class="pc-actions"><button type="button" class="pc-btn" id="pc-back">Back</button></div>');

    const panel = document.querySelector('.pc-panel');
    panel.querySelector('#pc-back').addEventListener('click', practiceCentreRenderSetup);
    Array.prototype.forEach.call(panel.querySelectorAll('[data-pc-rec]'), function (btn) {
        btn.addEventListener('click', function () {
            const act = btn.getAttribute('data-pc-rec');
            const id = btn.getAttribute('data-pc-id');
            if (act === 'topic') {
                // Out of the overlay first: the topic modal sits below it.
                practiceCentreClose();
                if (typeof openTopicModal === 'function') openTopicModal(id);
            } else if (act === 'type') {
                practiceCentreStartSession({
                    kind: 'GENERATED_PRACTICE', type: id, count: 5
                });
            } else if (act === 'paper') {
                practiceCentreRenderPaperOverview(id);
            } else if (act === 'more') {
                const done = {};
                sessions.forEach(function (s) {
                    (s.results || []).forEach(function (r) { done[r.questionId] = 1; });
                });
                const chapIndex = practiceChapterIndex();
                const qs = (bank.all || []).filter(function (q) {
                    const ch = q.topicId ? chapIndex[q.topicId] : null;
                    return ch && ch.key === id && !done[q.id]
                        && q.kind === 'GENERATED_PRACTICE';
                });
                if (!qs.length) {
                    practiceCentrePanel(practiceCentreHeader('Nothing left to answer') +
                        '<p class="pc-note">Every practice question in that chapter has ' +
                        'been answered already. Revise it from the study text, then come ' +
                        'back and take it again.</p>' +
                        '<div class="pc-actions"><button type="button" class="pc-btn" ' +
                        'id="pc-back">Back</button></div>');
                    document.querySelector('.pc-panel').querySelector('#pc-back')
                        .addEventListener('click', practiceCentreRenderWeakness);
                    return;
                }
                practiceCentreStartSession({
                    kind: 'GENERATED_PRACTICE',
                    questions: qs.slice(0, 5),
                    subjectId: qs[0].subjectId
                });
            }
        });
    });
}

/* ------------------------------------------------------- analytics screen
 * Phase 16. Every number comes from `practiceAnalyticsReport`; this only
 * renders it. The screen reports what has happened - volume, reach, mix,
 * direction - and never what will happen: there is no projection here, and
 * where the history cannot support a statement the empty wording is printed
 * instead of a guess. */
function practiceCentreRenderAnalytics() {
    const bank = practiceIndexBank();
    const report = practiceAnalyticsReport(practiceCentreLoadSessions(), bank);

    function subjectName(id) {
        const s = practiceCentreSubjectFor(id);
        return s ? s.label : id;
    }
    function bar(pct) {
        const w = Math.max(0, Math.min(100, Number(pct) || 0));
        return '<span class="pc-bar"><span style="width:' + w + '%"></span></span>';
    }
    function back() {
        return '<div class="pc-actions"><button type="button" class="pc-btn" id="pc-back">' +
            'Back</button></div>';
    }

    if (!report.attempted) {
        practiceCentrePanel(practiceCentreHeader('Progress &amp; analytics') +
            '<p class="pc-note">Nothing has been marked yet, so there is nothing to ' +
            'report. This screen will show how much of the bank you have reached, where ' +
            'your marks came from and how your scores are moving - once there are scores.</p>' +
            back());
        document.querySelector('.pc-panel').querySelector('#pc-back')
            .addEventListener('click', practiceCentreRenderSetup);
        return;
    }

    /* ---- direction ------------------------------------------------------ */
    let trendHtml;
    if (!report.trend.enough) {
        trendHtml = '<p class="pc-note">Fewer than two finished sittings carry marks, ' +
            'so no direction can honestly be stated yet. Two is the minimum, and even ' +
            'then a movement of under ' + PRACTICE_ANALYTICS_FLAT_POINTS +
            ' points is reported below as no clear change.</p>';
    } else {
        const words = { UP: 'moving up', DOWN: 'slipping', FLAT: 'showing no clear change' };
        trendHtml = '<p class="pc-note">Your more recent sittings average ' +
            report.trend.secondHalf + '% against ' + report.trend.firstHalf +
            '% for your earlier ones - ' + report.trend.delta + ' points, which is ' +
            (words[report.trend.direction] || 'not stated') + '. ' +
            'Movements under ' + PRACTICE_ANALYTICS_FLAT_POINTS +
            ' points are reported as no clear change rather than as progress.</p>';
        if (report.trend.best && report.trend.worst) {
            trendHtml += '<p class="pc-note">Best sitting: ' +
                practiceCentreEscape(String(report.trend.best.date || '').slice(0, 10)) +
                ' at ' + report.trend.best.percent + '%. Weakest: ' +
                practiceCentreEscape(String(report.trend.worst.date || '').slice(0, 10)) +
                ' at ' + report.trend.worst.percent + '%.</p>';
        }
    }
    const trendRows = report.trend.points.slice(-12).map(function (p) {
        return '<tr><td>' + practiceCentreEscape(String(p.date || 'undated').slice(0, 10)) +
            '</td><td>' + practiceCentreEscape((p.label || '').slice(0, 46)) + '</td>' +
            '<td class="pc-num">' + p.questions + '</td>' +
            '<td class="pc-num">' + p.awarded + '/' + p.marks + '</td>' +
            '<td class="pc-num">' + p.percent + '%</td><td>' + bar(p.percent) + '</td></tr>';
    }).join('');

    /* ---- coverage ------------------------------------------------------- */
    const covRows = report.coverage.subjects.map(function (s) {
        return '<tr><td>' + practiceCentreEscape(subjectName(s.subjectId)) + '</td>' +
            '<td class="pc-num">' + s.reached + '</td>' +
            '<td class="pc-num">' + s.available + '</td>' +
            '<td class="pc-num">' + s.percent + '%</td><td>' + bar(s.percent) + '</td></tr>';
    }).join('');
    const untouched = report.coverage.untouchedSubjects.length
        ? '<p class="pc-note">Not opened at all yet: ' +
          practiceCentreEscape(report.coverage.untouchedSubjects.map(subjectName).join(', ')) +
          '.</p>'
        : '<p class="pc-note">Every subject has been opened at least once.</p>';

    /* ---- mix ------------------------------------------------------------ */
    const srcRows = report.bySource.map(function (m) {
        return '<tr><td>' + practiceCentreEscape(String(m.id).toLowerCase()) + '</td>' +
            '<td class="pc-num">' + m.count + '</td>' +
            '<td class="pc-num">' + m.awarded + '/' + m.possible + '</td>' +
            '<td class="pc-num">' + m.percent + '%</td></tr>';
    }).join('');
    const diffRows = report.byDifficulty.map(function (m) {
        return '<tr><td>' + practiceCentreEscape(String(m.id).toLowerCase()) + '</td>' +
            '<td class="pc-num">' + m.count + '</td>' +
            '<td class="pc-num">' + m.percent + '%</td></tr>';
    }).join('');

    /* ---- time ----------------------------------------------------------- */
    let timeHtml;
    if (report.time.measured) {
        timeHtml = '<p class="pc-note">' + report.time.avgPerSession +
            ' minutes a sitting on average, ' + report.time.avgPerQuestion +
            ' minutes a question, over ' + report.time.measured + ' sitting(s).</p>';
    } else {
        timeHtml = '<p class="pc-note">No usable timing data yet.</p>';
    }
    if (report.time.ignored || report.time.unmeasured) {
        timeHtml += '<p class="pc-note">' + report.time.ignored +
            ' sitting(s) had a clock that could not be trusted and ' +
            report.time.unmeasured + ' had no timestamps at all; both were left out ' +
            'of these averages instead of being averaged in.</p>';
    }

    practiceCentrePanel(practiceCentreHeader('Progress &amp; analytics') +
        '<div class="pc-score"><div class="pc-score-num">' + report.awarded +
        '<span>/' + report.possible + '</span></div>' +
        '<div class="pc-score-pct">' + report.percent + '%</div></div>' +
        '<p class="pc-note">' + report.sessions + ' session(s), ' + report.attempted +
        ' question(s), ' + report.daysActive + ' day(s) of practice' +
        (report.lastActivity ? ', last on ' +
            practiceCentreEscape(String(report.lastActivity).slice(0, 10)) : '') +
        '. History covers your last ' + report.historyLimit + ' sessions.</p>' +

        '<div class="pc-h">Direction</div>' + trendHtml +
        '<table class="pc-criteria"><thead><tr><th>Date</th><th>Sitting</th>' +
        '<th>Questions</th><th>Marks</th><th>Score</th><th></th></tr></thead><tbody>' +
        trendRows + '</tbody></table>' +

        '<div class="pc-h">Coverage of the question bank</div>' +
        '<p class="pc-note">' + report.coverage.reached + ' of ' +
        report.coverage.total + ' questions reached (' + report.coverage.percent +
        '%), across ' + report.coverage.chaptersReached + ' of ' +
        report.coverage.chaptersTotal + ' chapters.</p>' +
        '<table class="pc-criteria"><thead><tr><th>Subject</th><th>Reached</th>' +
        '<th>Available</th><th>Covered</th><th></th></tr></thead><tbody>' +
        covRows + '</tbody></table>' + untouched +

        '<div class="pc-h">Where the marks came from</div>' +
        '<table class="pc-criteria"><thead><tr><th>Source</th><th>Questions</th>' +
        '<th>Marks</th><th>Score</th></tr></thead><tbody>' + srcRows + '</tbody></table>' +
        '<table class="pc-criteria"><thead><tr><th>Difficulty</th><th>Questions</th>' +
        '<th>Score</th></tr></thead><tbody>' + diffRows + '</tbody></table>' +
        '<p class="pc-note">Difficulty is set on generated questions; official ' +
        'past-paper questions carry none of their own and so read "unset". Read the ' +
        'two together: a score that holds across ICAP material and practice material ' +
        'alike means more than either alone.</p>' +

        '<div class="pc-h">Objective against written</div>' +
        '<table class="pc-criteria"><thead><tr><th>Kind</th><th>Questions</th>' +
        '<th>Marks</th><th>Score</th></tr></thead><tbody>' +
        '<tr><td>objective</td><td class="pc-num">' + report.objective.count +
        '</td><td class="pc-num">' + report.objective.awarded + '/' +
        report.objective.possible + '</td><td class="pc-num">' +
        report.objective.percent + '%</td></tr>' +
        '<tr><td>written</td><td class="pc-num">' + report.written.count +
        '</td><td class="pc-num">' + report.written.awarded + '/' +
        report.written.possible + '</td><td class="pc-num">' +
        report.written.percent + '%</td></tr>' +
        '</tbody></table>' +
        '<p class="pc-note">These two are not comparable and are never ranked ' +
        'against each other: objective items are marked on the examiner\'s own ' +
        'letters with no partial credit, so a lower rate there is a different ' +
        'measurement, not a worse one.</p>' +

        '<div class="pc-h">Data quality</div>' +
        '<p class="pc-note">' + report.unreadable + ' answer(s) (' +
        report.unreadableRate + '%) could not be read and scored zero; ' +
        report.transcribed + ' answer(s) were transcribed and ' + report.typed +
        ' were typed by hand, with ' + report.lowConfidence +
        ' read below the confidence floor. Typed answers are counted as evidence ' +
        'all the same - this split records where the text came from, not how good it is.</p>' +

        '<div class="pc-h">Time</div>' + timeHtml +
        back());

    document.querySelector('.pc-panel').querySelector('#pc-back')
        .addEventListener('click', practiceCentreRenderSetup);
}

/* ------------------------------------------------------- content review
 * Phase 17. Everything shown here comes from either the build-time register
 * (`REVIEW_REGISTER`, produced by build_review_register.py against the same
 * sources the bank came from) or `practiceReviewReport()`, which re-runs what
 * it can over the bank as loaded in this page. The two are shown side by side
 * so an approval decision is made against both what was built and what a
 * candidate actually sits. A static page has no server and no roles: this
 * screen says so, and exports its decisions as a file the school keeps. */
function practiceCentreRenderReview() {
    const bank = practiceIndexBank();
    const profile = (typeof getProfile === 'function') ? getProfile() : null;
    const registry = (typeof REVIEW_REGISTER !== 'undefined') ? REVIEW_REGISTER : null;
    const report = (typeof practiceReviewReport === 'function')
        ? practiceReviewReport(bank, registry) : null;

    function esc(s) {
        return practiceCentreEscape(String(s === null || s === undefined ? '' : s));
    }
    function back() {
        return '<div class="pc-actions"><button type="button" class="pc-btn" id="pc-back">' +
            'Back</button></div>';
    }
    function tableHtml(head, rows) {
        return '<table class="pc-criteria"><thead><tr>' + head +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }
    function th(t) { return '<th>' + t + '</th>'; }

    if (!report || !registry) {
        practiceCentrePanel(practiceCentreHeader('Content review &amp; approval') +
            '<p class="pc-note">The review report or the build-time register is ' +
            'missing from this build, so there is nothing to review here. That is ' +
            'a build problem, not a content problem.</p>' + back());
        document.querySelector('.pc-panel').querySelector('#pc-back')
            .addEventListener('click', practiceCentreRenderSetup);
        return;
    }

    const digest = String(report.digest || 'unknown');
    const reviewer = (profile && (profile.name || profile.email)) || 'Signed-in user';
    const reviewerLine = (profile && profile.email)
        ? reviewer + ' (' + profile.email + ')' : reviewer;
    const REVIEW_KEY = 'pc_review';
    let decisions = [];
    try {
        const raw = localStorage.getItem(REVIEW_KEY);
        decisions = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(decisions)) decisions = [];
    } catch (e) { decisions = []; }

    const current = decisions
        .filter(function (d) { return String(d.digest) === digest; })
        .sort(function (a, b) {
            return String(b.at || '').localeCompare(String(a.at || ''));
        })[0] || null;
    let statusHtml = '<p class="pc-note">Sign-off for this content state: <span class="' +
        (current ? (current.decision === 'APPROVED' ? 'pc-status-ok'
            : (current.decision === 'REJECTED' ? 'pc-status-fail' : 'pc-status-note'))
            : 'pc-status-note') + '">' + esc(current ? current.decision : 'NOT REVIEWED') +
        '</span>' + (current
            ? ' by ' + esc(current.reviewer) + ' on ' +
              esc(String(current.at || '').slice(0, 16))
            : '') + '.</p>';
    if (current && current.note) {
        statusHtml += '<p class="pc-note">Note: ' + esc(current.note) + '</p>';
    }
    if (!current) {
        statusHtml += '<p class="pc-note">No decision has been recorded for this ' +
            'digest. Nothing here blocks a candidate either way - this record is ' +
            'the school\'s own check that content was reviewed before it was ' +
            'relied on.</p>';
    }

    const c = report.counts || {};
    const digestLine = '<p class="pc-note">' + c.questions + ' questions in this ' +
        'build (' + c.generated + ' generated, ' + c.official + ' official ' +
        'past-paper, ' + c.paperQuestions + ' in generated papers across ' +
        c.papers + ' papers), ' + c.subjects + ' subjects, ' + c.chapters +
        ' chapters. Register built at ' + esc(report.builtAt || registry.builtAt) +
        '; content digest ' + esc(digest) + '.</p>';

    const liveRows = report.checks.map(function (chk) {
        const cls = chk.status === 'PASS' ? 'pc-status-ok' : 'pc-status-fail';
        return '<tr><td>' + esc(chk.name) + '</td>' +
            '<td><div class="pc-sub">' + esc(chk.purpose) + '</div></td>' +
            '<td class="pc-num">' + chk.checked + '</td>' +
            '<td class="pc-num">' + chk.failed + '</td>' +
            '<td><span class="' + cls + '">' + esc(chk.status) + '</span></td></tr>';
    }).join('');
    const failing = report.checks.filter(function (chk) { return chk.failed > 0; });
    let failingHtml = '';
    if (failing.length) {
        failingHtml = '<div class="pc-h">Items behind a failing check</div>' +
            failing.map(function (chk) {
                return '<p class="pc-note"><strong>' + esc(chk.name) + '</strong>: ' +
                    chk.failures.map(function (f) {
                        return esc(f.id) + (f.why ? ' - ' + esc(f.why) : '');
                    }).join('; ') + '.</p>';
            }).join('');
    }

    const regRows = registry.checks.map(function (chk) {
        const enforced = chk.group === 'ENFORCED';
        const cls = enforced ? (chk.ok ? 'pc-status-ok' : 'pc-status-fail')
            : 'pc-status-note';
        const statusText = enforced ? (chk.ok ? 'PASS' : 'FAIL') : 'reported';
        const measured = (typeof chk.measured === 'object' && chk.measured !== null)
            ? JSON.stringify(chk.measured) : String(chk.measured);
        return '<tr><td>' + esc(chk.name) + '</td>' +
            '<td><div class="pc-sub">' + esc(chk.purpose) + '</div>' +
            esc(chk.source) + '</td>' +
            '<td class="pc-num">' + esc(measured) + '</td>' +
            '<td><span class="' + cls + '">' + statusText + '</span></td></tr>';
    }).join('');
    const regDetails = registry.checks.filter(function (chk) {
        return chk.group === 'REPORTED' && chk.detail;
    }).map(function (chk) {
        const d = (typeof chk.detail === 'string') ? chk.detail
            : JSON.stringify(chk.detail);
        return '<p class="pc-note"><strong>' + esc(chk.name) + '</strong>: ' +
            esc(d) + '</p>';
    }).join('');

    const watchHtml = report.watch.map(function (w) {
        return '<p class="pc-note"><strong>' + esc(w.id) + '</strong>: ' +
            w.count + ' - ' + esc(w.why) + '</p>';
    }).join('');

    const driftRows = report.drift.map(function (d) {
        return '<tr><td>' + esc(d.label) + '</td>' +
            '<td class="pc-num">' + esc(d.registered) + '</td>' +
            '<td class="pc-num">' + esc(d.live) + '</td>' +
            '<td>' + (d.matches
                ? '<span class="pc-status-ok">same</span>'
                : '<span class="pc-status-fail">drifted</span>') + '</td></tr>';
    }).join('');

    const limitsHtml = (registry.limits || []).map(function (l) {
        return '<p class="pc-note"><strong>' + esc(l.what) + '</strong>: ' +
            esc(l.detail) + '</p>';
    }).join('');

    const histRows = decisions.slice(0, 20).map(function (d) {
        return '<tr><td>' + esc(String(d.at || '').slice(0, 16)) + '</td>' +
            '<td>' + esc(d.decision) + '</td>' +
            '<td>' + esc(d.reviewer) + '</td>' +
            '<td>' + esc(String(d.digest || '').slice(0, 24)) + '</td>' +
            '<td>' + esc(d.note || '') + '</td></tr>';
    }).join('');
    const histHtml = (decisions.length
        ? '<div class="pc-h">Decision history (this browser)</div>' +
          tableHtml(th('Date') + th('Decision') + th('Reviewer') + th('Digest') +
              th('Note'), histRows)
        : '');

    const signOff = '<div class="pc-h">Sign-off</div>' + statusHtml +
        '<p class="pc-note"><input type="text" id="pc-review-note" class="pc-input" ' +
        'maxlength="200" placeholder="Decision note (optional)"> ' +
        '<button type="button" class="pc-btn pc-btn-primary" id="pc-approve">' +
        'Approve</button> ' +
        '<button type="button" class="pc-btn" id="pc-changes">Request changes</button> ' +
        '<button type="button" class="pc-btn" id="pc-reject">Reject</button> ' +
        '<button type="button" class="pc-btn" id="pc-export">Export record (JSON)</button>' +
        '</p>' +
        '<p class="pc-note">Decisions are cached in this browser as a convenience ' +
        'and are included in the exported file. The file - with its content ' +
        'digest - is the record; a static page cannot vault it, enforce a role ' +
        'or timestamp it the way a server can.</p>';

    practiceCentrePanel(practiceCentreHeader('Content review &amp; approval') +
        '<p class="pc-note">Reviewer: <strong>' + esc(reviewerLine) + '</strong>. ' +
        'This is the school\'s own content check: what the build pipeline ' +
        'verified when the bank was built, re-checked over the bank a candidate ' +
        'actually sits. It is not a server and claims no role enforcement or ' +
        'central storage.</p>' +
        digestLine +
        '<div class="pc-h">Re-checked live, in this page</div>' +
        '<p class="pc-note">' + report.checks.length + ' checks re-run now over the ' +
        'loaded bank - the half of the register the browser can still prove. A ' +
        'check that passes now but failed at build time (or the reverse) means ' +
        'the page and the register drifted apart.</p>' +
        tableHtml(th('Check') + th('What it verifies') + th('Counted over') +
            th('Failed') + th('Status'), liveRows) +
        failingHtml +
        '<div class="pc-h">What the pipeline recorded at build time</div>' +
        '<p class="pc-note">' + registry.checks.length + ' checks ran in ' +
        'build_review_register.py over the same sources the bank came from. ' +
        'ENFORCED checks fail the build when wrong; REPORTED checks are measured ' +
        'and shown, not corrected, because the corpus itself cannot be remade ' +
        'inside the pipeline.</p>' +
        tableHtml(th('Check') + th('What it verified') + th('Measured') +
            th('Status'), regRows) +
        regDetails +
        '<div class="pc-h">Watch items</div>' +
        '<p class="pc-note">Not pass/fail: things the checks cannot fully decide, ' +
        'watched because a future corpus change could turn them into defects.</p>' +
        watchHtml +
        '<div class="pc-h">Register against the loaded bank</div>' +
        '<p class="pc-note">The same quantities as measured at build time and now. ' +
        'A mismatch here means the bank in this page is not the bank the register ' +
        'was built for.</p>' +
        tableHtml(th('Quantity') + th('At build') + th('Now') + th(''),
            driftRows) +
        '<div class="pc-h">What this build cannot do</div>' + limitsHtml +
        signOff + histHtml + back());

    const panelEl = document.querySelector('.pc-panel');
    panelEl.querySelector('#pc-back').addEventListener('click', practiceCentreRenderSetup);
    const noteInput = panelEl.querySelector('#pc-review-note');
    function record(decision) {
        return function () {
            const note = (noteInput && noteInput.value) ? noteInput.value.trim() : '';
            const entry = {
                decisionId: 'pc-d-' + Date.now() + '-' +
                    Math.floor(Math.random() * 1000),
                at: new Date().toISOString(),
                reviewer: reviewerLine,
                digest: digest,
                builtAt: report.builtAt || registry.builtAt || '',
                decision: decision,
                note: note.slice(0, 200)
            };
            decisions.unshift(entry);
            decisions = decisions.slice(0, 20);
            try {
                localStorage.setItem(REVIEW_KEY, JSON.stringify(decisions));
            } catch (e) { /* storage disabled - decision stands for this visit */ }
            practiceCentreRenderReview();
        };
    }
    const approveBtn = panelEl.querySelector('#pc-approve');
    if (approveBtn) approveBtn.addEventListener('click', record('APPROVED'));
    const changesBtn = panelEl.querySelector('#pc-changes');
    if (changesBtn) changesBtn.addEventListener('click', record('CHANGES_REQUESTED'));
    const rejectBtn = panelEl.querySelector('#pc-reject');
    if (rejectBtn) rejectBtn.addEventListener('click', record('REJECTED'));
    const exportBtn = panelEl.querySelector('#pc-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            const payload = {
                exportedAt: new Date().toISOString(),
                reviewer: reviewerLine,
                digest: digest,
                sheet: 'CAF Practice Centre content review record',
                counts: c,
                checks: registry.checks,
                liveReport: {
                    checks: report.checks,
                    watch: report.watch,
                    drift: report.drift
                },
                decisions: decisions
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)],
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'content-review-' +
                String(digest).replace(/[^a-z0-9@.+_-]/gi, '_') + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
}

/* Persist finished sessions locally so the mistake book has history. This is a
 * convenience cache only - it is not the source of truth, and nothing about the
 * marking depends on it. */
function practiceCentrePersistSession(session) {
    try {
        const raw = localStorage.getItem('pc_sessions');
        const all = raw ? JSON.parse(raw) : [];
        all.push(session);
        localStorage.setItem('pc_sessions', JSON.stringify(all.slice(-50)));
    } catch (e) { /* storage disabled - the session still works in memory */ }
}

document.addEventListener('DOMContentLoaded', function () {
    initPracticeCentre();
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && PRACTICE_CENTRE.overlayOpen) practiceCentreClose();
    });
});

/* ==== end of CAF Practice Centre UI fragment ==== */

/* ============================ Quick Revision & Formula Bank ============================
 * Built entirely from mmDataStore, so every formula, exam tip and rule shown
 * here is lifted from the ICAP study-text PDFs.
 * ==================================================================================== */

const RV_FILTERS = [
    { id: 'all', label: 'Everything' },
    { id: 'formula', label: 'Formulas & Rules' },
    { id: 'tips', label: 'Exam Tips' }
];

const revisionState = {
    subjectId: 'prc1',
    chapterId: '__all__',
    filter: 'all'
};

const RV_ICON_WARN =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;">' +
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

const RV_ICON_FUNC =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;">' +
    '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>' +
    '<line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';

const RV_ICON_BOOK =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;">' +
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

/* a chapter counts as "revisable" when it carries at least one formula or exam tip */
function rvChapterScore(ch) {
    let rules = 0;
    let tips = 0;
    (ch.topics || []).forEach(function (t) {
        if (rvHasRule(t)) rules++;
        if (t.examTip) tips++;
    });
    return { rules: rules, tips: tips, total: (ch.topics || []).length };
}

function rvSubjectScore(subjectId) {
    const chapters = mmDataStore[subjectId] || [];
    let rules = 0;
    let tips = 0;
    chapters.forEach(function (ch) {
        const s = rvChapterScore(ch);
        rules += s.rules;
        tips += s.tips;
    });
    return { chapters: chapters.length, rules: rules, tips: tips };
}

/* Kinds whose substance *is* the rule. The law and audit books carry no
 * arithmetic at all, so a "Formulas & Rules" filter that only looked at
 * t.formula would be permanently empty in 8 of the 13 books. */
const RV_RULE_KINDS = {
    legal: 1, procedure: 1, auditproc: 1, disclosure: 1,
    recognition: 1, comparison: 1, tax: 1
};

function rvHasRule(t) {
    return !!(t.formula || RV_RULE_KINDS[t.kind]);
}

/* the topics that survive the current filter, for the current scope.
 * If the filter matches nothing -- a law chapter has no arithmetic, a
 * definition chapter has no exam tip of its own -- fall back to the whole
 * scope rather than showing an empty bank. revisionState.fellBack records
 * it so the UI can say why. */
function rvTopics() {
    const chapters = mmDataStore[revisionState.subjectId] || [];
    const scope = revisionState.chapterId === '__all__'
        ? chapters
        : chapters.filter(function (c) { return c.id === revisionState.chapterId; });

    function collect(pred) {
        const out = [];
        scope.forEach(function (ch) {
            (ch.topics || []).forEach(function (t) {
                if (pred(t)) out.push({ chapter: ch, topic: t });
            });
        });
        return out;
    }

    const every = collect(function () { return true; });
    if (revisionState.filter === 'all') {
        revisionState.fellBack = false;
        return every;
    }

    const hit = collect(revisionState.filter === 'formula'
        ? rvHasRule
        : function (t) { return !!t.examTip; });

    revisionState.fellBack = hit.length === 0 && every.length > 0;
    return hit.length ? hit : every;
}

/* ---------------------------------------------------------------- subject tabs */
function renderRevisionSubjectTabs() {
    const container = document.getElementById('revision-subject-tabs');
    if (!container) return;

    container.innerHTML = mmSubjectsList.map(function (s) {
        const score = rvSubjectScore(s.id);
        const isActive = s.id === revisionState.subjectId;
        const rgb = hexToRgb(s.color);
        const style = isActive
            ? 'background:rgba(' + rgb + ',0.18); color:' + s.color +
              '; border-color:' + s.color + ';'
            : '';
        return '<button class="mm-subj-btn' + (isActive ? ' active' : '') + '"' +
            ' style="' + style + '"' +
            ' onclick="selectRevisionSubject(\'' + s.id + '\')">' +
            '<span style="display:inline-flex; align-items:center; justify-content:center;">' + s.icon + '</span>' +
            '<span>' + mmEsc(s.code) + ' &middot; ' + mmEsc(s.shortName) + '</span>' +
            '<span class="mm-ch-count">' + score.rules + 'R</span>' +
            '</button>';
    }).join('');

    const badge = document.getElementById('revision-subject-badge');
    if (badge) {
        const active = mmSubjectsList.find(function (s) { return s.id === revisionState.subjectId; });
        const score = rvSubjectScore(revisionState.subjectId);
        badge.textContent = (active ? active.code : '') + ' &bull; ' +
            score.rules + ' rules &bull; ' + score.tips + ' exam tips';
    }
}

/* -------------------------------------------------------------- chapter sidebar */
function renderRevisionChapterSidebar() {
    const container = document.getElementById('revision-chapter-sidebar');
    if (!container) return;
    const chapters = mmDataStore[revisionState.subjectId] || [];

    let html = '';
    const allScore = rvSubjectScore(revisionState.subjectId);
    html += '<button class="mm-ch-item' + (revisionState.chapterId === '__all__' ? ' active' : '') + '"' +
        ' onclick="selectRevisionChapter(\'__all__\')" title="Every chapter in this book">' +
        '<span class="mm-ch-num">ALL</span>' +
        '<span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Whole Book</span>' +
        '<span class="mm-ch-count">' + allScore.rules + '</span>' +
        '</button>';

    chapters.forEach(function (ch) {
        const score = rvChapterScore(ch);
        const isActive = ch.id === revisionState.chapterId;
        html += '<button class="mm-ch-item' + (isActive ? ' active' : '') + '"' +
            ' onclick="selectRevisionChapter(\'' + ch.id + '\')"' +
            ' title="' + mmEsc(ch.title) + ' &mdash; ' + score.rules + ' rules, ' + score.tips + ' tips">' +
            '<span class="mm-ch-num">Ch.' + mmEsc(String(ch.chapterNumber)) + '</span>' +
            '<span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
            mmEsc(ch.title) + '</span>' +
            '<span class="mm-ch-count">' + (score.rules || score.tips) + '</span>' +
            '</button>';
    });

    container.innerHTML = html;
}

/* --------------------------------------------------------------------- content */
function renderRevisionContent() {
    const container = document.getElementById('revision-content');
    if (!container) return;

    const subject = mmSubjectsList.find(function (s) { return s.id === revisionState.subjectId; })
        || mmSubjectsList[0];
    const chapters = mmDataStore[revisionState.subjectId] || [];
    const chapter = chapters.find(function (c) { return c.id === revisionState.chapterId; });
    const color = subject.color;
    const rgb = hexToRgb(color);
    const rows = rvTopics();

    let html = '';

    /* filter tabs */
    html += '<div class="rv-filters">';
    RV_FILTERS.forEach(function (f) {
        const isActive = f.id === revisionState.filter;
        html += '<button class="rv-filter-btn' + (isActive ? ' active' : '') + '"' +
            ' style="' + (isActive
                ? 'background:rgba(' + rgb + ',0.18); color:' + color + '; border-color:' + color + ';'
                : '') + '"' +
            ' onclick="setRevisionFilter(\'' + f.id + '\')">' + mmEsc(f.label) + '</button>';
    });
    html += '<span class="rv-count">' + rows.length + ' item' + (rows.length === 1 ? '' : 's') + '</span>';
    html += '</div>';

    if (revisionState.fellBack) {
        html += '<div class="rv-notice">' + RV_ICON_WARN + 'Is chapter mein ' +
            mmEsc((RV_FILTERS.find(function (f) { return f.id === revisionState.filter; }) || {}).label || 'is filter') +
            ' ke liye koi alag item nahi hai, is liye poore chapter ke concepts dikhaye gaye hain.</div>';
    }

    if (!rows.length) {
        html += '<div class="rv-empty">Is chapter ke liye koi ' +
            mmEsc((RV_FILTERS.find(function (f) { return f.id === revisionState.filter; }) || {}).label || 'item') +
            ' nahi mila. Doosra filter try karein ya Mind Maps se detail padhein.</div>';
        container.innerHTML = html;
        return;
    }

    /* header */
    html += '<div class="rv-header" style="border-color:' + color + '">';
    html += '<div class="rv-header-icon" style="background:rgba(' + rgb + ',0.2); color:' + color + ';">' +
        subject.icon + '</div>';
    html += '<div>';
    html += '<div class="rv-header-kicker">Quick Revision</div>';
    html += '<h2 class="rv-header-title">' +
        mmEsc(chapter ? 'Ch. ' + chapter.chapterNumber + ' &mdash; ' + chapter.title : subject.title) + '</h2>';
    html += '<div class="rv-header-sub">' + mmEsc(subject.code) + ' &bull; ' +
        mmEsc(subject.name) + ' &bull; ' + rows.length + ' revision item' +
        (rows.length === 1 ? '' : 's') + ' &bull; ICAP study text</div>';
    html += '</div></div>';

    /* one compact card per topic */
    html += '<div class="rv-list">';
    rows.forEach(function (row, i) {
        const t = row.topic;
        html += '<div class="rv-card" style="border-left-color:' + color + ';">';

        html += '<div class="rv-card-head">';
        html += '<span class="rv-idx">' + mmEsc(String(t.num || (i + 1))) + '</span>';
        html += '<span class="rv-card-title">' + mmEsc(t.title) + '</span>';
        if (t.kind && typeof MM_KIND_LABEL !== 'undefined' && MM_KIND_LABEL[t.kind]) {
            html += '<span class="rv-kind">' + mmEsc(MM_KIND_LABEL[t.kind]) + '</span>';
        }
        if (t.studyPage) {
            html += '<button class="rv-page-btn" type="button"' +
                ' onclick="openPrcChapterDeep(STUDY_BOOK_MAP[revisionBookKey()].file, ' +
                mmEsc(String(t.studyPage)) + ', \'' + mmEsc(subject.code) + '\')">' +
                RV_ICON_BOOK + 'p.' + mmEsc(String(t.studyPage)) + '</button>';
        }
        html += '</div>';

        if (t.formula) {
            html += '<div class="mm-formula-box"><strong>' + RV_ICON_FUNC + 'Formula / Rule:</strong> ' +
                mmEsc(t.formula) + '</div>';
        }
        if (t.examTip) {
            html += '<div class="mm-exam-tip"><strong>' + RV_ICON_WARN + 'ICAP Exam Tip:</strong> ' +
                mmEsc(t.examTip) + '</div>';
        }
        if (Array.isArray(t.keyPoints) && t.keyPoints.length) {
            html += '<ul class="rv-points">';
            t.keyPoints.slice(0, 2).forEach(function (k) {
                html += '<li>' + mmEsc(k.length > 190 ? (k.slice(0, 190) + '...') : k) + '</li>';
            });
            html += '</ul>';
        }
        if (t.romanUrdu) {
            html += '<div class="rv-roman"><span>Roman Urdu:</span> ' + mmEsc(t.romanUrdu) + '</div>';
        }

        html += '<button class="rv-open-btn" type="button" onclick="openTopicModal(\'' +
            mmEsc(t.id) + '\')">Open full concept</button>';
        html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
}

/* which study-text file backs the current revision subject */
function revisionBookKey() {
    const id = revisionState.subjectId;
    if (STUDY_BOOK_MAP[id]) return id;
    return id;
}

/* -------------------------------------------------------------- interactions */
function selectRevisionSubject(subjectId) {
    if (!mmDataStore[subjectId]) return;
    revisionState.subjectId = subjectId;
    revisionState.chapterId = '__all__';
    renderRevisionSubjectTabs();
    renderRevisionChapterSidebar();
    renderRevisionContent();
}

function selectRevisionChapter(chapterId) {
    revisionState.chapterId = chapterId;
    renderRevisionChapterSidebar();
    renderRevisionContent();
}

function setRevisionFilter(filterId) {
    revisionState.filter = filterId;
    renderRevisionContent();
}

function initRevisionApp() {
    if (!mmDataStore[revisionState.subjectId]) {
        revisionState.subjectId = mmSubjectsList.length ? mmSubjectsList[0].id : 'prc1';
    }
    renderRevisionSubjectTabs();
    renderRevisionChapterSidebar();
    renderRevisionContent();
}

/* ==== end of Quick Revision fragment ==== */
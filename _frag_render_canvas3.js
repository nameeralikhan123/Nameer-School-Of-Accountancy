function renderMMCanvas() {
    const container = document.getElementById('mm-canvas-container');
    if (!container) return;

    const chapters = mmDataStore[currentMMSubjectId] || [];
    const activeSubject = mmSubjectsList.find(s => s.id === currentMMSubjectId) || mmSubjectsList[0];
    const activeChapter = chapters.find(c => c.id === currentMMChapterId) || chapters[0];

    if (!activeChapter || !activeSubject) {
        container.innerHTML = '<div class="mm-empty">No mind map available for this chapter yet.</div>';
        return;
    }

    const color = activeSubject.color;
    const rgb = hexToRgb(color);
    const topicCount = activeChapter.topics.length;
    const plural = topicCount === 1 ? '' : 's';
    const ICON_WARN =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;">' +
        '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
        '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const ICON_ZOOM =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    let html = '';

    /* ---------- toolbar ---------- */
    html += '<div class="mm-toolbar">';
    html += '<span class="badge" style="background:rgba(' + rgb + ',0.2); color:' + color + '; border:1px solid ' + color + ';">';
    html += mmEsc(activeSubject.code) + ' &bull; Chapter ' + mmEsc(String(activeChapter.chapterNumber)) +
            ' &bull; Study Text pp. ' + mmEsc(activeChapter.pages);
    html += '</span>';
    html += '<span class="mm-toolbar-hint">' + topicCount + ' topic' + plural +
            ' &bull; tap any card for the full detail</span>';
    html += '</div>';

    /* ---------- root chapter node ---------- */
    html += '<div class="mm-root-card" style="border-color:' + color + '">';
    html += '<div class="mm-root-icon" style="background:rgba(' + rgb + ',0.2); color:' + color + ';">' + activeSubject.icon + '</div>';
    html += '<div class="mm-root-body">';
    html += '<div class="mm-root-kicker">Core Concept Tree</div>';
    html += '<h2 class="mm-root-title">' + mmEsc(activeChapter.title) + '</h2>';
    html += '<p class="mm-root-sub">' + topicCount + ' topic' + plural +
            ' &mdash; Roman Urdu explanation with ICAP exam focus</p>';
    html += '</div></div>';

    /* ---------- chapter summary / revision notes ---------- */
    const summary = activeChapter.summary || [];
    const revision = activeChapter.revision || [];
    if (summary.length || revision.length) {
        html += '<div class="mm-chapter-notes">';
        if (summary.length) {
            html += '<div class="mm-note-block">';
            html += '<div class="mm-note-head">Chapter Summary &mdash; study text &ldquo;At a Glance&rdquo;</div>';
            html += '<ul>';
            summary.forEach(function (s) { html += '<li>' + mmEsc(s) + '</li>'; });
            html += '</ul></div>';
        }
        if (revision.length) {
            html += '<div class="mm-note-block">';
            html += '<div class="mm-note-head" style="color:var(--gold-500);">Revision Notes &mdash; study text &ldquo;Sticky Notes&rdquo;</div>';
            html += '<ul>';
            revision.forEach(function (s) { html += '<li>' + mmEsc(s) + '</li>'; });
            html += '</ul></div>';
        }
        html += '</div>';
    }

    /* ---------- topic node grid ---------- */
    html += '<div class="mm-nodes-grid">';
    activeChapter.topics.forEach(function (t, idx) {
        html += '<div class="mm-node-card" data-topic="' + mmEsc(t.id) + '" onclick="openTopicModal(\'' + mmEsc(t.id) + '\')">';
        // the badge carries the study-text section number (e.g. "2.1"), not the index
        html += '<div class="mm-node-num">' + mmEsc(String(t.num || (idx + 1))) + '</div>';
        html += '<div class="mm-node-title">' + mmEsc(t.title) + '</div>';

        if (t.kind && typeof MM_KIND_LABEL !== 'undefined' && MM_KIND_LABEL[t.kind]) {
            html += '<div class="mm-kind-badge" style="background:rgba(' + rgb + ',0.14); color:' + color +
                    '; border:1px solid rgba(' + rgb + ',0.4);">' + mmEsc(MM_KIND_LABEL[t.kind]) +
                    (t.studyPage ? ' &middot; p.' + mmEsc(String(t.studyPage)) : '') + '</div>';
        }

        html += '<div class="mm-roman-box">';
        html += '<span class="mm-roman-tag">Roman Urdu</span>';
        html += '<p>' + mmEsc(t.romanUrdu) + '</p>';
        html += '</div>';

        if (t.formula) {
            html += '<div class="mm-formula-box"><strong>Formula / Rule:</strong> ' + mmEsc(t.formula) + '</div>';
        }
        if (Array.isArray(t.keyPoints) && t.keyPoints.length) {
            html += '<div class="mm-keypoints"><strong>From the study text:</strong><ul>';
            t.keyPoints.slice(0, 3).forEach(function (k) {
                html += '<li>' + mmEsc(k.length > 170 ? (k.slice(0, 170) + '...') : k) + '</li>';
            });
            html += '</ul></div>';
        }
        if (t.examTip) {
            html += '<div class="mm-exam-tip"><strong>' + ICON_WARN + 'ICAP Exam Tip:</strong> ' + mmEsc(t.examTip) + '</div>';
        }
        if (Array.isArray(t.subNodes) && t.subNodes.length) {
            html += '<ul class="mm-subnodes">';
            t.subNodes.forEach(function (sn) {
                html += '<li>' + mmEsc(sn) + '</li>';
            });
            html += '</ul>';
        }
        html += '<button class="mm-open-btn" type="button">' + ICON_ZOOM + '<span>Open Concept Details</span></button>';
        html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
}
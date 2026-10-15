/* ---------------- practice-centre state (was never declared) ---------------- */
const practiceDataStore = {};

let currentPracticeSubjectId = 'prc1';
let currentQuizState = null;

/* ---------------- CAF study library (regenerated) ---------------- */
const CAF_TAB_META = {
    caf1: { short: 'FAR', color: '#38bdf8' },
    caf2: { short: 'TAX', color: '#a78bfa' },
    caf3: { short: 'DSR', color: '#22d3ee' },
    caf4v1: { short: 'BLD-I', color: '#f59e0b' },
    caf4v2: { short: 'BLD-II', color: '#fbbf24' },
    caf5: { short: 'CMA', color: '#f472b6' },
    caf6: { short: 'MFA', color: '#fb923c' },
    caf7: { short: 'BIA', color: '#a3e635' },
    caf8: { short: 'AUD', color: '#e879f9' }
};

let currentCafBookId = 'caf1';

function renderCafStudyLibrary() {
    const container = document.getElementById('caf-study-library');
    if (!container) return;

    let totalChapters = 0;
    CAF_BOOKS.forEach(function (b) { totalChapters += b.chapters.length; });

    let html = '';
    html += '<div class="section-title">';
    html += '  <span>CAF Study Texts &amp; Chapter Navigator</span>';
    html += '  <span class="badge badge-gold">Advanced Level &bull; ' + CAF_BOOKS.length +
            ' Volumes &bull; ' + totalChapters + ' Chapters</span>';
    html += '</div>';
    html += '<div class="study-level-tabs" id="caf-study-tabs">';

    CAF_BOOKS.forEach(function (b, i) {
        const shortName = (CAF_TAB_META[b.id] || {}).short || b.code;
        const badgeStyle = 'background:rgba(' + hexToRgb(b.accent) + ',0.2); color:' +
            b.accent + '; border:1px solid ' + b.accent + ';';
        const cls = 'study-level-btn' + (b.id === currentCafBookId || i === 0 ? ' active' : '');
        html += '<button class="' + cls + '" onclick="switchCafBook(\'' + b.id + '\')">';
        html += '  <span>' + mmEsc(b.code) + ' &middot; ' + mmEsc(shortName) + '</span>';
        html += '  <span>' + mmEsc(b.title) + '</span>';
        html += '  <span class="badge" style="' + badgeStyle + '">' + b.chapters.length + ' Chapters</span>';
        html += '</button>';
    });

    html += '</div>';
    html += '<div id="caf-book-content" class="study-level-content active"></div>';

    container.innerHTML = html;

    switchCafBook(currentCafBookId || (CAF_BOOKS[0] && CAF_BOOKS[0].id));
}

function switchCafBook(bookId) {
    document.querySelectorAll('#caf-study-tabs .study-level-btn').forEach(function (btn) {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector('#caf-study-tabs button[onclick*="' + bookId + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    const container = document.getElementById('caf-book-content');
    if (!container) return;

    const book = CAF_BOOKS.find(function (b) { return b.id === bookId; });
    if (!book) return;
    currentCafBookId = bookId;

    let html = '';
    html += '<div class="caf-book-header" style="background:' + book.accent +
            '; padding:20px; border-radius:12px 12px 0 0; color:white;">';
    html += '  <h3 style="margin:0 0 8px 0;">' + mmEsc(book.code) + ' &ndash; ' +
            mmEsc(book.title) + '</h3>';
    html += '  <p style="margin:0; opacity:0.9;">' + book.chapters.length +
            ' chapters &bull; ' + book.pdfPages + ' pages &bull; ICAP study text</p>';
    html += '</div>';
    html += '<div class="caf-chapters-list">';

    book.chapters.forEach(function (c, ci) {
        html += '<div class="caf-chapter-item" onclick="openCafChapter(\'' + bookId + '\',' + ci + ')">';
        html += '  <span class="caf-chapter-num">Ch ' + c.n + '</span>';
        html += '  <span class="caf-chapter-title">' + mmEsc(c.t) + '</span>';
        html += '  <span class="caf-chapter-pages">p.' + c.p + '</span>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}
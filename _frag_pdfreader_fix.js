/* ---------------- PDF reader: totals + history seeding ---------------- */
function openPdfReader(file, title, printedPage, opts) {
    if (!file) return;
    opts = opts || {};

    pdfState.file = file;
    pdfState.title = title || file;
    pdfState.total = opts.pdfPages || 0;
    pdfState.chapters = opts.chapters || [];
    pdfState.offset = opts.offset == null ? 5 : opts.offset;
    pdfState.zoom = 0;
    pdfState.open = true;

    const startPage = Math.max(1, parseInt(printedPage, 10) || 1);

    // seed the view history so the first "Back" returns to where we opened
    pdfState.history = [startPage];
    pdfState.hIndex = 0;

    const modal = document.getElementById('pdf-reader-modal');
    const titleEl = document.getElementById('pdf-modal-title');
    const dl = document.getElementById('pdf-download-btn');
    if (titleEl) titleEl.textContent = pdfState.title;
    if (dl) dl.href = encodeURI(file);
    if (modal) modal.style.display = 'flex';

    pdfBuildChapterSelect();
    pdfGoPage(startPage, true);

    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = pdfUrl(startPage, 0);
}
/* ==========================================================================
   APP SHELL -- navigation, theme, session, profile, PDF reader, mind-map modal
   ========================================================================== */

const NSA_SESSION_KEY = 'nsa_session';
const NSA_PROFILE_KEY = 'nsa_profile';
const PROFILE_PHOTO_KEY = 'nsa_profile_photo';
const THEME_KEY = 'nsa_theme';
const HISTORY_KEY = 'nsa_nav_history';

const VIEW_META = {
    dashboard: { title: 'Dashboard', crumb: 'Home' },
    study: { title: 'Study Texts', crumb: 'Study Library' },
    mindmaps: { title: 'Mind Maps', crumb: 'Mind Maps' },
    practice: { title: 'Practice Centre', crumb: 'Practice' },
    mockexams: { title: 'Mock Exams', crumb: 'Mock Exams' },
    evaluation: { title: 'Evaluation', crumb: 'Evaluation' },
    revision: { title: 'Quick Revision', crumb: 'Quick Revision' },
    mistakes: { title: 'Mistake Bank', crumb: 'Mistake Bank' },
    progress: { title: 'Progress', crumb: 'Progress' },
    profile: { title: 'My Profile', crumb: 'Profile' }
};

let currentView = 'dashboard';
let navHistory = [];
let navHistoryIndex = -1;
let viewInitialised = {};

/* ------------------------------------------------------------------ session */
function getSession() {
    try {
        return JSON.parse(localStorage.getItem(NSA_SESSION_KEY) || 'null');
    } catch (e) {
        return null;
    }
}

function getProfile() {
    const s = getSession();
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(NSA_PROFILE_KEY) || '{}') || {};
    } catch (e) { saved = {}; }
    return {
        name: saved.name || (s && (s.name || s.user_name)) || 'Student',
        crn: saved.crn || (s && s.crn) || '',
        phone: saved.phone || '',
        email: saved.email || (s && s.email) || '',
        session: saved.session || (s && s.session) || ''
    };
}

function saveProfile(p) {
    try { localStorage.setItem(NSA_PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* quota */ }
}

function profileInitials(name) {
    const parts = String(name || 'Student').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'S';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function sessionLabel(v) {
    const map = {
        'sra': 'SRA - Foundation', 'intermediate': 'Intermediate',
        'final': 'Final', 'foundation': 'Foundation'
    };
    return map[v] || v || 'Not set';
}

/* ------------------------------------------------------------ render profile */
function renderProfileUI() {
    const p = getProfile();

    const avatar = document.getElementById('sidebar-avatar-initials');
    if (avatar) avatar.textContent = profileInitials(p.name);

    const nameEl = document.getElementById('sidebar-display-name');
    if (nameEl) nameEl.textContent = p.name;

    const crnEl = document.getElementById('sidebar-display-crn');
    if (crnEl) crnEl.textContent = p.crn ? ('CRN ' + p.crn) : 'ICAP Student';

    const welcome = document.getElementById('dash-welcome-name');
    if (welcome) welcome.textContent = p.name;

    const welcomeCrn = document.getElementById('dash-welcome-crn');
    if (welcomeCrn) welcomeCrn.textContent = p.crn ? ('CRN ' + p.crn) : 'ICAP Student';

    const cardName = document.getElementById('profile-card-name');
    if (cardName) cardName.textContent = p.name;

    const cardCrn = document.getElementById('profile-card-crn');
    if (cardCrn) cardCrn.textContent = p.crn ? ('CRN ' + p.crn) : 'CRN not set';

    const cardEmail = document.getElementById('profile-card-email');
    if (cardEmail) cardEmail.textContent = p.email || 'Not set';

    const cardPhone = document.getElementById('profile-card-phone');
    if (cardPhone) cardPhone.textContent = p.phone || 'Not set';

    const cardSession = document.getElementById('profile-card-session');
    if (cardSession) cardSession.textContent = sessionLabel(p.session);

    setVal('input-profile-name', p.name);
    setVal('input-profile-crn', p.crn);
    setVal('input-profile-phone', p.phone);
    setVal('input-profile-email', p.email);

    const sel = document.getElementById('input-profile-session');
    if (sel && p.session) {
        const has = Array.prototype.some.call(sel.options, function (o) { return o.value === p.session; });
        if (!has) {
            const extra = document.createElement('option');
            extra.value = p.session;
            extra.textContent = p.session;
            sel.appendChild(extra);
        }
        sel.value = p.session;
    }

    renderProfilePhoto();
}

function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v == null ? '' : v;
}

function getProfilePhoto() {
    try { return localStorage.getItem(PROFILE_PHOTO_KEY) || ''; } catch (e) { return ''; }
}

function renderProfilePhoto() {
    const host = document.getElementById('profile-card-avatar');
    if (!host) return;
    const url = getProfilePhoto();
    if (url) {
        host.innerHTML = '<img src="' + url + '" alt="Profile photo" ' +
            'style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    } else {
        host.textContent = profileInitials(getProfile().name);
    }
}

function profileFeedback(msg, isError) {
    const el = document.getElementById('profile-photo-feedback');
    if (!el) return;
    if (!msg) { el.textContent = ''; el.style.color = ''; return; }
    el.textContent = msg;
    el.style.color = isError ? 'var(--rose-400)' : 'var(--emerald-400)';
}

/* ------------------------------------------------------------------- theme */
function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
}

function applyStoredTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (e) { saved = ''; }
    if (saved) document.documentElement.setAttribute('data-theme', saved);
}

/* ----------------------------------------------------------------- profile */
function saveStudentProfile(event) {
    if (event && event.preventDefault) event.preventDefault();
    const name = (document.getElementById('input-profile-name') || {}).value || '';
    const crn = (document.getElementById('input-profile-crn') || {}).value || '';
    const phone = (document.getElementById('input-profile-phone') || {}).value || '';
    const email = (document.getElementById('input-profile-email') || {}).value || '';
    const session = (document.getElementById('input-profile-session') || {}).value || '';

    if (!name.trim()) {
        showProfileAlert('Naam likhna zaroori hai.', true);
        return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        showProfileAlert('Email address theek nahi lag rahi.', true);
        return;
    }

    saveProfile({
        name: name.trim(), crn: crn.trim(), phone: phone.trim(),
        email: email.trim(), session: session
    });
    renderProfileUI();
    showProfileAlert('Profile save ho gaya. Shukriya!', false);
}

function showProfileAlert(msg, isError) {
    const el = document.getElementById('profile-save-alert');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = isError ? 'var(--rose-400)' : 'var(--emerald-400)';
    el.style.borderColor = isError ? 'var(--rose-500)' : 'var(--emerald-500)';
    window.setTimeout(function () {
        el.style.display = 'none';
        el.textContent = '';
    }, 4000);
}

function openPhotoPicker() {
    const input = document.getElementById('profile-photo-input');
    if (input) input.click();
}

function onProfilePhotoSelected(event) {
    const input = event && event.target;
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    if (!/^image\//.test(file.type)) {
        profileFeedback('Sirf image file (PNG/JPG) chalegi.', true);
        return;
    }
    if (file.size > 4 * 1024 * 1024) {
        profileFeedback('Photo 4 MB se choti honi chahiye.', true);
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        shrinkImage(e.target.result, 256, function (small) {
            try {
                localStorage.setItem(PROFILE_PHOTO_KEY, small);
                renderProfilePhoto();
                profileFeedback('Photo update ho gayi.', false);
            } catch (err) {
                profileFeedback('Photo save nahi ho saki (storage full).', true);
            }
        });
    };
    reader.onerror = function () { profileFeedback('Photo read nahi ho saki.', true); };
    reader.readAsDataURL(file);
    input.value = '';
}

function shrinkImage(dataUrl, maxSize, done) {
    const img = new Image();
    img.onload = function () {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try { done(c.toDataURL('image/jpeg', 0.82)); }
        catch (e) { done(dataUrl); }
    };
    img.onerror = function () { done(dataUrl); };
    img.src = dataUrl;
}

function removeProfilePhoto() {
    try { localStorage.removeItem(PROFILE_PHOTO_KEY); } catch (e) { /* ignore */ }
    renderProfilePhoto();
    profileFeedback('Photo hata di gayi.', false);
}

function resetProfileToDefault() {
    try { localStorage.removeItem(NSA_PROFILE_KEY); } catch (e) { /* ignore */ }
    renderProfileUI();
    showProfileAlert('Profile login details par reset ho gaya.', false);
}

function handleLogout() {
    try {
        localStorage.removeItem(NSA_SESSION_KEY);
        localStorage.removeItem(HISTORY_KEY);
    } catch (e) { /* ignore */ }
    window.location.replace('login.html');
}

/* ------------------------------------------------------------- navigation */
function applyView(view, opts) {
    opts = opts || {};
    if (!VIEW_META[view]) view = 'dashboard';

    document.querySelectorAll('.view-section').forEach(function (sec) {
        sec.style.display = 'none';
        sec.classList.remove('active');
    });
    const target = document.getElementById('view-' + view);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(function (n) {
        n.classList.toggle('active', n.getAttribute('data-view') === view);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(function (n) {
        n.classList.toggle('active', n.getAttribute('data-view') === view);
    });

    const meta = VIEW_META[view];
    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = meta.title;

    const trailEl = document.getElementById('app-page-trail');
    if (trailEl) trailEl.innerHTML = '<span class="crumb-root">Home</span>' +
        '<span class="crumb-sep">/</span><span class="crumb-current">' +
        mmEsc(meta.crumb) + '</span>';

    currentView = view;
    if (window.history && !opts.silent) {
        try {
            const hash = '#/' + view;
            if (window.location.hash !== hash) {
                history.replaceState({ view: view }, '', hash);
            }
        } catch (e) { /* ignore */ }
    }

    lazyInitView(view);

    const main = document.querySelector('.content-area');
    if (main && !opts.keepScroll) main.scrollTop = 0;
}

function lazyInitView(view) {
    if (viewInitialised[view]) return;
    viewInitialised[view] = true;
    try {
        if (view === 'mindmaps' && typeof initMindMapsApp === 'function') initMindMapsApp();
        if (view === 'study' && typeof switchStudyLevel === 'function') switchStudyLevel(currentStudyLevel);
        if (view === 'profile') renderProfileUI();
        if (view === 'mockexams' && typeof renderMockExamsPortal === 'function') {
            window.setTimeout(renderMockExamsPortal, 60);
        }
        if (view === 'practice' && typeof initPracticeCenterApp === 'function') initPracticeCenterApp();
    } catch (e) {
        console.error('view init failed:', view, e);
    }
}

function switchView(view, el) {
    if (!VIEW_META[view]) return;
    applyView(view);
    pushNavEntry(view);
}

function pushNavEntry(view) {
    if (navHistory[navHistoryIndex] === view) return;
    navHistory = navHistory.slice(0, navHistoryIndex + 1);
    navHistory.push(view);
    navHistoryIndex = navHistory.length - 1;
    if (navHistory.length > 40) {
        navHistory.shift();
        navHistoryIndex -= 1;
    }
    persistNavHistory();
    updateHistButtons();
}

function persistNavHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify({
            stack: navHistory, index: navHistoryIndex, current: currentView
        }));
    } catch (e) { /* ignore */ }
}

function restoreNavHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || 'null');
        if (raw && Array.isArray(raw.stack) && raw.stack.length) {
            navHistory = raw.stack.filter(function (v) { return VIEW_META[v]; });
            navHistoryIndex = Math.min(raw.index == null ? navHistory.length - 1 : raw.index,
                navHistory.length - 1);
        }
    } catch (e) { /* ignore */ }
}

function updateHistButtons() {
    const b = document.getElementById('app-back-btn');
    const f = document.getElementById('app-fwd-btn');
    if (b) b.disabled = navHistoryIndex <= 0;
    if (f) f.disabled = navHistoryIndex >= navHistory.length - 1;
}

function appGoBack() {
    if (navHistoryIndex <= 0) return;
    navHistoryIndex -= 1;
    applyView(navHistory[navHistoryIndex], { silent: true });
    updateHistButtons();
}

function appGoForward() {
    if (navHistoryIndex >= navHistory.length - 1) return;
    navHistoryIndex += 1;
    applyView(navHistory[navHistoryIndex], { silent: true });
    updateHistButtons();
}

function appGoHome() {
    applyView('dashboard');
    pushNavEntry('dashboard');
}

/* ------------------------------------------------------------ study level */
let currentStudyLevel = 'prc';

function switchStudyLevel(level) {
    currentStudyLevel = level === 'caf' ? 'caf' : 'prc';
    const prcBtn = document.getElementById('tab-prc');
    const cafBtn = document.getElementById('tab-caf');
    if (prcBtn) prcBtn.classList.toggle('active', currentStudyLevel === 'prc');
    if (cafBtn) cafBtn.classList.toggle('active', currentStudyLevel === 'caf');

    const prcBox = document.getElementById('study-prc-content');
    const cafBox = document.getElementById('study-caf-content');
    if (prcBox) prcBox.classList.toggle('active', currentStudyLevel === 'prc');
    if (cafBox) cafBox.classList.toggle('active', currentStudyLevel === 'caf');

    if (currentStudyLevel === 'caf' && typeof renderCafStudyLibrary === 'function') {
        renderCafStudyLibrary();
    }
}

/* ============================================================== PDF READER */
const pdfState = {
    file: '',
    title: '',
    page: 1,
    total: 0,
    zoom: 0,
    chapterIdx: -1,
    chapters: [],
    offset: 5,
    history: [],
    hIndex: -1,
    open: false
};

const PDF_ZOOM_STEPS = [0, 50, 75, 100, 125, 150, 200, 300, 400];

function pdfUrl(page, zoom) {
    const bits = [];
    if (page && page > 0) bits.push('page=' + page);
    if (zoom && zoom > 0) bits.push('zoom=' + zoom);
    bits.push('view=FitH');
    return encodeURI(pdfState.file) + '#' + bits.join('&');
}

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
    pdfState.history = [];
    pdfState.hIndex = -1;

    const modal = document.getElementById('pdf-reader-modal');
    const titleEl = document.getElementById('pdf-modal-title');
    const dl = document.getElementById('pdf-download-btn');
    if (titleEl) titleEl.textContent = pdfState.title;
    if (dl) dl.href = encodeURI(file);
    if (modal) modal.style.display = 'flex';

    pdfBuildChapterSelect();

    const startPrinted = printedPage || 1;
    pdfGoPage(startPrinted, true);

    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = pdfUrl(printedPage || 1, 0);
}

function pdfBuildChapterSelect() {
    const sel = document.getElementById('pdf-chapter-select');
    if (!sel) return;
    if (!pdfState.chapters || !pdfState.chapters.length) {
        sel.innerHTML = '<option value="">No chapter index</option>';
        sel.disabled = true;
        return;
    }
    let html = '';
    pdfState.chapters.forEach(function (c, i) {
        const label = 'Ch ' + c.n + ' · p.' + c.p + ' · ' + mmEsc(c.t);
        html += '<option value="' + i + '">' + label + '</option>';
    });
    sel.innerHTML = html;
    sel.disabled = false;
}

function pdfSyncToolbar() {
    const set = function (id, on) {
        const el = document.getElementById(id);
        if (el) el.disabled = !on;
    };
    set('pdf-first-btn', pdfState.page > 1);
    set('pdf-prev-btn', pdfState.page > 1);
    set('pdf-next-btn', !pdfState.total || pdfState.page < pdfState.total);
    set('pdf-last-btn', !!pdfState.total && pdfState.page < pdfState.total);
    set('pdf-prev-ch-btn', pdfState.chapterIdx > 0);
    set('pdf-next-ch-btn',
        pdfState.chapterIdx >= 0 && pdfState.chapterIdx < pdfState.chapters.length - 1);
    set('pdf-back-btn', pdfState.hIndex > 0);
    set('pdf-fwd-btn', pdfState.hIndex < pdfState.history.length - 1);

    const input = document.getElementById('pdf-page-input');
    if (input && document.activeElement !== input) input.value = pdfState.page;

    const total = document.getElementById('pdf-total-label');
    if (total) total.innerHTML = pdfState.total ? ('/ ' + pdfState.total) : '/ &mdash;';

    const zoom = document.getElementById('pdf-zoom-label');
    if (zoom) zoom.textContent = pdfState.zoom ? (pdfState.zoom + '%') : 'Auto';
}

function pdfGoPage(page, isReset) {
    let p = parseInt(page, 10);
    if (!p || p < 1) p = 1;
    if (pdfState.total && p > pdfState.total) p = pdfState.total;

    if (!isReset) {
        if (pdfState.hIndex < 0 || pdfState.history[pdfState.hIndex] !== p) {
            pdfState.history = pdfState.history.slice(0, pdfState.hIndex + 1);
            pdfState.history.push(p);
            if (pdfState.history.length > 60) {
                pdfState.history.shift();
            }
            pdfState.hIndex = pdfState.history.length - 1;
        }
    }

    pdfState.page = p;

    const idx = pdfChapterIndexForPage(p);
    pdfState.chapterIdx = idx;
    const sel = document.getElementById('pdf-chapter-select');
    if (sel && idx >= 0) sel.value = String(idx);

    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = pdfUrl(p, pdfState.zoom);
    pdfSyncToolbar();
}

function pdfChapterIndexForPage(page) {
    const ch = pdfState.chapters;
    if (!ch || !ch.length) return -1;
    let found = -1;
    for (let i = 0; i < ch.length; i++) {
        if (ch[i].p <= page) found = i; else break;
    }
    return found;
}

function pdfGoBack() {
    if (pdfState.hIndex <= 0) return;
    pdfState.hIndex -= 1;
    pdfGoPage(pdfState.history[pdfState.hIndex], true);
}

function pdfGoForward() {
    if (pdfState.hIndex >= pdfState.history.length - 1) return;
    pdfState.hIndex += 1;
    pdfGoPage(pdfState.history[pdfState.hIndex], true);
}

function pdfGoChapter(value) {
    const idx = parseInt(value, 10);
    if (isNaN(idx) || !pdfState.chapters[idx]) return;
    pdfGoPage(pdfState.chapters[idx].p);
}

function pdfStepChapter(delta) {
    if (!pdfState.chapters.length) return;
    let idx = pdfState.chapterIdx;
    if (idx < 0) {
        idx = pdfChapterIndexForPage(pdfState.page);
        if (idx < 0) idx = delta > 0 ? -1 : pdfState.chapters.length;
    }
    const next = idx + delta;
    if (next < 0 || next >= pdfState.chapters.length) return;
    pdfGoChapter(String(next));
}

function pdfStepZoom(delta) {
    let i = PDF_ZOOM_STEPS.indexOf(pdfState.zoom);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(PDF_ZOOM_STEPS.length - 1, i + delta));
    pdfState.zoom = PDF_ZOOM_STEPS[i];
    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = pdfUrl(pdfState.page, pdfState.zoom);
    pdfSyncToolbar();
}

function pdfResetZoom() {
    pdfState.zoom = 0;
    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = pdfUrl(pdfState.page, 0);
    pdfSyncToolbar();
}

function pdfPageInputKey(event) {
    if (!event || event.key !== 'Enter') return;
    event.preventDefault();
    const input = document.getElementById('pdf-page-input');
    if (input) {
        pdfGoPage(parseInt(input.value, 10) || 1);
        input.blur();
    }
}

function closePdfReader() {
    const modal = document.getElementById('pdf-reader-modal');
    if (modal) modal.style.display = 'none';
    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = 'about:blank';
    pdfState.open = false;
    pdfState.history = [];
    pdfState.hIndex = -1;
}

/* ------------------------------------------------------- PRC book shortcuts */
function prcBookByFile(file) {
    const list = typeof PRC_BOOKS !== 'undefined' ? PRC_BOOKS : [];
    return list.find(function (b) { return b.file === file; }) || null;
}

function openPrcBook(file) {
    const book = prcBookByFile(file);
    if (!book) { openPdfReader(file, file, 1, { offset: 5 }); return; }
    openPdfReader(book.file, book.code + ' — ' + book.title, 1, {
        offset: book.offset,
        chapters: book.chapters,
        pdfPages: 0
    });
}

function openPrcChapter(file, chapterIndex) {
    const book = prcBookByFile(file);
    if (!book) { openPdfReader(file, file, 1, { offset: 5 }); return; }
    const idx = Math.max(0, Math.min(book.chapters.length - 1, chapterIndex || 0));
    const ch = book.chapters[idx];
    if (!ch) return;
    openPdfReader(book.file, book.code + ' — Ch ' + ch.n + ': ' + ch.t, ch.p, {
        offset: book.offset,
        chapters: book.chapters,
        pdfPages: 0
    });
}

/* buildReaderOpts was referenced by the CAF study library */
function buildReaderOpts(book) {
    return {
        offset: book.offset == null ? 5 : book.offset,
        chapters: book.chapters || [],
        pdfPages: book.pdfPages || 0
    };
}

/* ------------------------------------------------------- mind map topic modal */
function mmFindTopic(topicId) {
    for (const key of Object.keys(mmDataStore)) {
        const chapters = mmDataStore[key] || [];
        for (const ch of chapters) {
            const t = (ch.topics || []).find(function (x) { return x.id === topicId; });
            if (t) return { topic: t, chapter: ch, bookKey: key };
        }
    }
    return null;
}

const MM_KIND_LABEL = {
    definition: 'Concept & Definition',
    list: 'Topic Breakdown',
    formula: 'Formula & Working',
    comparison: 'Comparison',
    recognition: 'Recognition & Measurement',
    disclosure: 'Disclosure & Presentation',
    procedure: 'Procedure & Entries',
    legal: 'Law & Regulation',
    auditproc: 'Audit Procedure',
    tax: 'Taxation',
    quant: 'Quantitative',
    analysis: 'Business Analysis',
    practice: 'Practice Section'
};

function openTopicModal(topicId) {
    const found = mmFindTopic(topicId);
    const modal = document.getElementById('mm-topic-modal');
    if (!modal) return;
    if (!found) {
        document.getElementById('mm-modal-badge').textContent = 'Not found';
        document.getElementById('mm-modal-title').textContent = 'Topic unavailable';
        document.getElementById('mm-modal-body').innerHTML =
            '<p style="color:var(--text-muted);">Is topic ka data load nahi ho saka.</p>';
        modal.style.display = 'flex';
        return;
    }

    const t = found.topic;
    const ch = found.chapter;
    const subject = mmSubjectsList.find(function (s) { return s.id === found.bookKey; }) ||
        mmSubjectsList[0];
    const color = subject.color;
    const rgb = hexToRgb(color);

    document.getElementById('mm-modal-badge').textContent =
        subject.code + ' · Ch ' + ch.chapterNumber;
    document.getElementById('mm-modal-title').textContent = t.title;

    let h = '';

    /* context strip */
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">';
    h += '<span class="badge" style="background:rgba(' + rgb + ',0.18);color:' + color +
        ';border:1px solid ' + color + ';">' + mmEsc(MM_KIND_LABEL[t.kind] || 'Topic') + '</span>';
    if (t.studyPage) {
        h += '<span class="badge badge-blue">Study text p.' + mmEsc(String(t.studyPage)) + '</span>';
    }
    h += '<span class="badge badge-neutral">Chapter pp. ' + mmEsc(ch.pages) + '</span>';
    h += '</div>';

    /* roman urdu */
    h += '<div class="mm-roman-box" style="margin-bottom:18px;">';
    h += '<span class="mm-roman-tag">Roman Urdu Explanation</span>';
    h += '<p style="margin:6px 0 0;line-height:1.65;">' + mmEsc(t.romanUrdu) + '</p>';
    h += '</div>';

    /* study-text key points */
    if (t.keyPoints && t.keyPoints.length) {
        h += '<h4 style="margin:0 0 8px;font-size:0.95rem;color:var(--text-main);">' +
            'Study Text — Key Points</h4>';
        h += '<ul style="margin:0 0 18px;padding-left:20px;line-height:1.6;color:var(--text-subtle);">';
        t.keyPoints.forEach(function (k) {
            h += '<li style="margin-bottom:6px;">' + mmEsc(k) + '</li>';
        });
        h += '</ul>';
    }

    /* formula */
    if (t.formula) {
        h += '<div class="mm-formula-box" style="margin-bottom:18px;"><strong>Formula / Rule:</strong><br>' +
            mmEsc(t.formula).split(' ; ').map(function (f) {
                return '<div style="margin-top:4px;">= ' + mmEsc(f) + '</div>';
            }).join('') + '</div>';
    }

    /* sub nodes */
    if (t.subNodes && t.subNodes.length) {
        h += '<h4 style="margin:0 0 8px;font-size:0.95rem;color:var(--text-main);">' +
            'Is Topic Mein Kya Kya Hai</h4>';
        h += '<ul class="mm-subnodes" style="margin:0 0 18px;">';
        t.subNodes.forEach(function (s) { h += '<li>' + mmEsc(s) + '</li>'; });
        h += '</ul>';
    }

    /* exam tip */
    if (t.examTip) {
        h += '<div class="mm-exam-tip" style="margin-bottom:18px;"><strong>ICAP Exam Tip:</strong> ' +
            mmEsc(t.examTip) + '</div>';
    }

    /* chapter summary + revision */
    if (ch.summary && ch.summary.length) {
        h += '<h4 style="margin:0 0 8px;font-size:0.95rem;color:var(--text-main);">' +
            'Chapter Summary (At a Glance)</h4>';
        h += '<ul style="margin:0 0 18px;padding-left:20px;line-height:1.6;color:var(--text-subtle);">';
        ch.summary.forEach(function (s) { h += '<li style="margin-bottom:6px;">' + mmEsc(s) + '</li>'; });
        h += '</ul>';
    }
    if (ch.revision && ch.revision.length) {
        h += '<h4 style="margin:0 0 8px;font-size:0.95rem;color:var(--gold-500);">' +
            'Revision Notes (Sticky Notes)</h4>';
        h += '<ul style="margin:0 0 18px;padding-left:20px;line-height:1.6;color:var(--text-subtle);">';
        ch.revision.forEach(function (s) { h += '<li style="margin-bottom:6px;">' + mmEsc(s) + '</li>'; });
        h += '</ul>';
    }

    /* deep link into the study text */
    const bm = typeof STUDY_BOOK_MAP !== 'undefined' ? STUDY_BOOK_MAP[found.bookKey] : null;
    if (bm && t.studyPage) {
        h += '<button class="btn btn-primary" style="margin-top:4px;" onclick="openPrcChapterDeep(\'' +
            mmEsc(bm.file) + '\',' + mmEsc(String(t.studyPage)) + ',\'' + mmEsc(bm.code) + '\')">' +
            'Study text page ' + mmEsc(String(t.studyPage)) + ' kholo</button>';
    }

    document.getElementById('mm-modal-body').innerHTML = h;
    modal.style.display = 'flex';
}

function openPrcChapterDeep(file, printedPage, code) {
    const bm = typeof STUDY_BOOK_MAP !== 'undefined'
        ? Object.values(STUDY_BOOK_MAP).find(function (b) { return b.file === file; })
        : null;
    closeTopicModal();
    openPdfReader(file, (code || file) + ' — p.' + printedPage, printedPage, {
        offset: bm ? bm.offset : 5,
        chapters: bm ? bm.chapters : [],
        pdfPages: 0
    });
}

function closeTopicModal() {
    const modal = document.getElementById('mm-topic-modal');
    if (modal) modal.style.display = 'none';
}

/* ------------------------------------------------------------- global keys */
document.addEventListener('keydown', function (e) {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
        (e.target && e.target.isContentEditable);

    if (e.key === 'Escape') {
        if (pdfState.open) { closePdfReader(); return; }
        const mm = document.getElementById('mm-topic-modal');
        if (mm && mm.style.display === 'flex') { closeTopicModal(); return; }
        return;
    }

    if (!pdfState.open || typing) return;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.altKey) pdfGoBack(); else pdfGoPage(pdfState.page - 1);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.altKey) pdfGoForward(); else pdfGoPage(pdfState.page + 1);
    } else if (e.key === '[') {
        e.preventDefault(); pdfStepChapter(-1);
    } else if (e.key === ']') {
        e.preventDefault(); pdfStepChapter(1);
    } else if (e.key === 'Home') {
        e.preventDefault(); pdfGoPage(1);
    } else if (e.key === 'End') {
        e.preventDefault(); pdfGoPage(pdfState.total || pdfState.page);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault(); pdfStepZoom(1);
    } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault(); pdfStepZoom(-1);
    }
});

/* click-outside to close the topic modal */
document.addEventListener('click', function (e) {
    const mm = document.getElementById('mm-topic-modal');
    if (!mm || mm.style.display !== 'flex') return;
    if (e.target === mm) closeTopicModal();
});

/* ------------------------------------------------------------------ boot */
function bootAppShell() {
    applyStoredTheme();
    renderProfileUI();
    restoreNavHistory();

    // tag nav items so switchView can highlight them without touching the markup
    document.querySelectorAll('.nav-item').forEach(function (n) {
        const m = (n.getAttribute('onclick') || '').match(/switchView\(\s*'([^']+)'/);
        if (m) n.setAttribute('data-view', m[1]);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(function (n) {
        const m = (n.getAttribute('onclick') || '').match(/switchView\(\s*'([^']+)'/);
        if (m) n.setAttribute('data-view', m[1]);
    });

    if (!navHistory.length) navHistory = ['dashboard'];
    navHistoryIndex = navHistory.length - 1;

    let start = 'dashboard';
    const hash = (window.location.hash || '').replace(/^#\/?/, '');
    if (VIEW_META[hash]) start = hash;
    applyView(start, { silent: true });
    updateHistButtons();

    window.addEventListener('hashchange', function () {
        const v = (window.location.hash || '').replace(/^#\/?/, '');
        if (VIEW_META[v] && v !== currentView) {
            applyView(v, { silent: true });
            pushNavEntry(v);
        }
    });
}
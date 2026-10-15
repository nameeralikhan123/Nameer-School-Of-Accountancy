/* ============================ Scrollable tab strips ============================
 * Every book / subject / level selector in the app is one horizontal row.
 * Nine CAF volumes and thirteen subjects cannot fit a 100%-zoom viewport, and
 * `overflow-x:auto` alone gives the student nothing to grab: the strip looks
 * like a finished row that simply stops. So each strip is upgraded in place
 * into a `.tabstrip` shell -> [ <chevron> scrolling track >chevron ].
 *
 * - chevrons appear only while something is actually hidden off an edge
 * - vertical wheel over a strip scrolls it sideways
 * - click-drag works for mouse users; the click is swallowed after a drag
 * - the active tab is scrolled into view on every render
 *
 * Idempotent: re-running only refreshes, it never re-wraps.
 * ============================================================================= */

const TAB_STRIP_CLASSES = ['study-level-tabs', 'mm-subject-tabs'];

const TAB_STRIP_CHEVRON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="15 18 9 12 15 6"/></svg>';

function tabStripElements() {
    const out = [];
    TAB_STRIP_CLASSES.forEach(function (cls) {
        document.querySelectorAll('.' + cls).forEach(function (el) { out.push(el); });
    });
    return out;
}

function tabStripScrollBy(track, dir) {
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    if (max <= 0) return;
    /* instant, not smooth: an animation that does not run -- background tab,
     * reduced motion, throttled rAF -- would leave the strip sitting still while
     * the chevron looks broken */
    const step = Math.max(160, Math.round(track.clientWidth * 0.8));
    track.scrollLeft = Math.max(0, Math.min(max, track.scrollLeft + dir * step));
}

function tabStripRefresh(track) {
    if (!track) return;
    const shell = track.parentNode;
    if (!shell || !shell.classList || !shell.classList.contains('tabstrip')) return;
    const max = track.scrollWidth - track.clientWidth;
    shell.classList.toggle('is-overflowing', max > 4);
    shell.classList.toggle('at-start', track.scrollLeft <= 2);
    shell.classList.toggle('at-end', track.scrollLeft >= max - 2);
}

function tabStripRevealActive(track) {
    if (!track) return;
    const active = track.querySelector('.active');
    if (!active) { tabStripRefresh(track); return; }
    const trackBox = track.getBoundingClientRect();
    if (!trackBox.width) { tabStripRefresh(track); return; }
    const box = active.getBoundingClientRect();
    if (box.left < trackBox.left + 4) {
        track.scrollLeft -= (trackBox.left + 4 - box.left);
    } else if (box.right > trackBox.right - 4) {
        track.scrollLeft += (box.right - (trackBox.right - 4));
    }
    tabStripRefresh(track);
}

function tabStripMakeArrow(track, dir) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabstrip-btn tabstrip-btn--' + dir;
    btn.setAttribute('aria-label', dir === 'prev' ? 'Scroll tabs left' : 'Scroll tabs right');
    btn.title = dir === 'prev' ? 'Scroll tabs left' : 'Scroll tabs right';
    btn.innerHTML = TAB_STRIP_CHEVRON;
    if (dir === 'next') btn.firstChild.setAttribute('transform', 'translate(24,0) scale(-1,1)');
    btn.addEventListener('click', function () {
        tabStripScrollBy(track, dir === 'prev' ? -1 : 1);
    });
    return btn;
}

function enhanceTabStrip(track, reveal) {
    if (!track || !track.parentNode) return;

    if (!track.classList.contains('tabstrip-track')) {
        const shell = document.createElement('div');
        shell.className = 'tabstrip';
        track.parentNode.insertBefore(shell, track);
        shell.appendChild(track);
        shell.insertBefore(tabStripMakeArrow(track, 'prev'), track);
        shell.appendChild(tabStripMakeArrow(track, 'next'));
        track.classList.add('tabstrip-track');

        let raf = 0;
        track.addEventListener('scroll', function () {
            if (raf) return;
            raf = window.requestAnimationFrame(function () { raf = 0; tabStripRefresh(track); });
        });
        window.addEventListener('resize', function () { tabStripRefresh(track); });

        track.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            if (track.scrollWidth - track.clientWidth <= 4) return;
            const before = track.scrollLeft;
            track.scrollLeft += e.deltaY;
            if (track.scrollLeft !== before) e.preventDefault();
        }, { passive: false });

        let dragging = false;
        let startX = 0;
        let startLeft = 0;
        let moved = 0;
        track.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            if (e.target && e.target.closest && e.target.closest('button')) return;
            dragging = true;
            moved = 0;
            startX = e.clientX;
            startLeft = track.scrollLeft;
        });
        window.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            const dx = e.clientX - startX;
            if (Math.abs(dx) > moved) moved = Math.abs(dx);
            track.scrollLeft = startLeft - dx;
        });
        window.addEventListener('pointerup', function () {
            if (dragging && moved > 5) track.classList.add('was-dragged');
            dragging = false;
        });
        track.addEventListener('click', function (e) {
            if (!track.classList.contains('was-dragged')) return;
            track.classList.remove('was-dragged');
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }

    if (reveal === false) tabStripRefresh(track);
    else tabStripRevealActive(track);
}

function refreshAllTabStrips() {
    tabStripElements().forEach(function (el) { enhanceTabStrip(el); });
}

/* ==== end of Scrollable tab strips fragment ==== */

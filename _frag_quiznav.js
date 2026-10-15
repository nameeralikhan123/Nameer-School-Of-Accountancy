/* ---------------- quiz navigation guards (regenerated) ---------------- */
function navigateQuizQuestion(direction) {
    if (!currentQuizState) return;
    const next = currentQuizState.currentIndex + (direction > 0 ? 1 : -1);
    if (next < 0 || next >= currentQuizState.questions.length) return;
    currentQuizState.currentIndex = next;
    renderQuizPlayer();
}
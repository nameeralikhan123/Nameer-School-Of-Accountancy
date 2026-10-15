function mmEsc(str) {
                return String(str == null ? '' : str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

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
                html += mmEsc(activeSubject.code) + ' &bull; Chapter ' + mmEsc(activeChapter.chapterNumber) +
                        ' &bull; Study Text pp. ' + mmEsc(activeChapter.pages) +
                '</span>';
                html += '<span class="mm-toolbar-hint">' + topicCount + ' topic' + (topicCount === 1 ? '' : 's') +
                        ' &bull; tap any card for full detail</span>';
                html += '</div>';

                /* ---------- root chapter node ---------- */
                html += '<div class="mm-root-card" style="border-color:' + color + '">';
                html += '<div class="mm-root-icon" style="background:rgba(' + rgb + ',0.2); color:' + color + ';">' + activeSubject.icon + '</div>';
                html += '<div class="mm-root-body">';
                html += '<div class="mm-root-kicker">Core Concept Tree</div>';
                html += '<h2 class="mm-root-title">' + mmEsc(activeChapter.title) + '</h2>';
                html += '<p class="mm-root-sub">' + topicCount + ' topic' + (topicCount === 1 ? '' : 's') +
                        ' &mdash; Roman Urdu explanation with ICAP exam focus</p>';
                html += '</div></div>';

                /* ---------- topic node grid ---------- */
                html += '<div class="mm-nodes-grid">';
                activeChapter.topics.forEach(function (t, idx) {
                    html += '<div class="mm-node-card" data-topic="' + mmEsc(t.id) + '" onclick="openTopicModal(\'' + mmEsc(t.id) + '\')">';
                    html += '<div class="mm-node-num">' + (idx + 1) + '</div>';
                    html += '<div class="mm-node-title">' + mmEsc(t.title) + '</div>';
                    html += '<div class="mm-roman-box">';
                    html += '<span class="mm-roman-tag">Roman Urdu</span>';
                    html += '<p>' + mmEsc(t.romanUrdu) + '</p>';
                    html += '</div>';
                    if (t.formula) {
                        html += '<div class="mm-formula-box"><strong>Formula / Rule:</strong> ' + mmEsc(t.formula) + '</div>';
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
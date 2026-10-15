/* ============================ CAF Practice Centre engine ============================
 * Vertical slice, phases 5-7: question selection, handwriting transcription,
 * deterministic partial marking, and the mistake book.
 *
 * ------------------------------------------------------------------ honesty note
 * This engine marks from EVIDENCE, not from an answer key, and it is honest about
 * what that means:
 *
 *   - It never awards or withholds a mark on a keyword hit alone. Every criterion
 *     is scored as marks-per-point: a criterion worth N marks over K required
 *     points pays one mark per point demonstrated. A candidate who shows half the
 *     points keeps half the marks. Partial credit is the normal case, not a
 *     fallback.
 *   - Term coverage is ONE evidence channel among several (point coverage,
 *     working structure, causal connectives, conclusion, presentation). A
 *     criterion whose evidence is structural is never decided by string matching.
 *   - If the transcription is missing or the OCR confidence is too low to trust,
 *     the criterion is returned UNREADABLE and contributes ZERO marks, and the
 *     question is flagged. Marks are never invented to fill a gap.
 *   - Practice rubrics are PRACTICE_RUBRIC - shaped from real paper demand, not
 *     an official ICAP marking plan. Official MCQ option letters ARE the
 *     examiner's and are marked exactly.
 *   - Every award carries an audit record (method, matched and missing evidence,
 *     reason code). Nothing is scored silently, so a tutor can see why a mark was
 *     given and override it.
 *   - Client-side only: this is a static page, so it is a first approximation for
 *     self-study, not a secure examination mark. It says so in the result view.
 *
 * Answer keys are never rendered during an attempt. `practiceQuestionView` returns
 * no expected answer; only `practiceFeedback` does, after submission.
 * ============================================================================= */

const PRACTICE_ENGINE_VERSION = "practice-engine/1";

/* ------------------------------------------------------------------ bank index
 * PRACTICE_BANK is emitted by _build/pipeline/build_questionbank.py as positional
 * arrays (see the header of _frag_practice_data.js for the key order). Turning
 * them into objects once, at load, beats re-decoding the shape at every call. */

function practiceIndexBank() {
    if (typeof PRACTICE_BANK === "undefined" || !PRACTICE_BANK) return null;
    if (PRACTICE_BANK._indexed) return PRACTICE_BANK._indexed;

    const generated = (PRACTICE_BANK.generated || []).map(function (r) {
        return {
            kind: "GENERATED_PRACTICE",
            id: r[0], subjectId: r[1], topicId: r[2], text: r[3],
            marks: r[4], minutes: r[5], difficulty: r[6], type: r[7],
            criteria: (r[8] || []).map(function (c) {
                return { id: c[0], maxMarks: c[1], evidence: c[2], errorType: c[3] };
            }),
            evidenceTerms: r[9] || {},
            rubricType: r[10]
        };
    });

    const official = (PRACTICE_BANK.official || []).map(function (r) {
        return {
            kind: "OFFICIAL_PAST_PAPER",
            id: r[0], subjectId: r[1], paperCode: r[2], paperDocId: r[3],
            answerDocId: r[4], questionNumber: r[5], text: r[6], marks: r[7],
            type: r[8],
            criteria: (r[9] || []).map(function (c) {
                return { id: c[0], maxMarks: c[1], evidence: c[2], errorType: c[3] };
            }),
            mcqAnswers: r[10] || {},
            expectedAnswer: r[11] || "",
            rubricType: r[12],
            mcqItems: r[13] || [],
            // Official rows carry term lists as well (slot 14), derived from the
            // ICAP suggested answer they are paired to. Without them the FORMULA
            // criterion on an official numerical question has nothing to match
            // against and scores zero for every answer ever written - the
            // question shows its marks but can never pay them.
            evidenceTerms: r[14] || {},
        };
    });

    /* Full generated papers are a separate payload (`PAPER_BANK`) because they
     * are papers, not questions: each has a total, a Section A the extractor
     * could not recover, a design mix and its own provenance statement. They
     * join `all` - every lookup in this engine resolves a question by id from
     * `all`, and a paper question has to be viewable, markable and summarisable
     * like any other - but they stay OUT of `bySubject`, `byDifficulty` and
     * `byTopic`. Those three indexes are what the setup screen counts with, and
     * folding 124 paper questions in would promise 690 practice questions for a
     * subject that has 566. The counts have to keep meaning what they say. */
    const paperList = (typeof PAPER_BANK !== "undefined" && PAPER_BANK)
        ? (PAPER_BANK.papers || []) : [];
    const paperQuestions = [];
    const paperById = {};
    paperList.forEach(function (p) {
        paperById[p.paperId] = p;
        (p.questions || []).forEach(function (q) {
            paperQuestions.push({
                kind: "GENERATED_PAPER",
                id: q.id, paperId: p.paperId, subjectId: p.subject,
                questionNumber: q.number, section: q.section,
                text: q.text, marks: q.marks, type: q.type,
                criteria: (q.criteria || []).map(function (c) {
                    return {
                        id: c.id, label: c.label, maxMarks: c.maxMarks,
                        evidence: c.evidence, errorType: c.errorType,
                        terms: c.terms || []
                    };
                }),
                expectedAnswer: q.expectedAnswer || "",
                markingNote: q.markingNote || "",
                workings: q.workings || "",
                topicId: q.topicId,
                requirementFromTopic: !!q.requirementFromTopic,
                grounding: {
                    topicId: q.topicId, topicTitle: q.topicTitle,
                    chapter: q.chapter, aligned: !!q.requirementFromTopic
                },
                computation: q.computation || "",
                rubricType: "PRACTICE_RUBRIC"
            });
        });
    });

    const bankPool = generated.concat(official);
    const all = bankPool.concat(paperQuestions);
    const bySubject = {};
    const byDifficulty = {};
    const byTopic = {};
    bankPool.forEach(function (q) {
        (bySubject[q.subjectId] = bySubject[q.subjectId] || []).push(q);
        (byDifficulty[q.difficulty || "OFFICIAL"] = byDifficulty[q.difficulty || "OFFICIAL"] || []).push(q);
        if (q.topicId) byTopic[q.topicId] = q;
    });

    PRACTICE_BANK._indexed = {
        all: all, generated: generated, official: official,
        paperQuestions: paperQuestions, paperById: paperById, paperList: paperList,
        bySubject: bySubject, byDifficulty: byDifficulty, byTopic: byTopic,
        sourceLabel: PRACTICE_BANK.sourceLabel
    };
    return PRACTICE_BANK._indexed;
}

/* One paper question as the engine sees it. Kept beside the index so the id
 * namespace (`pp-<paperId>-q<n>`, asserted disjoint from the bank's in
 * build_paper_layer.py) has a single definition. */
function practicePaperQuestion(paperId, question) {
    const bank = practiceIndexBank();
    if (!bank) return null;
    const id = question ? question.id : null;
    return bank.all.filter(function (x) { return x.id === id && x.paperId === paperId; })[0] || null;
}

function practicePaperById(paperId) {
    const bank = practiceIndexBank();
    if (!bank) return null;
    return bank.paperById[paperId] || null;
}

/* ------------------------------------------------------- expected-answer lookup
 * The study text is already in this file as mmDataStore, so the expected answer is
 * resolved from it on demand rather than stored twice. See emit_runtime_fragment()
 * in the builder for why. */

function practiceStudyTopic(topicId) {
    if (typeof mmDataStore === "undefined" || !mmDataStore || !topicId) return null;
    for (const subjectId in mmDataStore) {
        if (!Object.prototype.hasOwnProperty.call(mmDataStore, subjectId)) continue;
        const chapters = mmDataStore[subjectId] || [];
        for (let i = 0; i < chapters.length; i++) {
            const topics = (chapters[i] && chapters[i].topics) || [];
            for (let j = 0; j < topics.length; j++) {
                if (topics[j] && topics[j].id === topicId) {
                    return {
                        subjectId: subjectId,
                        chapterTitle: chapters[i].title,
                        chapterNumber: chapters[i].chapterNumber,
                        title: topics[j].title,
                        kind: topics[j].kind,
                        keyPoints: topics[j].keyPoints || [],
                        formula: topics[j].formula || "",
                        examTip: topics[j].examTip || "",
                        studyPage: topics[j].studyPage
                    };
                }
            }
        }
    }
    return null;
}

function practiceExpectedAnswer(question) {
    if (!question) return "";
    if (question.expectedAnswer) return question.expectedAnswer;
    /* A paper question stops here. Its own suggested answer may be empty -
     * SCENARIO and RECALL papers ship a marking note instead of an answer - and
     * falling through to `practiceStudyTopic` would quote the topic the question
     * was FILED under, which is not the same thing: caf1-gen-1's depreciation
     * question sits under "Not for Profit Organisations". Quoting it as the
     * expected answer would be a confident, wrong citation. */
    if (question.kind === "GENERATED_PAPER") return "";
    const topic = practiceStudyTopic(question.topicId);
    if (!topic) return "";
    const parts = [];
    if (topic.formula) parts.push("Formula: " + topic.formula);
    (topic.keyPoints || []).forEach(function (k) {
        if (typeof k === "string" && k.trim()) parts.push(k.trim());
    });
    return parts.join(" ").replace(/\s+/g, " ");
}

/* ============================================================ handwriting OCR
 * The spec forbids faking OCR, so there is no built-in "pretend" recogniser.
 * `setOCRProvider` / `getOCRProvider` wrap a real adapter that POSTs the image to an endpoint
 * the user supplies with their own key. A `manual` provider is also registered:
 * that is the student typing their answer, which is honest - it is labelled
 * MANUAL and is not presented as handwriting recognition.
 *
 * Configure with:
 *   setOCRProvider({ adapter: "rest", endpoint: "...", apiKey: "...",
 *                    fieldName: "image", responsePath: "data.text" })
 */

const OCR_MIN_CONFIDENCE = 0.55;

const OCR_ADAPTERS = {
    /* Generic JSON-over-HTTP adapter. `responsePath` is a dotted path into the
     * provider's JSON reply, so a specific vendor can be supported by config
     * alone rather than by writing another adapter. */
    rest: {
        name: "rest",
        describe: function (cfg) {
            return "HTTP OCR via " + (cfg.endpoint || "(no endpoint set)");
        },
        available: function (cfg) {
            return !!(cfg && cfg.endpoint);
        },
        transcribe: function (cfg, imageDataUrl) {
            const field = cfg.fieldName || "image";
            const body = {};
            body[field] = imageDataUrl;
            if (cfg.apiKey) body[cfg.apiKeyField || "key"] = cfg.apiKey;
            if (cfg.extraFields) {
                for (const k in cfg.extraFields) {
                    if (Object.prototype.hasOwnProperty.call(cfg.extraFields, k)) body[k] = cfg.extraFields[k];
                }
            }
            return fetch(cfg.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            }).then(function (res) {
                if (!res.ok) throw new Error("OCR endpoint returned HTTP " + res.status);
                return res.json();
            }).then(function (json) {
                const picked = practicePickPath(json, cfg.responsePath || "text");
                if (picked == null) throw new Error("OCR response did not contain " + (cfg.responsePath || "text"));
                return {
                    text: String(picked),
                    confidence: practicePickPath(json, cfg.confidencePath || "confidence"),
                    provider: cfg.name || "rest",
                    raw: json
                };
            });
        }
    },

    manual: {
        name: "manual",
        describe: function () { return "Typed answer (no handwriting recognition)"; },
        available: function () { return true; },
        transcribe: function (cfg, imageDataUrl) {
            return Promise.resolve({
                text: (cfg && cfg.typedText) || "",
                confidence: 1,
                provider: "manual",
                manual: true
            });
        }
    }
};

let OCR_ACTIVE = { adapter: "manual", config: {} };

function setOCRProvider(cfg) {
    OCR_ACTIVE = {
        adapter: (cfg && cfg.adapter) || "manual",
        config: cfg || {},
        name: (cfg && cfg.name) || (cfg && cfg.adapter) || "manual"
    };
    return OCR_ACTIVE;
}

function getOCRProvider() {
    const adapter = OCR_ADAPTERS[OCR_ACTIVE.adapter];
    if (!adapter) throw new Error("Unknown OCR adapter: " + OCR_ACTIVE.adapter);
    return {
        name: OCR_ACTIVE.name,
        adapter: adapter,
        /* `describe` is a function, matching `transcribe`. Returning the already-
         * formatted string here instead made every caller that reached for
         * provider.describe() throw "not a function". */
        describe: function () { return adapter.describe(OCR_ACTIVE.config); },
        available: adapter.available(OCR_ACTIVE.config),
        transcribe: function (imageDataUrl) {
            return adapter.transcribe(OCR_ACTIVE.config, imageDataUrl);
        }
    };
}

function practicePickPath(obj, path) {
    if (!path) return obj;
    const parts = String(path).split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
        if (cur == null) return null;
        const key = parts[i];
        if (Array.isArray(cur)) cur = cur[Number(key)];
        else cur = cur[key];
    }
    return cur;
}

/* Transcribe and normalise. A confidence we cannot interpret is treated as
 * unknown, not as zero, so a provider that omits the field is not silently
 * failed - but an unreadable result still blocks marking rather than guessing. */
function transcribeAnswer(imageDataUrl) {
    const provider = getOCRProvider();
    return provider.transcribe(imageDataUrl).then(function (res) {
        const raw = res.confidence;
        const conf = (typeof raw === "number" && isFinite(raw))
            ? (raw > 1 ? raw / 100 : raw)
            : null;
        return {
            text: practiceNormalize(res.text || ""),
            rawText: res.text || "",
            confidence: conf,
            provider: res.provider || provider.name,
            manual: !!res.manual,
            lowConfidence: conf === null ? false : conf < OCR_MIN_CONFIDENCE,
            empty: !(res.text || "").trim()
        };
    });
}

/* ============================================================== text handling */

const PRACTICE_STOPWORDS = ("a an the and or of for to in on at by with from is are was " +
    "were be been being has have had do does did will would shall should may might must " +
    "can could this that these those it its as if then than so such not no nor but per " +
    "into over under about after before also more most other some any all each both which " +
    "who whom whose what when where why how there their them they he she his her him").split(/\s+/);

function practiceNormalize(text) {
    return String(text || "")
        .replace(/\r/g, "\n")
        .replace(/[‐-―−]/g, "-")
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function practiceTokens(text) {
    const out = [];
    const seen = Object.create(null);
    const words = String(text || "").toLowerCase().match(/[a-z][a-z\-']{2,}/g) || [];
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (PRACTICE_STOPWORDS.indexOf(w) !== -1) continue;
        if (seen[w]) continue;
        seen[w] = 1;
        out.push(w);
    }
    return out;
}

/* OCR routinely turns rn into m, 0 into O, 1 into l. Matching on the raw string
 * would fail a correct answer for a mechanical reason, so both sides are folded
 * to a comparison form. This widens a match; it never narrows one, so it cannot
 * manufacture credit that a clean transcription would not have earned. */
function practiceFoldForMatch(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

const PRACTICE_NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;
const PRACTICE_OP_RE = /(?:[=+\-*/x×]\s*\d|\d\s*(?:=|x|×)\s*\d|\d\s*[-+]\s*\d|rs\.?\s*\d|\d\s*%)/i;
const PRACTICE_CAUSAL_RE = /\b(because|therefore|thus|hence|since|as a result|consequently|due to|so that|leads? to|results? in|owing to|reason(?:s)? for|which means|it follows)\b/i;
const PRACTICE_CONCLUDE_RE = /\b(therefore|in conclusion|conclusion|to conclude|advise|recommend|we can (?:conclude|say)|thus it (?:is|follows)|finally|overall)\b/i;
/* Global on purpose. This one is counted with `.match(...).length`, and a
 * non-global regex returns [first match, capture group] instead of every match:
 * `(^|\n)` guarantees a capture group, so "bullets" came back as exactly 2 for
 * ANY answer with a bullet in it and 0 for any answer without one. Full credit
 * (`bullets >= 3`) was therefore unreachable, and the 2-bullet tier was the
 * only tier that could ever fire - so every presentation criterion in the bank
 * was capped at 0.6 of its marks and nobody saw a failure, just slightly mean
 * marks. The causal and conclude regexes are counted the same way and are
 * copied per call with `new RegExp(..., "gi")` instead; this one has one caller,
 * so it carries the flag. */
const PRACTICE_STRUCTURE_RE = /(^|\n)\s*(?:[0-9]{1,2}[.)]\s|[-*•]\s|[A-Z][.)]\s|#{1,4}\s)|(?:^|\n)\s*[A-Z][A-Za-z ]{2,28}:\s*$|\|.*\|/g;

/* ============================================================== the marker */

const PRACTICE_REASON = {
    FULL: "FULL_CREDIT",
    PARTIAL: "PARTIAL_CREDIT",
    NONE: "NO_EVIDENCE",
    UNREADABLE: "TRANSCRIPTION_UNREADABLE",
    WRONG_OPTION: "WRONG_OPTION_SELECTED",
    CORRECT_OPTION: "CORRECT_OPTION_SELECTED"
};

/* Marks per point.
 *
 * This allocates a FRACTIONAL mark value to each piece of evidence, so the
 * criterion grades continuously. Integer marks-per-point looks more like a real
 * mark scheme but degenerates badly here: a 5-mark criterion carrying 8 evidence
 * terms gives floor(5/8) = 0 marks to the first three, so hitting 5 of 8
 * collected every mark and the criterion silently stopped being partial credit.
 * A candidate could answer half and be told they were right - which is the exact
 * failure the partial-marks requirement exists to prevent.
 *
 * Fractional allocation means full marks require every piece of evidence, and
 * any prefix of it earns a proportional share.
 */
function practicePointBudget(maxMarks, pointCount) {
    if (pointCount <= 0) return [];
    const each = maxMarks / pointCount;
    const out = new Array(pointCount);
    for (let i = 0; i < pointCount; i++) out[i] = each;
    return out;
}

function practiceScorePoints(maxMarks, terms, foldHaystack, rawHaystack) {
    const budget = practicePointBudget(maxMarks, terms.length);
    const matched = [];
    const missing = [];
    let running = 0;

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        const needle = practiceFoldForMatch(term);
        // long enough to be specific; a 3-letter fragment would match noise
        const hit = needle.length >= 4 && foldHaystack.indexOf(needle) !== -1;
        if (hit) {
            running += budget[i];
            matched.push(term);
        } else {
            missing.push(term);
        }
    }
    return {
        awarded: Math.min(maxMarks, running),
        matched: matched,
        missing: missing,
        pointMarks: terms.map(function (t, i) {
            return matched.indexOf(t) === -1 ? 0 : budget[i];
        }),
        rawUsed: rawHaystack
    };
}

/* Structural criteria: does the answer behave like the thing being assessed? These
 * never consult term lists, so a candidate cannot pass them by parroting. */
function practiceScoreWorking(maxMarks, rawText) {
    const lines = String(rawText).split(/\n+/).map(function (l) { return l.trim(); })
        .filter(function (l) { return l.length > 0; });
    let workingLines = 0;
    let hasFinal = false;
    for (let i = 0; i < lines.length; i++) {
        const nums = lines[i].match(PRACTICE_NUMBER_RE);
        if (nums && nums.length >= 2 && PRACTICE_OP_RE.test(lines[i])) workingLines++;
        if (PRACTICE_OP_RE.test(lines[i]) && nums) hasFinal = true;
    }
    // One line of arithmetic is the minimum credit; three or more is full marks.
    let ratio = 0;
    if (workingLines >= 3) ratio = 1;
    else if (workingLines === 2) ratio = 0.67;
    else if (workingLines === 1) ratio = 0.34;
    // A concluding figure: one written after an equals sign, after an answer
    // word ("total 48,500"), or after "Rs.". The `=` used to sit inside a `\b`
    // alternation, where it can never match - a word boundary either side of a
    // non-word character does not exist - so "charge = 67,500" was read as an
    // answer with no figure in it, the bonus never fired, and the candidate was
    // told the answer had "no concluding figure stated".
    const hasAnswerFigure =
        /(?:[=:]\s*-?\d[\d,]*(?:\.\d+)?|\b(?:answer|total|therefore|thus)\b[^0-9]{0,12}-?\d[\d,]*(?:\.\d+)?|\bRs\.?\s*\d[\d,]*(?:\.\d+)?)/i
            .test(rawText);
    let awarded = ratio * maxMarks;
    if (hasFinal && hasAnswerFigure) awarded = Math.min(maxMarks, awarded + maxMarks * 0.2);
    return {
        awarded: Math.min(maxMarks, Math.round(awarded * 100) / 100),
        matched: [workingLines + " arithmetic line(s)"],
        missing: hasAnswerFigure ? [] : ["no concluding figure stated"],
        pointMarks: []
    };
}

function practiceScoreCausal(maxMarks, rawText) {
    const hits = String(rawText).match(new RegExp(PRACTICE_CAUSAL_RE, "gi")) || [];
    const n = hits.length;
    const ratio = n >= 2 ? 1 : (n === 1 ? 0.5 : 0);
    return {
        awarded: maxMarks * ratio,
        matched: hits.slice(0, 6),
        missing: n ? [] : ["no causal connective used"],
        pointMarks: []
    };
}

function practiceScoreConclusion(maxMarks, rawText) {
    const m = String(rawText).match(new RegExp(PRACTICE_CONCLUDE_RE, "gi")) || [];
    const ratio = m.length >= 1 ? 1 : 0;
    return {
        awarded: maxMarks * ratio,
        matched: m.slice(0, 4),
        missing: ratio ? [] : ["no conclusion stated"],
        pointMarks: []
    };
}

function practiceScoreStructure(maxMarks, rawText) {
    const lines = String(rawText).split(/\n+/).filter(function (l) { return l.trim().length; });
    const bullets = (String(rawText).match(PRACTICE_STRUCTURE_RE) || []).length;
    const words = String(rawText).trim().split(/\s+/).filter(Boolean).length;
    // Structure is judged on legible organisation, not on being long: a tidy
    // five-line answer outscores a dense unreadable paragraph, and neither is
    // rewarded for padding.
    let ratio = 0;
    if (bullets >= 3) ratio = 1;
    else if (bullets === 2) ratio = 0.6;
    else if (bullets === 1) ratio = 0.3;
    else if (lines.length >= 4 && words >= 60) ratio = 0.4;
    else if (words >= 25) ratio = 0.15;
    return {
        awarded: maxMarks * ratio,
        matched: bullets ? [bullets + " structured line(s)"] : [lines.length + " line(s)"],
        missing: ratio >= 1 ? [] : ["answer not laid out in a readable structure"],
        pointMarks: []
    };
}

function practiceScoreAdjustment(maxMarks, terms, rawText, foldHaystack) {
    const base = practiceScorePoints(maxMarks, terms, foldHaystack, rawText);
    const says = /\b(adjust\w*|correct\w*|revis\w*|overstat\w*|understat\w*|err(or|one)|omitt\w*)\b/i.test(rawText);
    /* NOT `PRACTICE_NUMBER_RE.test(rawText)`. That regex is global so that
     * `.match()` returns every figure, and `.test()` on a global regex is
     * stateful: it starts at lastIndex, advances it on a hit, and carries that
     * position into the next call. The first adjustment criterion marked in a
     * session got the quantification bonus and later ones silently did not,
     * because by then lastIndex sat past the figure in their answer. A match
     * resets the index and answers the same question. */
    const quantified = String(rawText).match(PRACTICE_NUMBER_RE) !== null;
    if (base.awarded === 0 && (says || quantified)) {
        // Recognised that something needs changing but never named the point.
        return {
            awarded: maxMarks * 0.25,
            matched: base.matched.concat(says ? ["adjustment implied"] : []),
            missing: base.missing,
            pointMarks: []
        };
    }
    if (base.awarded > 0 && quantified) {
        base.awarded = Math.min(maxMarks, base.awarded + maxMarks * 0.15);
        base.matched = base.matched.concat(["adjustment quantified"]);
    }
    return base;
}

/* The facts a candidate is expected to engage: the paper's own entity and the
 * figures it states. This is the evidence channel for "Applies it to the
 * specific facts stated, not in general terms" - a criterion worth up to 5
 * marks in every SCENARIO question, and one no word list drawn from the
 * criterion itself could judge, because that criterion names no content at all.
 *
 * Reading the answer for the question's own facts is what "applies it to the
 * facts" means. It is evidence from the paper, not from an answer key: these
 * papers carry no suggested answer for SCENARIO questions, only the rubric.
 */
function practiceQuestionAnchors(text) {
    const t = String(text || "");
    const out = [];
    const seen = {};
    function push(kind, raw) {
        if (out.length >= 5) return;
        const key = kind + ":" + raw;
        if (seen[key]) return;
        seen[key] = 1;
        out.push({ kind: kind, raw: raw });
    }

    /* Figures first, and only figures if the paper states any: the specific
     * facts in a scenario question are its numbers ("borrowing costs of
     * Rs. 220,000", "net assets of Rs. 80,000"), and an answer applying the
     * rule to those facts restates them. Four digits or more, and not a year -
     * "year ended 31 December 2026" is context, not a fact an answer has to
     * quote, and requiring it would cost every candidate a mark for nothing. */
    const nums = t.match(/\b\d[\d,]{3,}\b/g) || [];
    nums.forEach(function (n) {
        const digits = n.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
        if (digits.length < 4) return;
        if (digits.length === 4 && +digits >= 1900 && +digits <= 2100) return;
        push("figure", digits);
    });

    /* Entity codes only where there are no figures to read. The stems write
     * "Thornbury Textiles (TL)", but a candidate who answers "the company" has
     * still applied the rule to the facts, so the code is a fallback signal
     * rather than a requirement. */
    if (!out.length) {
        const codes = t.match(/\(([A-Z]{2,4})\)/g) || [];
        codes.forEach(function (c) { push("entity", c.replace(/[()]/g, "")); });
    }
    return out;
}

function practiceScoreAppliedFacts(maxMarks, anchors, rawText) {
    if (!anchors || !anchors.length) {
        // Nothing to anchor on. Judge the answer on its organisation rather
        // than awarding zero for a criterion the paper gave us no facts to read.
        return practiceScoreStructure(maxMarks, rawText);
    }
    const ans = String(rawText || "");
    // Non-digits collapse to a SPACE, not to nothing. Stripping them outright
    // glues every figure in the answer into one run of digits, after which
    // "220,000" sits between two neighbours that are digits and the boundary
    // test below rejects it: a correct answer scored 0/3 on the one criterion
    // that was supposed to reward it. Thousands separators are removed first,
    // or the comma would split its own figure in half (220,000 -> "220 000").
    const digits = ans.replace(/(\d),(?=\d)/g, "$1").replace(/[^0-9]+/g, " ");
    const matched = [];
    const missing = [];
    anchors.forEach(function (a) {
        let hit = false;
        if (a.kind === "entity") {
            hit = new RegExp("\\b" + a.raw + "\\b").test(ans);
        } else {
            // Figures are compared digit-for-digit with non-digit boundaries on
            // both sides, so 220,000 is not credited by an answer that says
            // 1,220,000 and 50,000 is not credited by 150,000.
            let at = digits.indexOf(a.raw);
            while (at !== -1) {
                const before = at > 0 ? digits.charAt(at - 1) : "";
                const after = digits.charAt(at + a.raw.length);
                if (!/[0-9]/.test(before) && !/[0-9]/.test(after)) { hit = true; break; }
                at = digits.indexOf(a.raw, at + 1);
            }
        }
        if (hit) matched.push(a.raw); else missing.push(a.raw);
    });
    const ratio = matched.length / anchors.length;
    return {
        awarded: Math.round(maxMarks * ratio * 100) / 100,
        matched: matched,
        missing: missing,
        pointMarks: []
    };
}

/* One criterion -> one awarded figure, one status, one audit record. */
function practiceScoreCriterion(criterion, ctx) {
    const maxMarks = criterion.maxMarks || 0;
    const audit = {
        criterionId: criterion.id,
        label: criterion.label || criterion.id,
        maxMarks: maxMarks,
        evidence: criterion.evidence,
        errorType: criterion.errorType,
        awarded: 0,
        status: PRACTICE_REASON.NONE,
        matched: [],
        missing: []
    };

    if (maxMarks <= 0) return audit;

    // An unreadable transcription earns nothing and is declared, rather than
    // being scored against evidence that was never captured.
    if (ctx.unreadable) {
        audit.awarded = 0;
        audit.status = PRACTICE_REASON.UNREADABLE;
        audit.note = ctx.unreadableReason || "transcription unavailable";
        return audit;
    }

    let res;
    switch (criterion.evidence) {
        case "numericLines":
            res = practiceScoreWorking(maxMarks, ctx.rawText);
            break;
        case "appliedFacts":
            res = practiceScoreAppliedFacts(maxMarks, ctx.anchors, ctx.rawText);
            break;
        case "reasonTerms":
            res = practiceScoreCausal(maxMarks, ctx.rawText);
            break;
        case "concludeTerms":
            res = practiceScoreConclusion(maxMarks, ctx.rawText);
            break;
        case "structureTerms":
            res = practiceScoreStructure(maxMarks, ctx.rawText);
            break;
        case "adjustTerms":
            res = practiceScoreAdjustment(
                maxMarks, ctx.termsFor(criterion.id) || ["adjust", "correction", "error"],
                ctx.rawText, ctx.fold);
            break;
        case "formulaTerms":
        case "keyPointTerms":
        default: {
            const terms = ctx.termsFor(criterion.id) || [];
            if (!terms.length) {
                // No evidence list means we cannot judge it. Say so instead of
                // awarding a mark we cannot justify.
                audit.awarded = 0;
                audit.status = PRACTICE_REASON.NONE;
                audit.note = "no evidence list recorded for this criterion";
                return audit;
            }
            res = practiceScorePoints(maxMarks, terms, ctx.fold, ctx.rawText);
            break;
        }
    }

    audit.awarded = Math.round(Math.min(maxMarks, Math.max(0, res.awarded)) * 100) / 100;
    audit.matched = res.matched || [];
    audit.missing = res.missing || [];
    if (audit.awarded >= maxMarks) audit.status = PRACTICE_REASON.FULL;
    else if (audit.awarded > 0) audit.status = PRACTICE_REASON.PARTIAL;
    else audit.status = PRACTICE_REASON.NONE;
    return audit;
}

/* MCQ: the examiner's letters are official, so this is an exact comparison and
 * gets no partial credit - there is nothing between right and wrong here. */
function practiceMarkMCQ(question, selected) {
    const official = question.mcqAnswers || {};
    const keys = Object.keys(official);
    if (!keys.length) return null;
    // `selected` is a map of item -> chosen option letter, so the lookup has to
    // be per item. Stringifying the whole map compares the answer sheet against
    // itself and marks a fully correct set as 0.
    const picks = selected || {};
    const rows = keys.map(function (k) {
        const raw = picks[k];
        const chosen = (raw === undefined || raw === null || raw === "") ? null
            : String(raw).trim().toLowerCase();
        const correct = official[k].toLowerCase();
        const isRight = chosen === correct;
        return {
            item: k,
            correctOption: correct,
            selectedOption: chosen,
            outcome: chosen === null ? "NOT_ANSWERED"
                : (isRight ? PRACTICE_REASON.CORRECT_OPTION : PRACTICE_REASON.WRONG_OPTION)
        };
    });
    const right = rows.filter(function (r) { return r.outcome === PRACTICE_REASON.CORRECT_OPTION; }).length;
    const total = question.marks || keys.length;
    const awarded = total * (right / keys.length);
    return {
        awarded: Math.round(awarded * 100) / 100,
        maxMarks: total,
        right: right,
        itemCount: keys.length,
        rows: rows,
        status: right === keys.length ? PRACTICE_REASON.FULL
            : (right > 0 ? PRACTICE_REASON.PARTIAL : PRACTICE_REASON.NONE)
    };
}

/* Mark one question. Returns the award plus the full audit trail. */
function practiceMarkQuestion(question, transcription) {
    const result = {
        questionId: question.id,
        kind: question.kind,
        marks: question.marks,
        rubricType: question.rubricType,
        criteria: [],
        awarded: 0,
        maxMarks: question.marks,
        unreadable: false,
        warnings: []
    };

    if (!question) return result;

    // --- objective: exact comparison against the examiner's own letters -------
    if (question.kind === "OFFICIAL_PAST_PAPER" && question.mcqAnswers
            && Object.keys(question.mcqAnswers).length) {
        const mcq = practiceMarkMCQ(question, transcription && transcription.selectedOptions);
        if (mcq) {
            result.mcq = mcq;
            result.awarded = mcq.awarded;
            result.status = mcq.status;
            return result;
        }
    }

    const rawText = (transcription && transcription.rawText) || transcription.text || "";
    const conf = transcription ? transcription.confidence : null;

    // --- can we honestly read this at all? ---------------------------------
    let unreadableReason = null;
    if (!rawText || !rawText.trim()) {
        unreadableReason = "no readable text was captured";
    } else if (transcription && transcription.lowConfidence) {
        unreadableReason = "transcription confidence " +
            (conf === null ? "unknown" : Math.round(conf * 100) + "%") + " is below the "
            + Math.round(OCR_MIN_CONFIDENCE * 100) + "% floor";
    }
    result.unreadable = !!unreadableReason;

    // Evidence terms live in one of two places, and both have to be read: the
    // practice bank keeps a per-question map keyed by criterion id, while a
    // paper question carries its terms on the criterion itself, built from the
    // criterion's own wording and the requirement material its stem prints.
    const termsById = {};
    (question.criteria || []).forEach(function (c) {
        if (c.terms && c.terms.length) termsById[c.id] = c.terms;
    });
    Object.keys(question.evidenceTerms || {}).forEach(function (k) {
        if (!termsById[k]) termsById[k] = question.evidenceTerms[k];
    });

    const ctx = {
        rawText: rawText,
        fold: practiceFoldForMatch(rawText),
        // The facts this question states - the evidence for `appliedFacts`.
        anchors: practiceQuestionAnchors(question.text),
        unreadable: result.unreadable,
        unreadableReason: unreadableReason,
        termsFor: function (criterionId) {
            return termsById[criterionId] || [];
        }
    };

    let awarded = 0;
    (question.criteria || []).forEach(function (c) {
        const audit = practiceScoreCriterion(c, ctx);
        result.criteria.push(audit);
        if (audit.awarded > 0) awarded += audit.awarded;
    });

    // A criterion marked UNREADABLE blocks the whole question from claiming a
    // clean result - the student is told to retype rather than shown a low score
    // that reads like a wrong answer.
    if (result.unreadable) {
        result.awarded = 0;
        result.status = PRACTICE_REASON.UNREADABLE;
        result.note = unreadableReason;
    } else {
        result.awarded = Math.round(Math.min(question.marks, awarded) * 100) / 100;
        const pct = question.marks ? result.awarded / question.marks : 0;
        result.status = pct >= 0.999 ? PRACTICE_REASON.FULL
            : (pct > 0 ? PRACTICE_REASON.PARTIAL : PRACTICE_REASON.NONE);
    }

    result.percent = question.marks ? Math.round(result.awarded / question.marks * 100) : 0;
    // Read from the AUDIT records, not from the rubric. The rubric entries have
    // no `awarded` field, so filtering on them compares undefined against a
    // number, is always false, and silently empties the mistake book.
    result.errorsLost = result.criteria.filter(function (c) {
        return c.awarded < c.maxMarks;
    }).map(function (c) {
        return {
            errorType: c.errorType,
            criterionId: c.criterionId,
            marksLost: Math.round((c.maxMarks - c.awarded) * 100) / 100,
            missingEvidence: c.missing || [],
            matchedEvidence: c.matched || []
        };
    });
    return result;
}

/* ================================================================ the session */

/* The chapter a question belongs to.
 *
 * The runtime bank row carries `topicId` and not `chapterId`, so the chapter is
 * derived: a topic id is always `<subject>-ch<N>-t<M>`. Every one of the 689
 * generated questions matches that shape; the 61 official past-paper questions
 * carry no topicId at all, which is why the chapter control is disabled for
 * that source rather than quietly returning nothing. */
function practiceChapterId(question) {
    if (!question) return "";
    if (question.chapterId) return question.chapterId;
    const m = String(question.topicId || "").match(/^(.*)-t\d+$/);
    return m ? m[1] : "";
}

/* Every question a set of options can reach, in draw order.
 *
 * Split out of `practiceSelectQuestions` so the setup screen counts the SAME
 * pool the session is drawn from. When these were one function the count beside
 * a subject came from `bySubject` while the draw used a focus filter, and the
 * two could not both be right. */
function practiceSelectPool(opts) {
    const o = opts || {};
    const bank = practiceIndexBank();
    if (!bank) return [];
    let pool = o.kind === "OFFICIAL_PAST_PAPER" ? bank.official : bank.generated;
    if (o.subjectId) {
        /* Resolve the subject through its row so `caf4v1` reaches the bank's
         * `caf4` questions. Comparing `q.subjectId === o.subjectId` matched
         * nothing for Business Law Vol 1, so a subject the dropdown had just
         * offered came back as "nothing selected". */
        const row = (typeof practiceCentreSubjectFor === "function")
            ? practiceCentreSubjectFor(o.subjectId) : null;
        const want = row ? row.bankIds : [o.subjectId];
        pool = pool.filter(function (q) { return want.indexOf(q.subjectId) !== -1; });
    }
    if (o.difficulty) {
        pool = pool.filter(function (q) { return q.difficulty === o.difficulty; });
    }
    if (o.type) {
        pool = pool.filter(function (q) { return q.type === o.type; });
    }
    /* A focus source narrows the pool to the subjects and question types it
     * names. Read from `kind` rather than passed as a separate option, so every
     * caller - the setup form, "where am I weak?", a restored session - gets the
     * same narrowing by construction rather than by remembering to pass it. */
    const focus = (typeof practiceCentreFocusById === "function")
        ? practiceCentreFocusById(o.kind) : null;
    if (focus) {
        const want = {};
        focus.subjects.forEach(function (s) {
            const r = practiceCentreSubjectFor(s);
            (r ? r.bankIds : [s]).forEach(function (b) { want[b] = true; });
        });
        pool = pool.filter(function (q) {
            return !!want[q.subjectId] && focus.types.indexOf(q.type) !== -1;
        });
    }
    /* A chapter narrows further. Applied after the focus filter, so a chapter
     * inside a focus source yields that chapter's focus questions and not the
     * subject's whole set. */
    if (o.chapterId) {
        pool = pool.filter(function (q) { return practiceChapterId(q) === o.chapterId; });
    }
    // Weighted draw: study-time-appropriate questions first, but with genuine
    // variety so a session is not five definition questions in a row.
    const order = { FOUNDATION: 0, APPLICATION: 1, ADVANCED: 2, EXAM_LEVEL: 3 };
    pool = pool.slice().sort(function (a, b) {
        const d = (order[a.difficulty] === undefined ? 9 : order[a.difficulty])
            - (order[b.difficulty] === undefined ? 9 : order[b.difficulty]);
        if (d) return d;
        return a.marks - b.marks;
    });

    /* A focus source naming more than one type has to actually deliver more than
     * one type. The sort above orders by marks, and every numerical question is
     * shorter than every scenario one - so "numerical and scenario" drew five
     * numericals while its own note promised a mix. Weave the types together
     * once the difficulty order is fixed, so variety does not become a session
     * of five computations that differ only in their figures.
     *
     * Interleaved by type only; within a type the difficulty order stands. */
    if (focus && focus.types.length > 1) {
        const buckets = {};
        focus.types.forEach(function (t) { buckets[t] = []; });
        const rest = [];
        pool.forEach(function (q) {
            if (buckets[q.type]) buckets[q.type].push(q);
            else rest.push(q);
        });
        const longest = focus.types.reduce(function (m, t) {
            return Math.max(m, buckets[t].length);
        }, 0);
        const woven = [];
        for (let i = 0; i < longest; i++) {
            focus.types.forEach(function (t) {
                if (buckets[t][i]) woven.push(buckets[t][i]);
            });
        }
        woven.push.apply(woven, rest);
        pool = woven;
    }
    return pool;
}

function practiceSelectQuestions(opts) {
    const o = opts || {};
    const pool = practiceSelectPool(o);
    if (!pool.length && !practiceIndexBank()) return [];

    const want = o.count || 10;
    const out = [];
    const usedTopic = {};
    for (let pass = 0; pass < 3 && out.length < want; pass++) {
        for (let i = 0; i < pool.length && out.length < want; i++) {
            const q = pool[i];
            if (out.indexOf(q) !== -1) continue;
            if (pass > 0 && usedTopic[q.topicId || q.id]) continue;
            usedTopic[q.topicId || q.id] = 1;
            out.push(q);
        }
    }
    return out;
}

function practiceCreateSession(opts) {
    const o = opts || {};
    const questions = o.questions || practiceSelectQuestions(o);
    return {
        version: PRACTICE_ENGINE_VERSION,
        sessionId: "ps-" + Date.now().toString(36),
        subjectId: o.subjectId || null,
        label: o.label || "Practice session",
        mode: o.kind === "OFFICIAL_PAST_PAPER" ? "PAST_PAPER"
            : (o.kind === "GENERATED_PAPER" ? "GENERATED_PAPER" : "GENERATED_PRACTICE"),
        // Which paper a GENERATED_PAPER session is sitting, so the summary and
        // anything exported from it can name the paper rather than infer it
        // from the first question's id.
        paperId: o.paperId || null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        ocrProvider: getOCRProvider().name,
        questions: questions.map(function (q) {
            return { id: q.id, marks: q.marks, status: "unanswered" };
        }),
        answers: {},
        results: [],
        totals: null
    };
}

/* Answer view. Deliberately carries NO expected answer, no rubrics and no key
 * material - only what a candidate is allowed to see mid-attempt. */
function practiceQuestionView(session, questionId) {
    const bank = practiceIndexBank();
    if (!bank) return null;
    const q = bank.all.filter(function (x) { return x.id === questionId; })[0];
    if (!q) return null;
    const isOfficialMCQ = q.kind === "OFFICIAL_PAST_PAPER"
        && !!(q.mcqAnswers && Object.keys(q.mcqAnswers).length);
    return {
        id: q.id,
        kind: q.kind,
        subjectId: q.subjectId,
        type: q.type,
        difficulty: q.difficulty || null,
        text: q.text,
        marks: q.marks,
        estimatedMinutes: q.minutes || null,
        isObjective: isOfficialMCQ,
        criteriaCount: (q.criteria || []).length,
        sourceLabel: q.kind === "GENERATED_PRACTICE"
            ? "Practice question generated from the CAF study text"
            : (q.kind === "GENERATED_PAPER"
                ? "Question from a generated practice paper - not an ICAP past paper"
                : "Official ICAP past-paper question"),
        // Where the question sits in its paper. Useful on screen ("Section B,
        // question 3 of 8") and never answer material.
        paperId: q.kind === "GENERATED_PAPER" ? q.paperId : undefined,
        paperQuestionNumber: q.kind === "GENERATED_PAPER" ? q.questionNumber : undefined,
        paperSection: q.kind === "GENERATED_PAPER" ? q.section : undefined,
        // Only official Section A items carry the parsed item set - the stems and
        // option text that make the examiner's letters answerable. A generated
        // practice MCQ is a single question with A/B/C/D options; an official
        // Section A is multiple items keyed by roman numeral, each with its own
        // options. Without this the UI could only show the section banner.
        mcqItems: isOfficialMCQ ? (q.mcqItems || []) : undefined,
    };
}

/* Post-attempt view: the only place expected answers and evidence appear. */
function practiceFeedback(session, questionId) {
    const bank = practiceIndexBank();
    if (!bank) return null;
    const q = bank.all.filter(function (x) { return x.id === questionId; })[0];
    const result = (session.results || []).filter(function (r) { return r.questionId === questionId; })[0];
    if (!q || !result) return null;
    return {
        questionId: q.id,
        questionText: q.text,
        kind: q.kind,
        rubricType: q.rubricType,
        sourceLabel: q.kind === "GENERATED_PRACTICE"
            ? "Practice question generated from the CAF study text"
            : (q.kind === "GENERATED_PAPER"
                ? "Question from a generated practice paper - not an ICAP past paper"
                : "Official ICAP past-paper question with the ICAP suggested answer"),
        criteria: (q.criteria || []).map(function (c) {
            const audit = (result.criteria || []).filter(function (a) {
                return a.criterionId === c.id;
            })[0];
            return {
                criterionId: c.id,
                label: c.label || c.id,
                maxMarks: c.maxMarks,
                awarded: audit ? audit.awarded : 0,
                status: audit ? audit.status : PRACTICE_REASON.NONE,
                matchedEvidence: audit ? audit.matched : [],
                missingEvidence: audit ? audit.missing : [],
                errorType: c.errorType
            };
        }),
        awarded: result.awarded,
        marks: q.marks,
        percent: result.percent,
        unreadable: result.unreadable,
        note: result.note || null,
        expectedAnswer: practiceExpectedAnswer(q),
        // What the paper itself supplies beyond the rubric: the model workings
        // for a NUMERICAL question, and the note a SCENARIO/RECALL paper prints
        // where it has no suggested answer to give.
        workings: q.workings || "",
        markingNote: q.markingNote || "",
        grounding: q.grounding || null,
        paperId: q.paperId || null,
        studySource: q.topicId ? practiceStudyTopic(q.topicId) : null,
        examTip: (q.topicId && practiceStudyTopic(q.topicId) || {}).examTip || null,
        disclaimer: q.kind === "GENERATED_PAPER"
            ? "Practice rubric carried with the generated paper. The paper is not an ICAP past paper and this is not an official ICAP marking plan."
            : (q.rubricType === "PRACTICE_RUBRIC"
            ? "Practice rubric shaped from this subject's real papers. Not an official ICAP marking plan."
            : (q.rubricType === "OFFICIAL_MARKING_PLAN"
                ? "The option letters are the examiner's own."
                : "Practice rubric. Not an official ICAP marking plan."))
    };
}

function practiceSubmit(session, questionId, transcription) {
    const bank = practiceIndexBank();
    if (!bank || !session) return null;
    const q = bank.all.filter(function (x) { return x.id === questionId; })[0];
    if (!q) return null;
    const result = practiceMarkQuestion(q, transcription);
    session.results = (session.results || []).filter(function (r) {
        return r.questionId !== questionId;
    });
    session.results.push(result);
    session.answers[questionId] = {
        text: (transcription && transcription.text) || "",
        confidence: transcription ? transcription.confidence : null,
        provider: transcription ? transcription.provider : null,
        manual: transcription ? !!transcription.manual : null,
        submittedAt: new Date().toISOString()
    };
    const meta = (session.questions || []).filter(function (x) { return x.id === questionId; })[0];
    if (meta) meta.status = "answered";
    return result;
}

function practiceFinish(session) {
    if (!session) return null;
    const results = session.results || [];
    const marks = results.reduce(function (a, r) { return a + (r.maxMarks || 0); }, 0);
    const awarded = results.reduce(function (a, r) { return a + (r.awarded || 0); }, 0);
    const unreadable = results.filter(function (r) { return r.unreadable; }).length;
    session.finishedAt = new Date().toISOString();
    session.totals = {
        questions: results.length,
        awarded: Math.round(awarded * 100) / 100,
        marks: Math.round(marks * 100) / 100,
        percent: marks ? Math.round(awarded / marks * 1000) / 10 : 0,
        unreadable: unreadable,
        byDifficulty: {}
    };
    const bank = practiceIndexBank();
    (bank ? bank.all : []).forEach(function (q) {
        if (!q.difficulty) return;
        const r = results.filter(function (x) { return x.questionId === q.id; })[0];
        if (!r) return;
        const b = session.totals.byDifficulty[q.difficulty] ||
            (session.totals.byDifficulty[q.difficulty] = { awarded: 0, marks: 0, count: 0 });
        b.awarded += r.awarded || 0;
        b.marks += r.maxMarks || 0;
        b.count += 1;
    });
    Object.keys(session.totals.byDifficulty).forEach(function (k) {
        const b = session.totals.byDifficulty[k];
        b.percent = b.marks ? Math.round(b.awarded / b.marks * 1000) / 10 : 0;
        b.awarded = Math.round(b.awarded * 100) / 100;
    });
    return session;
}

/* =============================================================== mistake book
 * Aggregated from results, keyed by the error taxonomy so a student sees
 * "missing workings" as a pattern rather than as one bad question at a time. */

function practiceMistakeBook(sessions) {
    const tally = {};
    let items = 0;
    (sessions || []).forEach(function (s) {
        (s.results || []).forEach(function (r) {
            (r.errorsLost || []).forEach(function (e) {
                const key = e.errorType + "::" + e.criterionId;
                const t = tally[key] || (tally[key] = {
                    errorType: e.errorType,
                    criterionId: e.criterionId,
                    occurrences: 0,
                    marksLost: 0,
                    questions: {}
                });
                t.occurrences += 1;
                t.marksLost += e.marksLost || 0;
                t.questions[r.questionId] = true;
                items += 1;
            });
        });
    });
    const out = Object.keys(tally).map(function (k) {
        const t = tally[k];
        t.marksLost = Math.round(t.marksLost * 100) / 100;
        t.questionCount = Object.keys(t.questions).length;
        delete t.questions;
        return t;
    });
    out.sort(function (a, b) { return b.marksLost - a.marksLost || b.occurrences - a.occurrences; });
    return { totalErrorInstances: items, entries: out };
}

/* ==== weakness and recommendation (phase 15) ================================
 *
 * Two jobs: say what is weak, and say what to do next. Both are one pure
 * function - persisted sessions and the question index in, a report out - so
 * the screen is only a rendering of it and the same numbers can be checked
 * outside the browser.
 *
 * The rule that matters is the threshold. One badly answered question is not a
 * weakness: the candidate met the topic once, and calling it weak sends them to
 * revise material they may already hold while the real gap sits elsewhere. So
 * every row carries how many DISTINCT questions it was built from, anything
 * below PRACTICE_WEAK_MIN_ATTEMPTS is verdicted INSUFFICIENT_EVIDENCE, and the
 * only recommendation below that line is "answer more of these" - never
 * "revise this".
 *
 * Verdicts are therefore made at CHAPTER level, because this bank files one
 * generated question per topic: a topic cannot reach three attempts on its own,
 * so judging it would be judging a single answer. Chapters hold a median of
 * five questions and 111 of 127 hold three or more, which is enough to say
 * something. Topic rows are still reported - individually, with their score -
 * and read INSUFFICIENT_EVIDENCE almost every time, which is the truth.
 *
 * The recommendations are this app's own next steps rather than advice it
 * cannot keep: a study topic that exists in the mind maps, questions that have
 * NOT been attempted (counted from the bank, so the number is real), or the
 * subject's own generated paper - and never a paper to a candidate who is
 * failing that subject, which would only burn one. The hints are exam
 * technique: no tax rate, no treatment, no legal position, so none of them can
 * go stale when the law moves.
 */
const PRACTICE_WEAK_MIN_ATTEMPTS = 3;
const PRACTICE_WEAK_AT = 60;      /* below this a topic is weak */
const PRACTICE_WEAK_OK_AT = 80;   /* below this a topic is still developing */

const PRACTICE_ERROR_HINTS = {
    MISSING_POINT: "Name the requirement or rule before you apply it - a point with nothing behind it earns little.",
    CALCULATION_ERROR: "Write every arithmetic line and check the last one against the figure the question gave you.",
    WRONG_FORMULA: "Say which formula you are using and why it fits, then put the numbers into it.",
    WRONG_FINAL_ANSWER: "Carry the working through to a final figure and label it.",
    MISSING_WORKING: "Show the working. A right answer with no lines reads as luck and is marked as such.",
    MISSING_ADJUSTMENT: "You have recognised the adjustment but not quantified it - state the amount and where it lands.",
    POOR_REASONING: "Explain why: because, therefore, so that. The link is what the marks are for.",
    MISSING_CONCLUSION: "End with the answer - the figure, the recommendation, the resulting position.",
    PRESENTATION_ERROR: "One idea to a line and every figure labelled. If it cannot be read it cannot be marked.",
    APPLICATION_ERROR: "Quote the question's own facts and figures back at it instead of answering in general terms.",
    WRONG_TREATMENT: "The treatment does not fit the facts given - re-read those facts and match the rule to them.",
    WRONG_OPTION: "Objective items are marked on the examiner's own letters with no partial credit: read every option before committing.",
    NOT_ANSWERED: "Left blank. Even naming the requirement earns marks, so attempt it."
};

/* Verdict on the EVIDENCE, not on the score. `attempted` is the count of
 * distinct questions behind the percentage, so one lucky or one terrible answer
 * cannot produce a verdict at all. */
function practiceVerdictFor(attempted, percent) {
    if (!(attempted >= PRACTICE_WEAK_MIN_ATTEMPTS)) return "INSUFFICIENT_EVIDENCE";
    if (percent < PRACTICE_WEAK_AT) return "WEAK";
    if (percent < PRACTICE_WEAK_OK_AT) return "DEVELOPING";
    return "STRONG";
}

/* One pass over the study text: topic id -> the chapter it sits in. The bank
 * holds ONE generated question per topic, so a topic can never carry enough
 * attempts to be judged on its own; the chapter is the smallest unit that can.
 * Resolved once here rather than per attempt, and a topic the study text does
 * not know becomes its own chapter rather than disappearing - dropping it
 * would quietly shrink a candidate's history. */
function practiceChapterIndex() {
    const map = {};
    if (typeof mmDataStore === "undefined" || !mmDataStore) return map;
    for (const subjectId in mmDataStore) {
        if (!Object.prototype.hasOwnProperty.call(mmDataStore, subjectId)) continue;
        const chapters = mmDataStore[subjectId] || [];
        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            if (!ch) continue;
            const topics = ch.topics || [];
            for (let j = 0; j < topics.length; j++) {
                if (topics[j] && topics[j].id) {
                    map[topics[j].id] = {
                        key: subjectId + "::ch" + ch.chapterNumber,
                        title: "Ch " + ch.chapterNumber + " - " + ch.title,
                        subjectId: subjectId,
                        chapterNumber: ch.chapterNumber,
                        chapterTitle: ch.title,
                        topicTitle: topics[j].title
                    };
                }
            }
        }
    }
    return map;
}

function practiceWeaknessReport(sessions, bank, opts) {
    const o = opts || {};
    const subjectLabel = typeof o.subjectLabel === "function" ? o.subjectLabel
        : function (id) { return id; };
    const out = {
        sessions: (sessions || []).length,
        attempted: 0,
        awarded: 0,
        possible: 0,
        percent: 0,
        unreadable: 0,
        objectiveAttempts: 0,
        subjects: [],
        chapters: [],
        topics: [],
        types: [],
        errors: [],
        verdicts: { WEAK: 0, DEVELOPING: 0, STRONG: 0, INSUFFICIENT_EVIDENCE: 0 },
        insufficient: [],
        insufficientTopics: 0,
        recommendations: []
    };
    if (!bank || !(bank.all || []).length) return out;

    /* The pools are counted from the bank so a recommendation can say how many
     * questions are actually left, rather than "practise more". */
    const byId = {};
    const chapterPool = {};
    const typeTotal = {};
    const paperFor = {};
    const chapIndex = practiceChapterIndex();
    (bank.all || []).forEach(function (q) {
        byId[q.id] = q;
        const ch = q.topicId ? chapIndex[q.topicId] : null;
        /* Counted for GENERATED PRACTICE only, because that is what the "answer
         * what is left" action can actually serve. Promising a paper question
         * here and then not having it would be a recommendation that lies. */
        if (ch && q.kind === "GENERATED_PRACTICE") {
            chapterPool[ch.key] = (chapterPool[ch.key] || 0) + 1;
        }
        const t = q.type || "UNSPECIFIED";
        if (q.kind === "GENERATED_PRACTICE") {
            typeTotal[t] = (typeTotal[t] || 0) + 1;
        }
    });
    function chapterFor(topicId, subjectId) {
        if (!topicId) return null;
        if (chapIndex[topicId]) return chapIndex[topicId];
        return {
            key: subjectId + "::topic::" + topicId,
            title: topicId, subjectId: subjectId,
            chapterNumber: null, chapterTitle: "", topicTitle: topicId
        };
    }
    (bank.paperList || []).forEach(function (p) {
        if (p.subject && p.paperId && !paperFor[p.subject]) paperFor[p.subject] = p.paperId;
    });

    const subjMap = {};
    const chapterMap = {};
    const topicMap = {};
    const typeMap = {};
    const errMap = {};

    function bucket(map, key, seed) {
        let b = map[key];
        if (!b) {
            b = map[key] = seed;
            b.attempted = 0;
            b.awarded = 0;
            b.possible = 0;
            b.unique = 0;
            b.seen = {};
        }
        b.attempted += 1;
        return b;
    }

    function note(map, key, seed, questionId, awarded, possible) {
        const b = bucket(map, key, seed);
        b.awarded += awarded;
        b.possible += possible;
        if (!b.seen[questionId]) {
            b.seen[questionId] = 1;
            b.unique += 1;
        }
        return b;
    }

    (sessions || []).forEach(function (s) {
        if (!s || !(s.results || []).length) return;
        (s.results || []).forEach(function (r) {
            if (!r || !r.questionId) return;
            const q = byId[r.questionId];
            const possible = r.maxMarks || 0;
            const awarded = r.awarded || 0;
            if (!possible) return;   /* nothing to judge it against */
            const lost = Math.round((possible - awarded) * 100) / 100;
            const subjectId = (q && q.subjectId) || s.subjectId || "unknown";
            const type = (q && q.type) || "UNSPECIFIED";
            const topicId = (q && q.topicId) || null;

            out.attempted += 1;
            out.awarded += awarded;
            out.possible += possible;
            if (r.unreadable) out.unreadable += 1;
            if (r.mcq) out.objectiveAttempts += 1;

            note(subjMap, subjectId, { id: subjectId }, r.questionId, awarded, possible);
            note(typeMap, type, { id: type }, r.questionId, awarded, possible);
            if (topicId) {
                const ch = chapterFor(topicId, subjectId);
                note(topicMap, topicId, {
                    id: topicId, subjectId: subjectId,
                    chapter: ch ? ch.key : null,
                    chapterTitle: ch ? ch.title : ""
                }, r.questionId, awarded, possible);
                if (ch) {
                    note(chapterMap, ch.key,
                        { id: ch.key, title: ch.title, subjectId: subjectId },
                        r.questionId, awarded, possible);
                }
            }

            (r.errorsLost || []).forEach(function (e) {
                const key = e.errorType || "UNSPECIFIED";
                let b = errMap[key];
                if (!b) {
                    b = errMap[key] = {
                        errorType: key, occurrences: 0, marksLost: 0, questions: {}
                    };
                }
                b.occurrences += 1;
                b.marksLost += e.marksLost || 0;
                b.questions[r.questionId] = 1;
            });

            /* An objective result returns before the criteria are scored, so it
             * carries no errorsLost at all. Without this branch every mark an
             * MCQ set lost would be missing from the tally, and the report
             * would tell a candidate dropping objective marks that they never
             * lose any. */
            if (r.mcq && lost > 0) {
                let b = errMap.WRONG_OPTION;
                if (!b) {
                    b = errMap.WRONG_OPTION = {
                        errorType: "WRONG_OPTION", occurrences: 0, marksLost: 0, questions: {}
                    };
                }
                b.occurrences += Math.max(1, (r.mcq.itemCount || 0) - (r.mcq.right || 0));
                b.marksLost += lost;
                b.questions[r.questionId] = 1;
            }
        });
    });

    out.awarded = Math.round(out.awarded * 100) / 100;
    out.percent = out.possible ? Math.round(out.awarded / out.possible * 1000) / 10 : 0;

    function finish(map) {
        return Object.keys(map).map(function (key) {
            const b = map[key];
            b.percent = b.possible ? Math.round(b.awarded / b.possible * 1000) / 10 : 0;
            b.marksLost = Math.round((b.possible - b.awarded) * 100) / 100;
            /* Evidence first: unique questions, never raw attempt count. */
            b.verdict = practiceVerdictFor(b.unique, b.percent);
            delete b.seen;
            return b;
        });
    }
    function worstFirst(a, b) {
        return (b.marksLost - a.marksLost) || (a.percent - b.percent)
            || String(a.id).localeCompare(String(b.id));
    }
    out.subjects = finish(subjMap).sort(worstFirst);
    out.chapters = finish(chapterMap).sort(worstFirst);
    out.types = finish(typeMap).sort(worstFirst);
    out.topics = finish(topicMap).sort(worstFirst);

    out.errors = Object.keys(errMap).map(function (key) {
        const b = errMap[key];
        b.marksLost = Math.round(b.marksLost * 100) / 100;
        b.questionCount = Object.keys(b.questions).length;
        b.hint = PRACTICE_ERROR_HINTS[b.errorType]
            || "Open the feedback on one of these and match your answer against the criterion it lost marks on.";
        delete b.questions;
        return b;
    }).sort(function (a, b) {
        return (b.marksLost - a.marksLost) || (b.occurrences - a.occurrences)
            || String(a.errorType).localeCompare(String(b.errorType));
    });

    out.insufficient = out.chapters.filter(function (c) {
        return c.verdict === "INSUFFICIENT_EVIDENCE" && c.attempted;
    }).map(function (c) {
        return {
            chapterId: c.id, subjectId: c.subjectId, title: c.title,
            attempted: c.unique, percent: c.percent
        };
    });
    out.chapters.forEach(function (c) {
        if (out.verdicts[c.verdict] !== undefined) out.verdicts[c.verdict] += 1;
    });
    out.insufficientTopics = out.topics.filter(function (t) {
        return t.verdict === "INSUFFICIENT_EVIDENCE" && t.attempted;
    }).length;

    /* ---- recommendations -------------------------------------------------
     * Ordered by how directly they can be acted on: the topic to revise, the
     * question type to drill, the paper to sit, the evidence still missing,
     * and the technique that is costing the most marks. */
    const recs = [];
    function count(kind) {
        return recs.filter(function (r) { return r.kind === kind; }).length;
    }
    function topicTitleOf(topicId) {
        return (chapIndex[topicId] && chapIndex[topicId].topicTitle) || topicId;
    }

    /* STUDY: a chapter that is weak on enough evidence. The open target is the
     * topic inside it that lost the most, because someone who has just scored
     * 25% does not need the chapter's front page - they need the part that
     * hurt. */
    out.chapters.forEach(function (c) {
        if (c.verdict !== "WEAK" || count("STUDY") >= 4) return;
        const left = Math.max(0, (chapterPool[c.id] || 0) - c.unique);
        const inside = out.topics.filter(function (t) { return t.chapter === c.id; })
            .sort(function (a, b) {
                return (a.percent - b.percent) || (b.marksLost - a.marksLost);
            });
        const target = inside[0];
        if (!target) return;
        recs.push({
            kind: "STUDY",
            topicId: target.id,
            chapterId: c.id,
            subjectId: c.subjectId,
            attempts: c.unique,
            percent: c.percent,
            marksLost: c.marksLost,
            available: left,
            text: "Revise " + c.title + ": " + c.percent + "% across "
                + c.unique + " question(s) and " + c.marksLost
                + " mark(s) lost."
                + (left ? " Then answer the " + left + " question(s) in it you have not tried."
                        : " You have sat every question in it, so revise and then retake it.")
                + (target.percent < 50
                    ? " Start with \"" + topicTitleOf(target.id) + "\", which is "
                      + target.percent + "%."
                    : "")
        });
    });

    out.types.forEach(function (t) {
        if (t.verdict !== "WEAK" || count("PRACTICE") >= 2) return;
        const left = typeTotal[t.id] || 0;
        if (!left) return;
        recs.push({
            kind: "PRACTICE",
            type: t.id,
            attempts: t.unique,
            percent: t.percent,
            available: left,
            text: "Answer more " + String(t.id).toLowerCase() + " questions: "
                + t.percent + "% across " + t.unique + " so far, and " + left
                + " of them are available."
        });
    });

    out.subjects.filter(function (s) {
        return paperFor[s.id]
            && (s.verdict === "STRONG" || s.verdict === "DEVELOPING");
    }).sort(function (a, b) {
        return b.percent - a.percent || String(a.id).localeCompare(String(b.id));
    }).slice(0, 2).forEach(function (s) {
        recs.push({
            kind: "PAPER",
            subjectId: s.id,
            paperId: paperFor[s.id],
            attempts: s.unique,
            percent: s.percent,
            available: 1,
            text: "Sit " + paperFor[s.id] + " under paper conditions - "
                + subjectLabel(s.id) + " is at " + s.percent + "% across "
                + s.unique + " question(s)."
        });
    });

    /* MORE_ATTEMPTS: looks weak, not yet proven. The honest answer is more
     * evidence, so the action is a session of the chapter's own unattempted
     * questions rather than a verdict. */
    out.insufficient.filter(function (c) {
        return c.percent < PRACTICE_WEAK_OK_AT;
    }).sort(function (a, b) {
        return a.percent - b.percent || String(a.chapterId).localeCompare(String(b.chapterId));
    }).slice(0, 3).forEach(function (c) {
        const left = Math.max(0, (chapterPool[c.chapterId] || 0) - c.attempted);
        const need = Math.max(1, PRACTICE_WEAK_MIN_ATTEMPTS - c.attempted);
        recs.push({
            kind: "MORE_ATTEMPTS",
            chapterId: c.chapterId,
            subjectId: c.subjectId,
            attempts: c.attempted,
            percent: c.percent,
            available: left,
            text: c.title + " is " + c.percent + "% after " + c.attempted
                + " question(s), which is not enough evidence for a verdict yet."
                + (left ? " Answer " + Math.min(left, need) + " of the " + left
                        + " you have not tried."
                        : " You have sat every question in it; retake it after revising.")
        });
    });

    out.errors.filter(function (e) {
        return e.marksLost > 0;
    }).slice(0, 3).forEach(function (e) {
        recs.push({
            kind: "TECHNIQUE",
            errorType: e.errorType,
            attempts: e.questionCount,
            marksLost: e.marksLost,
            percent: null,
            available: 0,
            text: String(e.errorType).replace(/_/g, " ").toLowerCase() + ": " + e.hint
                + " (" + e.marksLost + " mark(s) lost across " + e.questionCount
                + " question(s).)"
        });
    });

    out.recommendations = recs.slice(0, 12).map(function (r, i) {
        r.rank = i + 1;
        return r;
    });
    return out;
}

/* ==== analytics (phase 16) ==================================================
 *
 * The weakness report answers "what should I fix"; analytics answers "what has
 * actually been done" - volume, reach, mix and direction. Same inputs,
 * deliberately different questions, so the two screens can never contradict
 * each other, and neither grades a topic or names an action.
 *
 * Three honesty rules are built in rather than added afterwards:
 *
 *   - DIRECTION: reported only between two halves of the history that both
 *     contain marks, and movement under PRACTICE_ANALYTICS_FLAT_POINTS points
 *     is reported as "no clear change". Two flat scores are not progress and
 *     two bad scores are not a collapse; saying otherwise would be reading a
 *     story into noise, and the number is small enough that a candidate would
 *     believe it.
 *
 *   - DURATION: a sitting that is negative or longer than
 *     PRACTICE_ANALYTICS_MAX_MINUTES is discarded and COUNTED as discarded.
 *     Averaging a bad clock into a headline time produces a figure nobody can
 *     question and everybody should.
 *
 *   - MIX: objective and written rates are shown side by side and never summed
 *     or ranked against each other, because objective items carry no partial
 *     credit. A lower objective rate is a different measurement, not a worse
 *     candidate.
 *
 * Nothing here forecasts a grade or an outcome. History is descriptive.
 */
const PRACTICE_ANALYTICS_FLAT_POINTS = 5;
const PRACTICE_ANALYTICS_MAX_MINUTES = 480;   /* one sitting, generously */

function practiceAnalyticsReport(sessions, bank) {
    const out = {
        sessions: 0,
        attempted: 0, awarded: 0, possible: 0, percent: 0,
        daysActive: 0, lastActivity: null, historyLimit: 50,
        unreadable: 0, unreadableRate: 0,
        typed: 0, transcribed: 0, lowConfidence: 0,
        objective: { count: 0, awarded: 0, possible: 0, percent: 0 },
        written: { count: 0, awarded: 0, possible: 0, percent: 0 },
        coverage: {
            total: 0, reached: 0, percent: 0,
            subjects: [], untouchedSubjects: [],
            chaptersTotal: 0, chaptersReached: 0
        },
        bySource: [],
        byDifficulty: [],
        trend: {
            points: [], enough: false,
            firstHalf: null, secondHalf: null, delta: 0,
            direction: "UNKNOWN", best: null, worst: null
        },
        time: {
            measured: 0, ignored: 0, unmeasured: 0, minutes: 0, questions: 0,
            avgPerSession: 0, avgPerQuestion: 0
        }
    };
    if (!bank || !(bank.all || []).length) return out;

    const byId = {};
    const subjAvailable = {};
    const chapIndex = practiceChapterIndex();
    const bankChapters = {};
    (bank.all || []).forEach(function (q) {
        byId[q.id] = q;
        subjAvailable[q.subjectId] = (subjAvailable[q.subjectId] || 0) + 1;
        const ch = q.topicId ? chapIndex[q.topicId] : null;
        if (ch) bankChapters[ch.key] = 1;
    });

    const reachedQ = {};
    const reachedChapter = {};
    const reachedBySubject = {};
    const days = {};
    const srcMap = {};
    const diffMap = {};
    const points = [];
    let typed = 0;
    let transcribed = 0;
    let lowConf = 0;
    let objCount = 0;
    let objAwarded = 0;
    let objPossible = 0;
    let wrCount = 0;
    let wrAwarded = 0;
    let wrPossible = 0;
    let tMeasured = 0;
    let tIgnored = 0;
    let tUnmeasured = 0;
    let tMinutes = 0;
    let tQuestions = 0;

    function round2(n) { return Math.round(n * 100) / 100; }
    function round1(n) { return Math.round(n * 10) / 10; }
    /* A duration is only evidence when the clock could have been running. */
    function durationOf(s) {
        if (!s.startedAt || !s.finishedAt) return null;
        const ms = Date.parse(s.finishedAt) - Date.parse(s.startedAt);
        if (isNaN(ms) || ms < 0 || ms > PRACTICE_ANALYTICS_MAX_MINUTES * 60000) {
            return null;
        }
        return round1(ms / 60000);
    }

    (sessions || []).forEach(function (s) {
        if (!s || !(s.results || []).length) return;
        out.sessions += 1;

        const when = s.finishedAt || s.startedAt || null;
        if (when) days[String(when).slice(0, 10)] = 1;
        if (when && (!out.lastActivity || String(when) > String(out.lastActivity))) {
            out.lastActivity = when;
        }

        let sAwarded = 0;
        let sPossible = 0;
        let sQuestions = 0;
        (s.results || []).forEach(function (r) {
            if (!r || !r.questionId) return;
            const q = byId[r.questionId];
            const possible = r.maxMarks || 0;
            const awarded = r.awarded || 0;
            if (!possible) return;

            out.attempted += 1;
            out.awarded += awarded;
            out.possible += possible;
            if (r.unreadable) out.unreadable += 1;
            sAwarded += awarded;
            sPossible += possible;
            sQuestions += 1;

            if (!reachedQ[r.questionId]) {
                reachedQ[r.questionId] = 1;
                if (q) {
                    reachedBySubject[q.subjectId] =
                        (reachedBySubject[q.subjectId] || 0) + 1;
                }
            }
            if (q) {
                const ch = q.topicId ? chapIndex[q.topicId] : null;
                if (ch) reachedChapter[ch.key] = 1;

                const src = q.kind || "UNKNOWN";
                const sb = srcMap[src] || (srcMap[src] = { id: src, count: 0, awarded: 0, possible: 0 });
                sb.count += 1;
                sb.awarded += awarded;
                sb.possible += possible;

                const df = q.difficulty || "UNSET";
                const db = diffMap[df] || (diffMap[df] = { id: df, count: 0, awarded: 0, possible: 0 });
                db.count += 1;
                db.awarded += awarded;
                db.possible += possible;
            }

            if (q && q.type === "OBJECTIVE_MCQ") {
                objCount += 1;
                objAwarded += awarded;
                objPossible += possible;
            } else {
                wrCount += 1;
                wrAwarded += awarded;
                wrPossible += possible;
            }
        });

        /* Provenance of what was submitted: read out of the answer record,
         * because the mark itself never carries the transcription's
         * confidence or whether a human typed it. */
        const answers = s.answers || {};
        Object.keys(answers).forEach(function (qid) {
            const a = answers[qid];
            if (!a) return;
            if (a.manual) typed += 1;
            else transcribed += 1;
            if (typeof a.confidence === "number" && a.confidence < OCR_MIN_CONFIDENCE) {
                lowConf += 1;
            }
        });

        const mins = durationOf(s);
        if (mins === null) {
            if (s.startedAt && s.finishedAt) tIgnored += 1;
            else tUnmeasured += 1;
        } else {
            tMeasured += 1;
            tMinutes += mins;
            tQuestions += sQuestions;
        }

        points.push({
            sessionId: s.sessionId || ("session-" + out.sessions),
            date: when,
            label: s.label || s.mode || "",
            questions: sQuestions,
            awarded: round2(sAwarded),
            marks: round2(sPossible),
            percent: sPossible ? round1(sAwarded / sPossible * 100) : 0,
            minutes: mins
        });
    });

    out.awarded = round2(out.awarded);
    out.percent = out.possible ? round1(out.awarded / out.possible * 100) : 0;
    out.daysActive = Object.keys(days).length;
    out.unreadableRate = out.attempted
        ? round1(out.unreadable / out.attempted * 100) : 0;
    out.typed = typed;
    out.transcribed = transcribed;
    out.lowConfidence = lowConf;

    out.objective.count = objCount;
    out.objective.awarded = round2(objAwarded);
    out.objective.possible = round2(objPossible);
    out.objective.percent = objPossible ? round1(objAwarded / objPossible * 100) : 0;
    out.written.count = wrCount;
    out.written.awarded = round2(wrAwarded);
    out.written.possible = round2(wrPossible);
    out.written.percent = wrPossible ? round1(wrAwarded / wrPossible * 100) : 0;

    /* ---- coverage: how much of the bank has been touched ------------------ */
    out.coverage.total = (bank.all || []).length;
    out.coverage.reached = Object.keys(reachedQ).length;
    out.coverage.percent = out.coverage.total
        ? round1(out.coverage.reached / out.coverage.total * 100) : 0;
    out.coverage.chaptersTotal = Object.keys(bankChapters).length;
    out.coverage.chaptersReached = Object.keys(reachedChapter).length;
    out.coverage.subjects = Object.keys(subjAvailable).map(function (id) {
        const available = subjAvailable[id];
        const reached = reachedBySubject[id] || 0;
        return {
            subjectId: id,
            available: available,
            reached: reached,
            percent: available ? round1(reached / available * 100) : 0
        };
    }).sort(function (a, b) {
        return (a.percent - b.percent) || (b.available - a.available)
            || String(a.subjectId).localeCompare(String(b.subjectId));
    });
    out.coverage.untouchedSubjects = out.coverage.subjects
        .filter(function (s) { return !s.reached; })
        .map(function (s) { return s.subjectId; });

    function finishMix(map) {
        return Object.keys(map).map(function (k) {
            const b = map[k];
            b.percent = b.possible ? round1(b.awarded / b.possible * 100) : 0;
            b.awarded = round2(b.awarded);
            b.possible = round2(b.possible);
            return b;
        }).sort(function (a, b) {
            return (b.count - a.count) || String(a.id).localeCompare(String(b.id));
        });
    }
    out.bySource = finishMix(srcMap);
    out.byDifficulty = finishMix(diffMap);

    /* ---- direction: two halves, both with marks --------------------------- */
    points.sort(function (a, b) {
        const ad = a.date ? Date.parse(a.date) : NaN;
        const bd = b.date ? Date.parse(b.date) : NaN;
        if (isNaN(ad) && isNaN(bd)) return 0;
        if (isNaN(ad)) return -1;
        if (isNaN(bd)) return 1;
        return ad - bd;
    });
    out.trend.points = points;
    const scored = points.filter(function (p) { return p.marks > 0; });
    if (scored.length >= 2) {
        const half = Math.floor(scored.length / 2);
        const first = scored.slice(0, half);
        const second = scored.slice(half);
        const sum = function (rows, key) {
            return rows.reduce(function (a, p) { return a + p[key]; }, 0);
        };
        const fa = sum(first, "awarded");
        const fm = sum(first, "marks");
        const sa = sum(second, "awarded");
        const sm = sum(second, "marks");
        out.trend.enough = fm > 0 && sm > 0;
        if (out.trend.enough) {
            out.trend.firstHalf = round1(fa / fm * 100);
            out.trend.secondHalf = round1(sa / sm * 100);
            out.trend.delta = round1(out.trend.secondHalf - out.trend.firstHalf);
            out.trend.direction = out.trend.delta >= PRACTICE_ANALYTICS_FLAT_POINTS ? "UP"
                : (out.trend.delta <= -PRACTICE_ANALYTICS_FLAT_POINTS ? "DOWN" : "FLAT");
        }
        const ranked = scored.slice().sort(function (a, b) { return b.percent - a.percent; });
        out.trend.best = { date: ranked[0].date, percent: ranked[0].percent, sessionId: ranked[0].sessionId };
        out.trend.worst = { date: ranked[ranked.length - 1].date,
            percent: ranked[ranked.length - 1].percent,
            sessionId: ranked[ranked.length - 1].sessionId };
    }

    out.time.measured = tMeasured;
    out.time.ignored = tIgnored;
    out.time.unmeasured = tUnmeasured;
    out.time.minutes = round1(tMinutes);
    out.time.questions = tQuestions;
    out.time.avgPerSession = tMeasured ? round1(tMinutes / tMeasured) : 0;
    out.time.avgPerQuestion = tQuestions ? round1(tMinutes / tQuestions) : 0;
    return out;
}

/* ============================================================================
   CONTENT REVIEW REPORT (phase 17, admin review/approval - the browser half)

   The build-time register (var REVIEW_REGISTER, emitted by
   build_review_register.py) records what the pipeline verified against the
   supplied papers, which the app cannot re-check because those papers do not
   ship here. This function re-runs everything the app CAN re-check over the
   bank that is actually loaded, and the review screen shows both halves side
   by side.

   The checks are failures of content, not of style: each one measures a
   question, paper or criterion nobody should be marked against. An empty list
   means no failure; a non-empty one is listed by id so a reviewer can find it.
   ============================================================================ */
function practiceReviewReport(bank, register) {
    if (!bank) return null;
    const reg = register || (typeof REVIEW_REGISTER !== "undefined" && REVIEW_REGISTER
        ? REVIEW_REGISTER : null);
    const verbs = {};
    const channels = {};
    const objectiveChannels = {};
    (reg && reg.rubricVerbs || []).forEach(function (v) {
        verbs[String(v).toLowerCase()] = true;
    });
    (reg && reg.channels || []).forEach(function (c) {
        channels[c] = true;
    });
    (reg && reg.objectiveChannels || []).forEach(function (c) {
        objectiveChannels[c] = true;
    });
    const LIST = { keyPointTerms: true, formulaTerms: true };
    const CAP = 24;
    const round2 = function (n) { return Math.round(n * 100) / 100; };
    const chapterIndex = practiceChapterIndex();
    const checks = [];
    let failures = 0;
    let criteriaCount = 0;
    let termCount = 0;
    let listCriteria = 0;

    function add(id, name, purpose, checked, failed, rows) {
        failures += failed ? 1 : 0;
        checks.push({
            id: id, name: name, purpose: purpose, checked: checked, failed: failed,
            status: failed ? "FAIL" : "PASS", failures: rows.slice(0, CAP)
        });
    }

    /* ---- source traceability ------------------------------------------- */
    const untraceable = [];
    const marksBad = [];
    const vocabBad = [];
    const dead = [];
    const verbBad = [];
    const placeBad = [];
    const thin = [];
    bank.all.forEach(function (q) {
        if (q.kind === "GENERATED_PRACTICE"
            && (!q.topicId || !chapterIndex[q.topicId])) {
            untraceable.push({ id: q.id, subjectId: q.subjectId,
                why: "topicId " + q.topicId + " resolves to no study-text chapter" });
        }
        if ((q.criteria || []).length) {
            const paid = round2((q.criteria || []).reduce(function (a, c) {
                return a + (c.maxMarks || 0);
            }, 0));
            if (Math.abs(paid - round2(q.marks || 0)) > 0.01) {
                marksBad.push({ id: q.id, subjectId: q.subjectId,
                    why: "criteria pay " + paid + " of " + q.marks });
            }
        }
        const objective = q.type === "OBJECTIVE_MCQ";
        (q.criteria || []).forEach(function (c) {
            criteriaCount++;
            const known = channels[c.evidence] || objectiveChannels[c.evidence];
            if (!known) {
                vocabBad.push({ id: q.id, subjectId: q.subjectId,
                    why: "channel '" + c.evidence + "' is not scored by name" });
            }
            if (objectiveChannels[c.evidence] && !objective) {
                placeBad.push({ id: q.id, subjectId: q.subjectId,
                    why: "objective channel on a " + q.type + " question" });
            }
            if (LIST[c.evidence]) {
                listCriteria++;
                const terms = (q.evidenceTerms && q.evidenceTerms[c.id]) || c.terms || [];
                termCount += terms.length;
                if (!terms.length) {
                    dead.push({ id: q.id, subjectId: q.subjectId,
                        why: "no evidence list for " + c.id });
                } else {
                    if (terms.length < 3) {
                        thin.push({ id: q.id, subjectId: q.subjectId,
                            why: c.id + " has " + terms.length + " terms" });
                    }
                    terms.forEach(function (w) {
                        if (verbs[String(w).toLowerCase()]) {
                            verbBad.push({ id: q.id, subjectId: q.subjectId,
                                why: "term '" + w + "' is a marker verb" });
                        }
                    });
                }
            }
        });
    });
    add("SOURCE_TRACE", "Questions resolve to the study text",
        "A generated question whose topicId has no chapter in the study text has "
        + "no academic source: it cannot be traced, revised from, or defended.",
        bank.generated.length, untraceable.length, untraceable);
    add("RUBRIC_SUMS", "Criteria pay the marks printed on the question",
        "If a rubric's criteria do not add up to the marks on the question, the "
        + "question's own ceiling is a number the rubric cannot pay.",
        bank.all.length, marksBad.length, marksBad);
    add("CHANNEL_VOCAB", "Every evidence channel is scored by name",
        "A criterion on a channel the marker does not switch on falls through to "
        + "the default scoring path, which is not what the rubric designed it as.",
        criteriaCount, vocabBad.length, vocabBad);
    add("EVIDENCE_LIST", "Word-scored criteria carry the words to score",
        "The marker reads an empty list as no evidence recorded and returns "
        + "zero for that criterion in every answer, while the question keeps "
        + "showing its full marks.",
        termCount ? listCriteria : criteriaCount, dead.length, dead);
    add("MARKER_VERBS", "No marker verb inside a term list",
        "A study text reading 'the standard states ...' would otherwise make "
        + "'states' worth a mark, collectible by quoting the question back.",
        termCount, verbBad.length, verbBad);
    add("MCQ_PLACEMENT", "Objective keying used only on objective questions",
        "The objective answer-key channel belongs to nothing else; a written "
        + "question carrying it would be scored by the wrong path.",
        criteriaCount, placeBad.length, placeBad);

    /* ---- provenance and marking sources --------------------------------- */
    const provBad = [];
    (bank.paperList || []).forEach(function (p) {
        const pr = p.provenance || {};
        if (!(pr.generated === true && pr.officialICAP === false
            && pr.copiedFromPastPapers === false)) {
            provBad.push({ id: p.paperId, subjectId: p.subjectId || "",
                why: "provenance must declare generated, not-ICAP, not-copied" });
        }
    });
    add("PROVENANCE", "Every generated paper declares what it is",
        "A paper that does not assert generated/not-official-ICAP/not-copied "
        + "could be mistaken for an ICAP past paper, and the app refuses it.",
        (bank.paperList || []).length, provBad.length, provBad);

    const noKey = [];
    const keyBad = [];
    let objectiveCount = 0;
    bank.official.forEach(function (q) {
        if (!q.answerDocId) {
            noKey.push({ id: q.id, subjectId: q.subjectId,
                why: "no suggested-answer document id recorded" });
        }
        if (q.type === "OBJECTIVE_MCQ") {
            objectiveCount++;
            const keys = Object.keys(q.mcqAnswers || {}).length;
            const items = (q.mcqItems || []).length;
            if (keys !== items) {
                keyBad.push({ id: q.id, subjectId: q.subjectId,
                    why: keys + " keys for " + items + " items" });
            }
        }
    });
    add("MARKING_SOURCE", "Official questions name their marking source",
        "An official question without its suggested-answer document id claims a "
        + "marking source it cannot show.",
        bank.official.length, noKey.length, noKey);
    add("MCQ_KEYING", "One key per item shown",
        "The marker awards an objective section pro rata over its keys; a key "
        + "the candidate was never shown is a mark nobody can win.",
        objectiveCount, keyBad.length, keyBad);

    /* ---- watch items (reported, not gating) ------------------------------ */
    const watch = [];
    watch.push({
        id: "THIN_EVIDENCE", count: thin.length,
        why: "Evidence lists under three terms are narrow: the marker can only "
            + "match what is listed, so an answer in different words scores "
            + "nothing for that criterion. Formula criteria are built from short "
            + "source sentences, so this is reported for a human rather than "
            + "failed as a defect.",
        sample: thin.slice(0, 6)
    });

    /* ---- register vs loaded bank: drift ---------------------------------- */
    /* `chapterIndex` maps study topics to their chapter, so its size is the
     * topic count. The register counts chapters the way the bank builder does
     * - the distinct chapters that carry a generated question - so the live
     * side reproduces that same definition through the index, and the topic
     * count is compared against the register's own studyTopics. Every drift
     * row then compares like with like. */
    const drift = [];
    function driftRow(label, registered, live) {
        if (registered === null || registered === undefined) return;
        drift.push({ label: label, registered: registered, live: live,
            matches: registered === live });
    }
    const usedChapters = {};
    (bank.generated || []).forEach(function (q) {
        const info = chapterIndex[q.topicId];
        if (info && info.key) usedChapters[info.key] = true;
    });
    const liveChapters = Object.keys(usedChapters).length;
    driftRow("generated", reg && reg.counts && reg.counts.generated,
        bank.generated.length);
    driftRow("official", reg && reg.counts && reg.counts.official, bank.official.length);
    driftRow("paper questions", reg && reg.counts && reg.counts.paperQuestions,
        bank.paperQuestions.length);
    driftRow("papers", reg && reg.counts && reg.counts.papers, bank.paperList.length);
    driftRow("subjects", reg && reg.counts && reg.counts.subjects,
        Object.keys(bank.bySubject || {}).length);
    driftRow("chapters", reg && reg.counts && reg.counts.chapters, liveChapters);
    driftRow("study topics", reg && reg.counts && reg.counts.studyTopics,
        Object.keys(chapterIndex).length);

    const out = {
        ok: failures === 0,
        digest: bank.all.length + "/" + bank.generated.length
            + "/" + bank.official.length + "/" + bank.paperQuestions.length
            + "/" + bank.paperList.length + "@" + (reg && reg.builtAt || "unregistered"),
        builtAt: (reg && reg.builtAt) || null,
        checks: checks,
        watch: watch,
        drift: drift,
        register: reg,
        counts: {
            questions: bank.all.length, generated: bank.generated.length,
            official: bank.official.length, paperQuestions: bank.paperQuestions.length,
            papers: bank.paperList.length,
            subjects: Object.keys(bank.bySubject || {}).length,
            chapters: liveChapters,
            studyTopics: Object.keys(chapterIndex).length
        }
    };
    return out;
}

/* ==== end of CAF Practice Centre engine fragment ==== */

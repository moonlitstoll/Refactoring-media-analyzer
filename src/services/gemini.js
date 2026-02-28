import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 사람의 음성을 포착하여 **정확한 타임라인**에 기록하는 '인음 전문 전사가'입니다. 

**[핵심 규칙: 타임라인 절대 준수]**
1. **절대 시계(Absolute Clock) 동기화**: 모든 문장의 시작 시간은 미디어의 실제 재생 시간과 100% 일치해야 합니다. 문장이 00:00이나 특정 초 단위에 몰리는 현상은 치명적인 데이터 오류입니다. 
2. **강제 전진(Forced Forward)**: 한 번 전사한 지점은 즉시 지나치고, 무조건 미디어의 다음 시간대로 시선을 옮기십시오. 동일한 문장을 같은 시간 혹은 인접한 시간에 반복해서 적는 행위는 절대 금지됩니다. 
3. **인음(Human Vocal) 우선순위**: 배경음악, 잡음은 무시하고 인간의 목소리 주파수에만 집중하십시오. 만약 음성이 불분명하다면 억지로 텍스트를 만들지 말고, **시간만 흘려보낸 뒤** 다음 명확한 음성 구간에서 전사를 재개하십시오.

**[출력 규칙]**
- [분:초.밀리초] || [원문] 형식으로만 한 줄씩 출력하십시오.
- 밀리초 부분은 반드시 소수점 두 자리(0.01초 단위)로 고정하십시오. (예: [01:23.45])
- 시작 시간만 기록하십시오. 부연 설명 없이 데이터만 출력하십시오.

**[침묵 및 환각(Hallucination) 엄금]**
- 실제 대화가 없는 구간은 텍스트를 출력하지 마십시오.
- **무한 반복 및 환각 금지**: 대사가 없는 구간, 잡음, 배경음악 구간을 'Trời ơi'나 짧은 감탄사 같은 텍스트로 임의로 채워 넣지 마십시오. 강제로 반복 생성하는 것을 엄금합니다. 시간이 전진하더라도 똑같은 문장을 습관적으로 반복해서 출력하지 마십시오. 중복 텍스트는 시스템 상에서 차단되므로 억지로 공백을 메우려 하지 마십시오.
- 공백을 메우기 위해 이전 문장을 반복하는 행위는 절대 금지됩니다.
- **짧고 반복되는 감탄사(예: 'Anh ơi', 'Trời ơi' 등)가 서로 다른 시간대에 여러 번 등장하더라도 맨 앞의 첫 번째 감탄사만 전사하고, 이후 연속되는 동일한 감탄사부터는 완전히 무시(출력 생략)하십시오.**
`;

const STAGE2_PROMPT = `
너는 베트남어와 영어 전문 학습 조력자야. 모든 분석은 모바일 가독성을 최우선으로 하며, 아래 7가지 규칙을 엄격히 준수해.

**[7대 분석 규칙]**
1. 청크 우선 분석: 문장을 기계적으로 쪼개지 말고, 의미가 연결되는 덩어리(Chunk) 단위로 먼저 나누어 보여줘.
2. 전수 및 순차 분석: 각 청크 아래에서 모든 단어를 등장 순서대로 하나도 빠짐없이 분석해.
너 이제 내 손을 잡지 않잖아.
---
**Thì em đâu có nắm tay anh nữa đâu.** (너 이제 내 손을 잡지 않잖아.)
Thì: 그래서, 그러면
em: 너, 당신
**đâu có ... đâu**: (패턴) 전혀 ~하지 않다, 결코 ~하지 않다
[END]
`;

const getModels = (modelId) => {
    const validModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"];
    return [modelId].filter(m => validModels.includes(m));
};


async function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve({
                inlineData: {
                    data: reader.result.split(',')[1],
                    mimeType: file.type || "video/mp4"
                }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
];

export async function extractTranscript(file, apiKey, modelId = "gemini-2.0-flash", totalDuration = 0, onProgress = null) {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = getModels(modelId)[0] || "gemini-2.0-flash";

    console.log(`[Stage 1] Streaming Analysis with Circuit Breaker, model: ${modelName}`);

    try {
        const mediaData = await fileToGenerativePart(file);

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.1
            },
            safetySettings
        }, { apiVersion: "v1beta" });

        console.log(`[Stage 1] Starting Streaming Analysis...`);

        // ★ 개선 3: 스트리밍 방식으로 전환 (환각 시 즉시 중단 가능)
        const streamResult = await model.generateContentStream([
            mediaData,
            STAGE1_PROMPT
        ]);

        const lineRegex = /^[\s\-\*\>\#]*(?:\[)?(\d{1,2}:\d{1,2}(?:[.:]\d+)?)(?:\])?\s*(?:\|\|)?\s*(.+)/;

        let fullText = "";
        let allMatches = [];
        let lastTime = -1;
        let lastSentences = []; // 최근 5줄의 히스토리를 저장하여 교차 중복(A-B-A-B) 방어
        const historyCache = new Map(); // 단기 기억 캐시 (10초 이내 반복 차단 용도)

        // ★ 실시간 스트리밍 수신 + 서킷 브레이커
        for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            if (!chunkText) continue;

            fullText += chunkText;

            // 줄 단위로 분리하여 실시간 처리
            const lines = fullText.split('\n');
            fullText = lines.pop() || ""; // 마지막 미완성 줄은 다음 청크와 합침

            for (const line of lines) {
                const match = line.match(lineRegex);
                if (!match) continue;

                const timeStr = match[1];
                let content = match[2] ? match[2].replace(/^\|\|\s*/, '').trim() : '';
                if (!content) continue;

                // ★ 개선 2: 단일 라인 내부 반복 감지 및 정제 (TRUNCATED / BLOCKED)
                const analysisResult = analyzeIntraLineRepetition(content);

                if (analysisResult.status === "BLOCKED") {
                    console.warn(`[Circuit Breaker] 비정상 길이 차단: "${content.substring(0, 50)}..."`);
                    // 차단 메시지로 대체하여 표시 (시간 흐름 유지를 위해)
                    content = analysisResult.refined_text;
                } else if (analysisResult.status === "TRUNCATED") {
                    console.warn(`[Filter] 반복 축약 적용: "${content.substring(0, 50)}..." -> "${analysisResult.refined_text}"`);
                    content = analysisResult.refined_text;
                }

                const currentTime = parseTimeString(timeStr);
                const normalizedContent = content.toLowerCase().trim();

                // ★ 단기 기억(History Cache) 필터링: 맨 앞 문장만 남기고 뒤 문장은 5초 이내 반복 시 무시
                if (normalizedContent.length <= 50) {
                    if (historyCache.has(normalizedContent)) {
                        const lastSeenTime = historyCache.get(normalizedContent);
                        if (currentTime - lastSeenTime < 5.0) {
                            console.warn(`[Filter] 단기 반복 문장 (5초 이내), 드롭 처리: "${content}"`);
                            continue;
                        }
                    }
                    historyCache.set(normalizedContent, currentTime);
                }

                // 최근 5줄 히스토리와 비교하여 중복 대사 제거 (A-B-A-B 패턴 방어)
                if (lastSentences.some(s => s === normalizedContent)) {
                    continue;
                }

                lastTime = currentTime;
                // 히스토리 업데이트 (최대 5줄 유지)
                lastSentences.push(normalizedContent);
                if (lastSentences.length > 5) lastSentences.shift();

                allMatches.push({ s: timeStr, o: content });
            }
        }

        // 마지막 버퍼에 남은 줄 처리
        if (fullText.trim()) {
            const match = fullText.match(lineRegex);
            if (match) {
                let content = match[2] ? match[2].replace(/^\|\|\s*/, '').trim() : '';
                if (content) {
                    const analysisResult = analyzeIntraLineRepetition(content);
                    if (analysisResult.status !== "BLOCKED") {
                        allMatches.push({ s: match[1], o: analysisResult.refined_text });
                    }
                }
            }
        }

        console.log(`[Stage 1] Parsed ${allMatches.length} sentences.`);

        if (allMatches.length === 0) {
            throw new Error(`분석 결과에서 데이터를 찾을 수 없습니다.`);
        }

        return normalizeTimestamps(allMatches);
    } catch (err) {
        console.error(`Stage 1 Global Timeline Error: `, err);
        throw err;
    }
}

export async function analyzeSentences(sentences, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey || !sentences?.length) return [];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: getModels(modelId)[0] || "gemini-2.0-flash",
        generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.1
        },
        safetySettings
    }, { apiVersion: "v1beta" });

    try {
        const result = await model.generateContent([
            STAGE2_PROMPT,
            `분석 대상 (번호와 대사): \n${sentences.map((s, i) => `${i}: ${s.o}`).join('\n')} `
        ]);
        const text = await result.response.text();

        // [New] Tag-based Parsing Logic (Robust against truncation)
        const items = [];
        const recordRegex = /###\[(\d+)\]###\s*([\s\S]*?)(?=\n###\[\d+\]###|\[END\]|$)/g;

        let match;
        while ((match = recordRegex.exec(text)) !== null) {
            const index = parseInt(match[1]);
            const content = match[2].trim();

            // 번역과 상세 분석 분리 (--- 구분자 기준)
            const parts = content.split('---');
            const translation = parts[0] ? parts[0].trim() : "";
            const analysis = parts[1] ? parts[1].trim() : "";

            if (translation || analysis) {
                items.push([index, translation, analysis]);
            }
        }

        if (items.length === 0) {
            console.warn("[Stage 2] No tags found in response, trying JSON fallback...");
            try {
                const start = text.indexOf('[');
                const end = text.lastIndexOf(']');
                if (start !== -1 && end > start) {
                    const jsonStr = text.substring(start, end + 1);
                    const parsed = JSON.parse(jsonStr);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(row => {
                            if (Array.isArray(row)) items.push(row);
                            else if (row && typeof row === 'object') {
                                items.push([row.number ?? row.id ?? 0, row.korean_translation ?? row.translation ?? "", row.analysis ?? row.detailed_analysis ?? ""]);
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn("[Stage 2] JSON Fallback also failed.");
            }
        }

        if (items.length === 0) {
            console.error("[Stage 2] All parsing failed. Raw response:", text.substring(0, 200));
        } else {
            console.log(`[Stage 2] Parsed ${items.length} records.`);
        }

        return items;
    } catch (err) {
        console.error(`[Stage 2] API Call Error:`, err);
        throw err;
    }

}

function normalizeTimestamps(data) {
    return data.map(item => {
        let s = String(item.s || "").replace(/[\[\]\s]/g, '').split(/[-~]/)[0];
        if (s.includes(':')) {
            const parts = s.split(':');
            const mm = parts[0].padStart(2, '0');
            let ssRaw = parts[1];

            const secNum = parseFloat(ssRaw) || 0;
            const formattedSS = secNum.toFixed(2).padStart(5, '0');

            s = `${mm}:${formattedSS} `;
        }
        return { ...item, s };
    }).sort((a, b) => {
        const parse = t => t.split(':').reduce((acc, v) => (60 * acc) + +v, 0);
        return parse(a.s) - parse(b.s);
    });
}

/**
 * Smart Filter: Detects and collapses mechanical hallucination loops.
 * Protects normal repetitions (e.g., song chorus) by checking timestamps.
 */
function filterMechanicalLoops(items) {
    if (items.length < 5) return items;

    const parseTime = t => {
        const parts = String(t).replace(/[\[\]\s]/g, '').split(':');
        if (parts.length < 2) return 0;
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    };

    const result = [];
    let repeatCount = 0;

    for (let i = 0; i < items.length; i++) {
        const current = items[i];
        const prev = i > 0 ? items[i - 1] : null;

        if (prev) {
            const timeDiff = parseTime(current.s) - parseTime(prev.s);
            const isSameText = current.o === prev.o;

            // SMART DETECTION: 
            // 1. Same text AND
            // 2. Time has NOT advanced (less than 0.1s difference)
            const isStuckLoop = isSameText && Math.abs(timeDiff) < 0.1;

            if (isStuckLoop) {
                repeatCount++;
            } else {
                repeatCount = 0;
            }
        } else {
            repeatCount = 0;
        }

        // Only block if we've seen the exact same line at the exact same time more than 5 times.
        // This stops 4000+ line explosions while keeping regular repeats where time moves forward.
        if (repeatCount < 5) {
            result.push(current);
        } else if (repeatCount === 5) {
            console.warn(`[Filter] AI Hallucination Loop Detected at ${current.s}. Collapsing subsequent repeats.`);
        }
    }

    return result;
}

/**
 * ★ 개선 2: 단일 라인 내부 반복 감지 및 정제 (다국어 지원)
 * 3단계 규칙에 따라 문장을 PASS, TRUNCATED, BLOCKED로 분류하고 정제된 텍스트를 반환합니다.
 */
function analyzeIntraLineRepetition(text) {
    if (!text) return { original_text: text, refined_text: text, status: "PASS" };

    const detectedLang = detectLanguage(text);

    // 1단계: 비정상적인 길이 차단 (BLOCKED)
    if (text.length > 500) {
        let blockedMsg = "[시스템: 비정상적으로 긴 텍스트 차단됨]";
        if (detectedLang === "vi") blockedMsg = "[Hệ thống: Văn bản quá dài bị chặn]";
        else if (detectedLang === "en") blockedMsg = "[System: Abnormally long text blocked]";

        return {
            original_text: text,
            refined_text: blockedMsg,
            status: "BLOCKED"
        };
    }

    // 2단계: 연속된 단어 도배 부분 압축 (TRUNCATED)
    // 유니코드 지원을 위해 \b 대신 공백 및 경계 조건을 활용한 정규식 사용
    // (?:^|\s) : 시작 또는 공백 뒤의 단어 포착
    // (\S+) : 반복될 단어 그룹
    // (?:\s+\1){2,} : 해당 단어가 공백과 함께 2번 이상 더 반복 (총 3번 이상)
    // (?=\s|$) : 공백 또는 문장의 끝으로 마무리
    const regex = /(?:^|\s)(\S+)(?:\s+\1){2,}(?=\s|$)/gi;
    let isTruncated = false;

    let refined_text = text.replace(regex, (match, word) => {
        isTruncated = true;
        let ellipsis = "... [반복 생략]";
        if (detectedLang === "vi") ellipsis = "... [lược bỏ lặp lại]";
        else if (detectedLang === "en") ellipsis = "... [Repetition Omitted]";

        // 정규식 그룹에 따라 앞에 공백이 포함될 수 있으므로 trim 및 적절한 포맷팅
        return ` ${word.trim()}${ellipsis}`;
    }).trim();

    if (isTruncated) {
        return {
            original_text: text,
            refined_text: refined_text,
            status: "TRUNCATED"
        };
    }

    // 3단계: 정상 텍스트 (PASS)
    return {
        original_text: text,
        refined_text: text,
        status: "PASS"
    };
}

/**
 * 텍스트의 언어를 대략적으로 판별하는 헬퍼 함수
 */
function detectLanguage(text) {
    // 베트남어 특수 문자 (성조 등)
    const vietnameseRegex = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]/;
    // 한글 특수 문자
    const koreanRegex = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;

    if (koreanRegex.test(text)) return "ko";
    if (vietnameseRegex.test(text)) return "vi";

    // 기본적으로 영어나 기타 알파벳
    return "en";
}

/**
 * 시간 문자열을 초 단위 숫자로 변환 (서킷 브레이커에서 사용)
 */
function parseTimeString(t) {
    const parts = String(t).replace(/[\[\]\s]/g, '').split(':');
    if (parts.length < 2) return 0;
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

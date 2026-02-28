import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 사람의 음성을 포착하여 **정확한 타임라인**에 기록하는 '인음 전문 전사가'입니다. 

**[핵심 규칙: 타임라인 절대 준수 및 지능적 분할]**
1. **절대 시계(Absolute Clock) 동기화**: 모든 문장의 시작 시간은 미디어의 실제 재생 시간과 100% 일치해야 합니다. 짧게 쪼개질수록 싱크 포인트를 더 자주 리셋하여 초정밀 동기화를 유지하십시오.
2. **의미 단위 세밀 청킹(Semantic Chunking)**: 한 줄에 너무 긴 문장을 담지 마십시오. 접속사('và', 'nhưng', 'vì' 등), 문장 부호(',', '.'), 혹은 논리적 매듭에서 타임라인을 끊어 여러 줄로 전사하십시오. (조각당 5~10단어 권장)
3. **문법 패턴 무결성 보호**: 'nếu...thì', 'càng...càng', 'đâu có...đâu' 등 짝을 이루는 패턴은 내부에서 쪼개지 말고 하나의 원자적 단위(Atomic Unit)로 취급하여 한 줄에 통째로 담으십시오. 패턴이 아닌 지점(접속사 등)에서만 분할하십시오.
4. **강제 전진(Forced Forward)**: 한 번 전사한 지점은 즉시 지나치고, 무조건 미디어의 다음 시간대로 시선을 옮기십시오. 동일 문장 반복은 절대 금지됩니다.
5. **인음(Human Vocal) 우선순위**: 배경음악, 잡음은 무시하고 인간의 목소리 주파수에만 집중하십시오. 음성이 불분명하다면 시간만 흘려보낸 뒤 다음 구간에서 재개하십시오.

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
당신은 베트남어-영어-한국어 전문 번역가이자 언어 분석가입니다. 
주어진 문장을 한국어로 번역하고, 모바일 가독성을 최우선으로 하여 아래 **[상세 분석 규칙]**에 따라 상세히 풀이하십시오.

**[상세 분석 규칙]**
1. **의미 단위(Chunk-centric) 분할**: 문장을 문법적/의미적 덩어리(청크)로 나누어 분석하십시오.
2. **패턴/기능어 우선 설명**: 조건('Nếu...thì'), 양보('Even though'), 미래('sẽ'), 부정('không') 등 문법 패턴이나 중요 기능어를 독립된 분석행으로 먼저 설명하십시오.
3. **계층적 상세 풀이**: 청크 전체 뜻을 먼저 쓰고, 그 뒤에 구성 단어들의 뜻을 괄호'()'와 '+'를 사용하여 같은 줄에 포함하십시오.
   - 형식: [분석] 베트남어/영어 청크: 한국어 전체 뜻 (단어: 뜻 + 단어: 뜻)
4. **한자어 노이즈 제거**: 순수 한국어 뜻만 간결하게 제공하십시오.
5. **초단축 미니멀리즘**: 서술형을 배제하고 핵심 뜻과 기능 키워드만 단어 위주로 짧게 표기하십시오.

**[출력 형식]**
[번역] 번역된 한국어 문장
[분석] 청크: 한국어 전체 뜻 (단어: 뜻 + 단어: 뜻)

**[작성 예시 - 베트남어]**
문장: "Nếu chúng ta không chuẩn bị cẩn thận thì sẽ gặp rất nhiều khó khăn trong tương lai."
[번역] 만약 우리가 신중하게 준비하지 않으면 미래에 매우 많은 어려움을 겪을 것이다.
[분석] Nếu... thì: 만약 ~하면 ~하다 (조건/패턴)
[분석] chúng ta không: 우리는 ~않다 (chúng ta: 우리 + không: 부정)
[분석] chuẩn bị cẩn thận: 신중히 준비하다 (chuẩn bị: 준비 + cẩn thận: 신중히)
[분석] sẽ gặp: 겪을 것이다 (sẽ: 미래 + gặp: 만나다/겪다)
[분석] rất nhiều khó khăn: 매우 많은 어려움 (rất: 매우 + nhiều: 많은 + khó khăn: 어려움)
[분석] trong tương lai: 미래에 (trong: ~안에 + tương lai: 미래)

**[작성 예시 - 영어]**
문장: "Even though the deadline is approaching fast, we must ensure that every single detail is handled with extreme care."
[번역] 마감 기한이 빠르게 다가오고 있음에도 불구하고, 우리는 모든 세부 사항이 극도로 세심하게 처리되도록 보장해야 합니다.
[분석] Even though: ~임에도 불구하고 (양보/패턴)
[분석] the deadline is: 마감 기한이 ~이다 (deadline: 마감일 + is: 현재)
[분석] approaching fast: 빠르게 다가오다 (approach: 다가가다 + fast: 빨리)
[분석] we must ensure: 보장해야 한다 (we: 우리 + must: 의무 + ensure: 확실히 하다)
[분석] every single detail: 모든 세부 사항 (every: 모든 + single: 단 하나의 + detail: 세부사항)
[분석] is handled: 처리되다 (is: 상태 + handled: 다뤄지다/수동)
[분석] with extreme care: 극도로 세심하게 (with: ~와 함께 + extreme: 극도의 + care: 주의)
`;

const STAGE2_BATCH_PROMPT = `
당신은 베트남어-영어-한국어 전문 번역가이자 언어 분석가입니다. 
여러 개의 문장을 한 번에 분석해야 합니다. 각 문장별로 아래 **[상세 분석 규칙]**을 엄격히 준수하여 답변하십시오.

**[상세 분석 규칙]**
1. **청크 기반 분할 분석**: 문장을 의미 덩어리별로 나누어 상세히 풀이하십시오.
2. **패턴 및 기능 강조**: 주요 문법 패턴(조건, 양보, 미래, 부정 등)을 최우선적으로 분석행에 포함시키십시오.
3. **표준 분석 형식**: "[분석] 청크: 전체 뜻 (단어: 뜻 + 단어: 뜻)" 형식을 절대 엄수하십시오.
4. **미니멀리즘**: 서술형 표현 대신 핵심 키워드와 뜻만 간결하게 표기하십시오.

**[중요: 배칭 출력 형식]**
각 문장의 시작과 끝에 아래와 같은 명확한 인덱스 마커를 사용하십시오.
--- [INDEX: 번호] START ---
[번역] 번역된 한국어 문장
[분석] 청크/패턴: 뜻 (요소별 풀이)
...
--- [INDEX: 번호] END ---

**[주의 사항]**
- 입력된 모든 문장을 순서대로 빠짐없이 분석하십시오.
- 분석 예시와 동일한 품질과 수준으로 상세하게 분해하여 설명하십시오.
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
            generationConfig: { temperature: 0.1 },
            safetySettings
        }, { apiVersion: "v1beta" });

        const streamResult = await model.generateContentStream([mediaData, STAGE1_PROMPT]);
        const lineRegex = /^[\s\-\*\>\#]*(?:\[)?(\d{1,2}:\d{1,2}(?:[.:]\d+)?)(?:\])?\s*(?:\|\|)?\s*(.+)/;

        let fullText = "";
        let allMatches = [];
        let lastSentences = [];
        const historyCache = new Map();

        for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            if (!chunkText) continue;
            fullText += chunkText;

            const lines = fullText.split('\n');
            fullText = lines.pop() || "";

            for (const line of lines) {
                const match = line.match(lineRegex);
                if (!match) continue;

                const timeStr = match[1];
                let content = match[2] ? match[2].replace(/^\|\|\s*/, '').trim() : '';
                if (!content) continue;

                const analysisResult = analyzeIntraLineRepetition(content);
                if (analysisResult.status === "BLOCKED") {
                    content = analysisResult.refined_text;
                } else if (analysisResult.status === "TRUNCATED") {
                    content = analysisResult.refined_text;
                }

                const currentTime = parseTimeString(timeStr);
                const normalizedContent = content.toLowerCase().trim();

                if (normalizedContent.length <= 50) {
                    if (historyCache.has(normalizedContent)) {
                        const lastSeenTime = historyCache.get(normalizedContent);
                        if (currentTime - lastSeenTime < 5.0) continue;
                    }
                    historyCache.set(normalizedContent, currentTime);
                }

                if (lastSentences.some(s => s === normalizedContent)) continue;
                lastSentences.push(normalizedContent);
                if (lastSentences.length > 5) lastSentences.shift();

                allMatches.push({ s: timeStr, o: content });
            }
        }

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

        if (allMatches.length === 0) throw new Error("No data found.");
        return normalizeTimestamps(allMatches);
    } catch (err) {
        console.error(`Stage 1 Error: `, err);
        throw err;
    }
}

/**
 * [Stage 2] 여러 문장 일괄 분석 (Batch)
 */
export async function analyzeBatchSentences(items, apiKey, modelId, signal) {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId || "gemini-2.0-flash",
        generationConfig: { temperature: 0.3 },
        safetySettings
    });

    const inputContent = items.map(item => `문장 (INDEX: ${item.index}): ${item.text}`).join('\n');
    const prompt = `${STAGE2_BATCH_PROMPT}\n\n분석할 문장 목록:\n${inputContent}`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        }, { signal });

        const response = await result.response;
        const text = response.text();

        // 인덱스 마커별로 쪼개기
        const results = [];
        for (const item of items) {
            const startMarker = `--- [INDEX: ${item.index}] START ---`;
            const endMarker = `--- [INDEX: ${item.index}] END ---`;

            const startIndex = text.indexOf(startMarker);
            const endIndex = text.indexOf(endMarker);

            if (startIndex !== -1 && endIndex !== -1) {
                const subText = text.substring(startIndex + startMarker.length, endIndex);
                const translationMatch = subText.match(/\[번역\]\s*(.*)/);
                const analysisLines = [...subText.matchAll(/\[분석\]\s*(.*)/g)].map(m => m[1]);

                results.push({
                    index: item.index,
                    translation: translationMatch ? translationMatch[1].trim() : "",
                    analysis: analysisLines.join("\n").trim()
                });
            } else {
                console.warn(`[Stage 2] Could not find markers for index ${item.index}`);
                results.push({ index: item.index, translation: "", analysis: "", failed: true });
            }
        }
        return results;
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error(`[Stage 2] Batch analysis failed:`, error);
        return items.map(item => ({ index: item.index, failed: true }));
    }
}

/**
 * [Stage 2] 단일 문장 정밀 분석
 * 텍스트 마커를 사용하여 파싱 에러를 방지합니다.
 */
export async function analyzeSingleSentence(item, index, apiKey, modelId, signal) {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId || "gemini-2.0-flash",
        generationConfig: { temperature: 0.3 },
        safetySettings
    });

    const prompt = `${STAGE2_PROMPT}\n\n분석할 문장 (번호: ${index}):\n${item.text}`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        }, { signal });

        const response = await result.response;
        const text = response.text();

        // 텍스트 마커 파싱 ([번역], [분석])
        const translationMatch = text.match(/\[번역\]\s*(.*)/);
        const analysisLines = [...text.matchAll(/\[분석\]\s*(.*)/g)].map(m => m[1]);

        return {
            index,
            translation: translationMatch ? translationMatch[1].trim() : "",
            analysis: analysisLines.join("\n").trim()
        };
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error(`[Stage 2] Failed sentence ${index}:`, error);
        return null;
    }
}

function normalizeTimestamps(data) {
    return data.map(item => {
        let s = String(item.s || "").replace(/[\[\]\s]/g, '').split(/[-~]/)[0];
        if (s.includes(':')) {
            const parts = s.split(':');
            const mm = parts[0].padStart(2, '0');
            const ssRaw = parts[1];
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

function analyzeIntraLineRepetition(text) {
    if (!text) return { original_text: text, refined_text: text, status: "PASS" };
    const detectedLang = detectLanguage(text);
    if (text.length > 2000) {
        let blockedMsg = "[시스템: 비정상적으로 긴 텍스트 차단됨]";
        if (detectedLang === "vi") blockedMsg = "[Hệ thống: Văn bản quá dài bị chặn]";
        else if (detectedLang === "en") blockedMsg = "[System: Abnormally long text blocked]";
        return { original_text: text, refined_text: blockedMsg, status: "BLOCKED" };
    }
    const regex = /(?:^|\s)(\S+)(?:\s+\1){2,}(?=\s|$)/gi;
    let isTruncated = false;
    let refined_text = text.replace(regex, (match, word) => {
        isTruncated = true;
        let ellipsis = "... [반복 생략]";
        if (detectedLang === "vi") ellipsis = "... [lược bỏ lặp lại]";
        else if (detectedLang === "en") ellipsis = "... [Repetition Omitted]";
        return ` ${word.trim()}${ellipsis}`;
    }).trim();
    return { original_text: text, refined_text: refined_text, status: isTruncated ? "TRUNCATED" : "PASS" };
}

function detectLanguage(text) {
    const vietnameseRegex = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]/;
    const koreanRegex = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
    if (koreanRegex.test(text)) return "ko";
    if (vietnameseRegex.test(text)) return "vi";
    return "en";
}

function parseTimeString(t) {
    const parts = String(t).replace(/[\[\]\s]/g, '').split(':');
    if (parts.length < 2) return 0;
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

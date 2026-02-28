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
당신은 베트남어-한국어 전문 번역가이자 언어 분석가입니다. 
주어진 문장을 한국어로 번역하고, 모바일 가독성을 최우선으로 하여 아래 **[7대 분석 규칙]**에 따라 상세 분석하십시오.

**[7대 분석 규칙]**
**[7대 분석 규칙]**
1. **의미 단위(Chunk-centric) 통합 분석 (최우선)**: 단어를 개별적으로 나열하지 마십시오. 반드시 의미가 형성되는 최소 단위인 '청크(Chunk)'(예: 주어+동사, 동사+목적어, 부사+동사 등)를 분석의 기본 단위로 삼으십시오.
2. **청크 내 전수 분석**: 하나의 청크로 묶인 내부의 모든 단어를 상세히 풀이하십시오. 'Và mình sẽ'처럼 기능어가 포함된 구절은 반드시 하나의 행으로 묶어서 분석하십시오.
3. **반복 설명 허용**: 이전 문장에서 나온 단어라도 현재 문장에서 쓰였다면 생략하지 말고 다시 설명하십시오.
4. **계층적 한 줄 분석(Hierarchical One-Line)**: 청크 전체 뜻을 먼저 쓰고, 그 뒤에 구성 단어들의 개별 의미를 괄호'()'와 '+'를 사용하여 같은 줄에 포함하십시오. (형식: 청크: 뜻 (단어1: 뜻 + 단어2: 뜻))
5. **한자어 병기**: 한자 기반 단어는 반드시 한자 및 한국어 독음을 병기하십시오. (예: chuẩn bị(準備, 준비))
6. **문법 패턴 통합 필축**: 'nếu...thì', 'càng...càng' 등 상관 접속사 패턴은 최우선적으로 묶어서 설명하며, 반드시 **굵게(Bold)** 표시하십시오.
7. **미니멀리즘 설명**: 모바일 화면 가독성을 위해 불필요한 수식어는 배제하고 핵심 뜻 위주로 간결하게 설명하십시오.

**[출력 형식]**
[번역] 번역된 한국어 문장
[분석] 베트남어 청크: 한국어 전체 뜻 (상세 단어: 뜻 + 상세 단어: 뜻)

**[구현 예시]**
문장: Và mình sẽ ngồi nhà đọc đánh giá.
[번역] 그리고 나는 집에 앉아 리뷰를 읽을 것이다.
[분석] Và mình sẽ: 그리고 나는 ~할 것이다 (Và: 그리고 + mình: 나 + sẽ: ~할 것이다/미래시제)
[분석] ngồi nhà: 집에 앉다 (ngồi: 앉다 + nhà: 집)
[분석] đọc đánh giá: 리뷰를 읽다 (đọc: 읽다 + đánh giá: 평가/리뷰 (đánh: 치다 + giá: 값))
...
문장번호: [번호] 끝

**[주의 사항]**
1. 모든 분석 내용은 반드시 한 줄에 하나씩 [분석] 마커로 시작하십시오.
2. JSON 기호를 절대 사용하지 마십시오. 오직 텍스트로만 답변하십시오.
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
 * [Stage 2] 단일 문장 정밀 분석
 * 텍스트 마커를 사용하여 파싱 에러를 방지합니다.
 */
export async function analyzeSingleSentence(item, index, apiKey, modelId, signal) {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId || "gemini-2.0-flash",
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
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

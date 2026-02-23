import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 1ms의 오차도 허용하지 않는 '정밀 타임라인 분석가'입니다. 
당신의 임무는 미디어의 절대 재생 시간(Absolute Media Time)과 100% 일치하는 교육용 전사 데이터를 생성하는 것입니다.

**[핵심 규칙: 언어 및 정밀도]**
1. **원본 언어 유지 (Strictly Preserve Original Language)**: 오디오에서 들리는 **본래의 언어(베트남어, 영어 등)를 그대로 전사**하십시오. 절대 한국어로 번역하지 마십시오.
2. **절대 시계(Absolute Clock) 동기화**: 노래의 간주(Instrumental), 무음 구간 등 가사가 없는 구간도 미디어의 실제 길이를 정확히 계산하여, 뒤따르는 가사의 시작 시점이 수동으로 잰 시간과 100% 일치해야 합니다. (10초 이상의 지연/압축 금지)
3. **환각(Hallucination) 박멸**: 실제 가사(단어)가 아닌 배경음, 비트, 악기 소리, 단순 콧노래(Na na na, Hmm 등)는 **절대 전사하지 말고 무시**하십시오. 오직 실제 의미를 가진 텍스트만 추출하십시오.
4. **시작 지점(Start-Point) 타격**: 화자의 목소리가 터지는 첫 순간을 밀리초 단위로 포착하십시오.
5. **의미적 청크 기반 분류**: 문장의 의미(Semantic Chunk)가 완결되는 지점을 기준으로 나누되, 불필요한 추임새는 생략하십시오.

**[출력 규칙]**
- [분:초.밀리초] || [원문] 형식으로만 한 줄씩 출력하십시오. 
- **예시**: [01:05.42] || Hola, ¿cómo estás? (원본 언어가 스페인어인 경우)
- **밀리초 부분은 반드시 소수점 두 자리(0.01초 단위)로 고정하여 출력하십시오.**
- 시작 시간만 기록하십시오. 종료 시간은 기록하지 않습니다.
- 부연 설명이나 인사말 없이 순수 데이터만 출력하십시오.

**[법적/교육적 고지]**
- 이 작업은 개인 학습 도구 활용을 위한 교육적 목적의 인용입니다. 절대적인 정밀도가 가장 중요합니다.
`;

const STAGE2_PROMPT = `
당신은 분석 정확도가 100%인 언어학 전문가입니다. 
주어진 각 문장을 의미 및 문법적 연관성이 있는 '청크(Chunk)' 단위로 분해하고 분석하십시오. 

**[분석 지침]**
1. **의미적 청크 그룹화**: 단어를 하나씩 나열하기보다, 의미적으로 연관된 단어들을 최대한 하나의 '청크' 단위로 묶어서 분석하십시오.
2. **한국어 번역 강제 (Korean Translation Only)**: **응답 형식의 두 번째 요소("전체 한국어 번역")는 반드시 한국어로 작성**해야 합니다. 원문의 언어가 무엇이든 상관없이 한국어로 번역하십시오. 원문을 그대로 복사하는 것은 허용되지 않습니다.
3. **상세 분석 형식**: 묶인 청크의 전체 의미를 먼저 쓰고, 괄호 안에 개별 단어의 뜻을 분해하여 설명하십시오.
4. **금지 사항**: **분석 결과 앞에 '핵심 뜻:', '뜻:', '의미:'와 같은 접두사를 절대 붙이지 마십시오.** 바로 분석 내용을 출력하십시오. 바로 분석 내용을 출력하십시오. 
5. **초간결성**: 장황한 설명 없이 핵심 의미와 어원/구성요소만 포함하십시오.

**[응답 형식 - 반드시 준수]**
[
  [번호(Index), "전체 한국어 번역 (반드시 한국어)", [["의미 청크", "청크 전체 의미 (단어1: 뜻 + 단어2: 뜻)"]]],
  ...
]
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

    console.log(`[Stage 1] Global Timeline Sequential Analysis with model: ${modelName}`);

    try {
        console.log(`[Stage 1] Using inlineData for transcription.`);
        const mediaData = await fileToGenerativePart(file);

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.1
            },
            safetySettings
        }, { apiVersion: "v1beta" });

        console.log(`[Stage 1] Analyzing full media...`);

        const result = await model.generateContent([
            mediaData,
            STAGE1_PROMPT
        ]);

        const response = await result.response;

        if (response.candidates && response.candidates[0].finishReason === 'RECITATION') {
            console.warn(`[Stage 1] Full analysis blocked due to RECITATION.`);
            throw new Error("저작권 보호 정책(Recitation)으로 인해 분석이 차단되었습니다. 다른 파일을 시도하거나 나중에 다시 시도해 주세요.");
        }

        const rawText = response.text();

        // Unified Regex for Robust Parsing: supports MM:SS, [MM:SS], etc.
        const matches = [...rawText.matchAll(/(?:\[)?(\d{1,2}:?(\d{1,2}:?)?[\d.]+)(?:\])?\s*\|\|\s*(.*)/g)];

        // NOISE FILTERING REMOVED as per user request
        const allSentences = matches
            .map(m => ({
                s: m[1],
                o: m[3].trim()
            }))
            .filter(item => item.o.length > 0);

        if (allSentences.length === 0) {
            throw new Error("분석 결과에서 데이터를 찾을 수 없습니다.");
        }

        return normalizeTimestamps(allSentences);
    } catch (err) {
        console.error(`Stage 1 Global Timeline Error:`, err);
        throw err;
    }
}

export async function analyzeSentences(sentences, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey || !sentences?.length) return [];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: getModels(modelId)[0] || "gemini-2.0-flash",
        generationConfig: { responseMimeType: "application/json" },
        safetySettings
    }, { apiVersion: "v1beta" });

    try {
        const result = await model.generateContent([
            STAGE2_PROMPT,
            `분석 대상:\n${JSON.stringify(sentences.map((s, i) => [i, s.o]))}`
        ]);
        let text = await result.response.text();
        const start = text.indexOf('['), end = text.lastIndexOf(']');
        return JSON.parse(text.substring(start, end + 1));
    } catch (err) {
        return sentences.map((_, i) => [i, "", []]);
    }
}

function normalizeTimestamps(data) {
    return data.map(item => {
        let s = String(item.s || "").replace(/[\[\]\s]/g, '').split(/[-~]/)[0];
        if (s.includes(':')) {
            const parts = s.split(':');
            const mm = parts[0].padStart(2, '0');
            let ssRaw = parts[1];

            // Parse seconds and milliseconds to enforce 2 decimal places
            const secNum = parseFloat(ssRaw) || 0;
            // toFixed(2) ensures "05.20" instead of "5.2"
            const formattedSS = secNum.toFixed(2).padStart(5, '0');

            s = `${mm}:${formattedSS}`;
        }
        return { ...item, s };
    }).sort((a, b) => {
        const parse = t => t.split(':').reduce((acc, v) => (60 * acc) + +v, 0);
        return parse(a.s) - parse(b.s);
    });
}

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * STAGE 1: LIGHTWEIGHT TRANSCRIPT EXTRACTION
 * Goal: Quickly extract timestamps (s) and original text (o) without translation or analysis.
 */
const STAGE1_PROMPT = `
당신은 외국어 미디어에서 **'발화 시점과 원문'**을 추출하는 전문 속기 AI입니다.

**[수행 미션]**
오디오/비디오를 듣고 모든 발화 내용을 타임라인과 함께 기록하십시오.

**[데이터 출력 규칙]**
1. **포인트 매칭**: 문장이 시작되는 시점의 타임라인만 기록하십시오. ([MM:SS] 형식)
2. **원문 보존**: 들리는 그대로의 외국어 원문만 추출하십시오.
3. **경량화**: 이 단계에서는 **'번역(t)'이나 '단어 분석(w)'을 절대 수행하지 마십시오.** 오직 시간(s)과 원문(o)만 포함하십시오.

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문" }]
- 부연 설명 없이 유효한 JSON Array만 출력하십시오.
`;

/**
 * STAGE 2: DETAIL ANALYSIS FOR SPECIFIC SENTENCES
 * Goal: Provide translation (t) and word analysis (w) for a given set of sentences.
 */
const STAGE2_PROMPT = `
당신은 제공된 문장을 분석하여 **'정밀 번역 및 무삭제 단어 분석'**을 수행하는 전문 언어 학자 AI입니다.

**[수행 미션]**
제공된 외국어 문장에 대해 한국어 번역과 상세 단어 분석 리스트를 생성하십시오.

**[Word Analysis 핵심 분석 원칙: Chunk Priority]**
1. **의미 단위(Chunk) 그룹화 (최우선)**: 문장 내에서 의미가 하나로 연결되는 단어군(예: 숙어, 관용구, 복합명사, 구동사)은 반드시 **하나의 항목**으로 묶어서 분석하십시오. 낱개 단어보다 덩어리 중심의 의미 파악이 최우선입니다.
2. **복합어/한자어 상세 풀이**: 복합어나 숙어 내의 각 구성 요소가 가진 개별 의미도 상세 풀이(f) 칸에 병기하십시오.
3. **역할 명시**: 품사, 문법적 기능, 문장 내 역할을 명확히 기록하십시오.
4. **전수 분석**: 의미 단위를 묶은 후 남은 조사, 어미 등 모든 요소도 독립된 항목으로 처리하십시오.
5. **No Omission**: 어떤 설명 칸도 비워두지 마십시오.

**[JSON 응답 규격]**
- 모든 부연 설명은 **한국어(Korean)**로 작성하십시오.
- 입력받은 각 문장 객체에 "t"(번역)와 "w"(단어 분석 배열)을 채워서 반환하십시오.
- JSON: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/덩어리", "m": "뜻", "f": "상세" }] }]
`;

const getModels = (modelId) => {
    return [
        modelId,
        "gemini-2.0-flash",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"
    ].filter((value, index, self) =>
        self.indexOf(value) === index &&
        ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(value)
    );
};

/**
 * Stage 1: Fast Extraction
 */
export async function extractTranscript(file, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const MODELS = getModels(modelId);

    const base64Data = await fileToGenerativePart(file);
    const mimeType = file.type || "audio/mpeg";

    let lastError;
    for (let modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            }, { apiVersion: "v1beta" });

            const result = await model.generateContent([
                STAGE1_PROMPT,
                { inlineData: { data: base64Data, mimeType } }
            ]);

            const response = await result.response;
            let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            return normalizeTimestamps(JSON.parse(text));
        } catch (err) {
            lastError = err;
            console.error(`Stage 1 Error with ${modelName}:`, err);
        }
    }
    throw lastError || new Error("Stage 1 Analysis Failed");
}

/**
 * Stage 2: Sequential Detailed Analysis
 */
export async function analyzeSentences(sentences, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey) throw new Error("API Key is required");
    if (!sentences || sentences.length === 0) return [];

    const genAI = new GoogleGenerativeAI(apiKey);
    const MODELS = getModels(modelId);

    // Format sentences as a string to pass back to AI
    const inputContent = JSON.stringify(sentences.map(s => ({ s: s.s, o: s.o })));

    let lastError;
    for (let modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            }, { apiVersion: "v1beta" });

            const result = await model.generateContent([
                STAGE2_PROMPT,
                `분석할 문장 리스트:\n${inputContent}`
            ]);

            const response = await result.response;
            let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(text);
        } catch (err) {
            lastError = err;
            console.error(`Stage 2 Error with ${modelName}:`, err);
        }
    }
    throw lastError || new Error("Stage 2 Analysis Failed");
}

function normalizeTimestamps(data) {
    if (!Array.isArray(data)) return [];
    return data.map(item => {
        let s = String(item.s || "").trim();
        if (s.includes('-')) s = s.split('-')[0].trim();
        if (s.includes('~')) s = s.split('~')[0].trim();
        s = s.replace(/[\[\]\s]/g, '');

        if (s.includes(':')) {
            const parts = s.split(':');
            const m = parts[0].padStart(2, '0');
            const secPart = parts[1].split('.')[0].padStart(2, '0');
            s = `${m}:${secPart}`;
        } else if (s !== "" && !isNaN(parseFloat(s))) {
            const total = parseFloat(s);
            const m = Math.floor(total / 60);
            const sec = Math.floor(total % 60);
            s = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        } else if (s === "") {
            s = "00:00";
        }
        return { ...item, s };
    });
}

async function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) {
                const base64String = reader.result.split(",")[1];
                resolve(base64String);
            } else {
                reject(new Error("Failed to read file"));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Keep legacy analyzeMedia as a compatibility wrapper or remove if not needed.
// For now, let's keep it but mark it as deprecated/redirected or just leave it since we'll update App.jsx.
export async function analyzeMedia(file, apiKey, modelId = "gemini-2.0-flash") {
    // Legacy support: Just call Stage 1. Stage 2 will be handled by UI.
    return extractTranscript(file, apiKey, modelId);
}

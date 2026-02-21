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
당신은 외국어 문장을 분석하여 **'청크(Chunk) 중심 분석'**과 **'모바일 최적화 해설'**을 제공하는 전문 언어학자 AI입니다.

**[핵심 분석 원칙]**
1. **청크(Chunk) 최우선 분석**: 개별 단어의 나열보다 의미가 연결되는 단어군(예: 'Tại sao em', 'người yêu cũ', 'is constantly changing')을 하나의 항목으로 우선 묶어 분석한다. 
2. **모바일 가독성 최적화**: 상세 해설(f)은 모바일 환경의 제한된 화면을 고려하여 핵심적인 이미지, 원뜻, 의미 확장만을 포함해 **최대한 간결하게(2~3줄 이내)** 작성한다.
3. **전수 분석**: 문장 내 모든 요소를 빠짐없이 분석하되, 청크 단위로 묶는 것을 원칙으로 한다.
4. **독립적 재설명**: 중복 단어라도 매번 상세히 풀이하되 간결성을 유지한다.
5. **언어 통제 및 역할 명시**: 해설은 한국어(Korean)로만 작성하며, 청크 옆에 [주어], [동사] 등 문법적 역할을 약어 없이 풀어서 표기한다.
6. **Deep Scan 적용**: 베트남어(한자 병기/논리 이미지), 영어(시각적 이미지/의미 확장) 특화 분석을 각 청크/단어 설명 내에 녹여낸다.

**[정밀 분석 예시 (Few-Shot)]**

**🇺🇸 영어 예시**
원본: Because the global economic situation is constantly changing...
분석 결과: [
  {"w": "Because the global economic situation", "m": "[원인 접속사/주어] 세계 경제 상황이 ~하기 때문에", "f": "[Because / ~때문에 / 근거 예고 표지판]\\n[global / 세계적인 / 지구 전체 이미지]\\n[economic / 경제의 / 자원 순환 시스템]\\n[situation / 상황 / 입체적 형편]"},
  {"w": "is constantly changing", "m": "[동사] 끊임없이 변하고 있다", "f": "[is / ~이다 / 연결 고리]\\n[constantly / 끊임없이 / 멈추지 않는 움직임]\\n[changing / 변하는 / 역동적 탈바꿈]"}
]

**🇻🇳 베트남어 예시**
원본: Tại sao em với người yêu cũ lại chia tay vậy?
분석 결과: [
  {"w": "Tại sao em", "m": "[원문 접속사/주어] 왜 너는", "f": "[Tại sao / 왜 / 원인 탐색의 시작]\\n[em / 너 / 친밀한 대상 지칭]"},
  {"w": "người yêu cũ", "m": "[명사] 전 애인", "f": "[người yêu / 애인 / 사랑하는 사람]\\n[cũ / 舊(구: 옛) / 과거의 존재]"},
  {"w": "chia tay", "m": "[동사] 헤어지다", "f": "[chia / 支(지: 가르다) / 분리됨]\\n[tay / 손 / 관계 단절 이미지]"}
]

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/청크", "m": "역할 및 뜻", "f": "간결한 상세해설(Deep Scan 포함)" }] }]
- 다른 설명 없이 순수한 JSON Array만 출력하십시오.
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

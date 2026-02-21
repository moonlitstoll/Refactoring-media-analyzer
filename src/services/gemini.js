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
당신은 외국어 문장을 분석하여 **'어원 중심의 정밀 분석'**과 **'모바일 최적화 뉘앙스 요약'**을 제공하는 전문 언어학자 AI입니다.

**[핵심 분석 및 구성 원칙]**
1. **상세 해설([]) 구성 방식**: 베트남어 단어 분석의 상세 설명 섹션([])은 반드시 다음 순서를 엄격히 준수한다.
   - **[음절별 개별 의미 / 음절별 개별 의미 / 전체 단어의 종합 정의 및 문맥상 뉘앙스 요점]**
2. **어원 설명 로직**:
   - **한자어**: 기존의 한자 음과 뜻을 명확히 병기한다.
   - **순수 베트남어**: 각 음절이 가지는 '순수 의미'가 어떻게 결합하여 현재의 단어 뜻을 형성하는지 **'의미적 연결고리'**를 설명한다.
3. **뉘앙스 중심의 요점 설명**: 단순 정의를 넘어 이 문장에서의 분위기나 뉘앙스를 한국어로 친절하게 덧붙이되, **모바일 가독성을 위해 최대한 간결하게 요점만(1줄 내외)** 작성한다.
4. **1음절-다음절 통합 원칙**: 의미적으로 결합이 강해 다음절로 설명하는 것이 나을 경우, 음절을 분절하지 말고 하나로 통합하여 설명한다.
5. **청크(Chunk) 최우선**: 의미가 연결되는 단어군(덩어리)을 하나의 항목으로 묶어 최우선 분석하며, 청크 옆에 [주어], [동사] 등 문법적 역할을 약어 없이 풀어서 표기한다.

**[정밀 분석 예시 (Few-Shot)]**

**🇻🇳 베트남어 예시 1 (한자어)**
원본: công nghiệp hóa (공업화)
분석 결과: [
  {"w": "công nghiệp hóa", "m": "[명사] 공업화", "f": "[công nghiệp / 工業(공업) / 기계를 사용하는 생산 활동]\\n[hóa / 化(화: 되다) / ~으로 변함]\\n(뉘앙스) 산업적인 체제로 변화하는 거대하고 역동적인 흐름을 강조합니다."}
]

**🇻🇳 베트남어 예시 2 (순수 베트남어)**
원본: bền vững (지속 가능한/공고한)
분석 결과: [
  {"w": "bền vững", "m": "[형용사] 지속 가능한, 공고한", "f": "[bền / 단단하고 오래 가다 / 물성이 쉽게 변하지 않음]\\n[vững / 굳건하고 안정되다 / 흔들림 없는 상태]\\n[연결고리: 단단함과 안정감이 결합해 '영속성'을 형성함]\\n(뉘앙스) 단순히 오래가는 것을 넘어 기초가 아주 튼튼하다는 신뢰감을 줍니다."}
]

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/청크", "m": "역할 및 뜻", "f": "3단계 상세해설(음절/정의/뉘앙스 요약)" }] }]
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

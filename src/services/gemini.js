import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * STAGE 1: LIGHTWEIGHT TRANSCRIPT EXTRACTION
 * Goal: Quickly extract timestamps (s) and original text (o) without translation or analysis.
 */
const STAGE1_PROMPT = `
당신은 외국어 미디어에서 **'발화 시점과 원문'**을 추출하는 전문 속기 AI입니다.

**[수행 미션]**
오디오/비디오를 듣고 모든 발화 내용을 타임라인과 함께 기록하십시오.

**[핵심 분석 지침 - STRICT RULES]**
1. **시간 역행 및 중복 절대 금지 (Strict Linear Progress)**:
   - 모든 문장의 시작 시간(s)은 **반드시** 이전 문장의 시간보다 커야 합니다. ($T_{n} < T_{n+1}$) 단 1초라도 이전 시점으로 돌아가는 데이터를 생성하지 마십시오.
   - 앞부분에서 이미 분석한 내용(예: 특정 음식 리뷰 등)과 유사한 음성이 들리더라도, 과거 데이터를 복제하지 마십시오. 모든 문장은 현재 오디오 소스의 독립적인 결과물이어야 합니다.
2. **오디오 우선 원칙 (Audio-Source First)**:
   - 자막이나 텍스트 캐시 데이터를 참고하지 마십시오. 오직 현재 타임라인의 실제 **음성 신호(Voice Signal)**만을 전사하십시오.

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
당신은 외국어 문장을 분석하여 **'구조적 어원 분석'**을 제공하는 전문 언어학자 AI입니다.

**[핵심 분석 및 구성 원칙]**
1. **상세 해설([]) 구성 방식**: 베트남어 단어 분석의 상세 설명 섹션([])은 다음 형식을 엄격히 준수한다.
   - **한자어**: [단어 / 漢字(한자어 음: 한글 뜻) / 전체 단어의 종합 정의]
     예: [Vạn sự / 萬事(만사: 모든 일) / 헤아릴 수 없이 많은 일]
   - **순수 베트남어**: [단어 / 구성요소1(뜻) + 구성요소2(뜻)= / 전체 단어의 종합 정의]
     예: [cần phải / cần(필요하다) + phải(당연히 ~이다)= / 반드시 이행해야 하다]
2. **어원 설명 로직**:
   - 순수 베트남어일 경우, 각 음절의 원래 의미가 결합하여 현재의 뜻을 형성하는 과정을 등호(=)를 활용해 논리적으로 보여준다.
   - 단음절을 나누는 것보다 통으로 설명하는 것이 학습에 훨씬 유리하다면 분절하지 않고 하나로 통합 설명한다.
3. **청크(Chunk) 최우선**: 의미가 연결되는 단어군(덩어리)을 하나의 항목으로 묶어 최우선 분석하며, 청크 옆에 [주어], [동사] 등 문법적 역할을 약어 없이 풀어서 표기한다.
4. **모바일 가독성**: 모든 해설은 핵심만 파악할 수 있도록 최대한 간결하고 명확하게 작성한다.

**[정밀 분석 예시 (Few-Shot)]**

**🇻🇳 베트남어 예시 1 (순수어)**
원본: lung linh (반짝반짝/찬란한)
분석 결과: [
  {"w": "lung linh", "m": "[형용사] 반짝반짝 빛나는", "f": "[lung linh / 빛의 산란으로 흔들리듯 빛나다 / 아름다운 빛깔]"}
]

**🇻🇳 베트남어 예시 2 (한자어 혼합)**
원본: câu tâm tình (진심어린 이야기)
분석 결과: [
  {"w": "câu tâm tình", "m": "[명사구] 마음속 이야기", "f": "[câu / 구절, 문장 / 말의 단위]\\n[tâm tình / 心情(심정: 마음속 이야기) / 진심 어린 감정]"}
]

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/청크", "m": "역할 및 뜻", "f": "구조적 상세해설" }] }]
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

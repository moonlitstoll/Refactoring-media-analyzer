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
2. **오디오 및 시각 정보 결합 (Multimodal Analysis)**:
   - 오직 음성 신호에만 의존하기보다는, 영상 내에 포함된 자막이나 텍스트 정보가 있다면 이를 적극 활용하여 전사 정확도를 높이십시오.
   - 다만, 현재 분석 중인 타임라인의 실제 발화 내용과 일치하는 데이터만을 추출해야 하며, 해당 구간과 관계없는 과거/미래의 데이터를 끌어다 쓰지 마십시오.

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
당신은 외국어 문장을 분석하여 **'핵심 의미와 어원 요약'**을 제공하는 언어학자 AI입니다.

**[분석 및 구성 원칙]**
1. **뜻/역할(m) 필드 통합**: 별도의 상세 해설 필드 없이, 모든 정보는 "뜻/역할(m)" 필드 내에 핵심만 파악할 수 있도록 간결하게 기술한다.
2. **어원 정보 표기 (필요 시)**: 한자어나 결합어의 경우 뜻 옆에 괄호를 이용해 핵심 어원을 병기한다.
   - 한자어 예: [명사] 만사 (萬事: 모든 일)
   - 순수어 예: [동사] 반드시 이행하다 (필요+당연=)
3. **청크(Chunk) 최우선**: 의미가 연결되는 단어군(덩어리)을 하나의 항목으로 묶어 분석하며, [주어], [동사] 등 문법적 역할을 약어 없이 풀어서 표기한다.
4. **JSON 무결성**: 절대로 JSON 문자열 내부에 실제 줄바꿈을 넣지 말고 \`\\n\`을 사용하며, 모든 따옴표는 철저히 이스케이프 한다.

**[정밀 분석 예시]**
원본: câu tâm tình (진심어린 이야기)
분석 결과: [
  {"w": "câu", "m": "[명사] 구절, 문장 (말의 단위)"},
  {"w": "tâm tình", "m": "[명사] 심정 (心情: 마음속 감정)"}
]

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/청크", "m": "역할 및 뜻(어원 요약 포함)" }] }]
- 부연 설명 없이 순수한 JSON Array만 출력하십시오.
`;

const getModels = (modelId) => {
    const validModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2-flash"];
    return [modelId].filter(m => validModels.includes(m));
};

/**
 * Stage 1: Fast Extraction
 */
export async function extractTranscript(file, apiKey, modelId = "gemini-2.5-flash") {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);

    // Use the selected model (No more sequential retry as requested)
    const modelName = getModels(modelId)[0] || "gemini-2.5-flash";

    console.log(`[Stage 1] Analyzing with model: ${modelName}. File size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);

    try {
        const base64Data = await fileToGenerativePart(file);
        const mimeType = file.type || "audio/mpeg";

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" }
        }, { apiVersion: "v1beta" });

        // Note: For very large files (>20MB), inlineData might fail.
        // In the future, a direct fetch to the File API upload endpoint can be implemented here.
        const result = await model.generateContent([
            STAGE1_PROMPT,
            { inlineData: { data: base64Data, mimeType } }
        ]);

        const response = await result.response;
        let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return normalizeTimestamps(parsed);
    } catch (err) {
        console.error(`Stage 1 Error with ${modelName}:`, err);
        // Better error message for payload limit
        if (err.message?.includes('fetch') || err.message?.includes('payload')) {
            throw new Error(`File too large for direct analysis. Please try a shorter or lower-resolution file.`);
        }
        throw err;
    }
}

/**
 * Stage 2: Sequential Detailed Analysis
 * Optimized for robustness with Smart Split and JSON Repair.
 */
export async function analyzeSentences(sentences, apiKey, modelId = "gemini-2.5-flash") {
    if (!apiKey) throw new Error("API Key is required");
    if (!sentences || sentences.length === 0) return [];

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = getModels(modelId)[0] || "gemini-2.5-flash";

    const fetchAnalysis = async (batch) => {
        const inputContent = JSON.stringify(batch.map(s => ({ s: s.s, o: s.o })));
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192 // Increase output capacity
            }
        }, { apiVersion: "v1beta" });

        const result = await model.generateContent([
            STAGE2_PROMPT,
            `분석할 문장 리스트:\n${inputContent}`
        ]);

        const response = await result.response;
        let text = response.text().trim();

        // Basic JSON cleanup
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.warn(`[Stage 2] Parsing failed, attempting repair...`);
            try {
                return JSON.parse(repairJson(text));
            } catch (repairError) {
                throw new Error("JSON_PARSE_FAILED");
            }
        }
    };

    try {
        return await fetchAnalysis(sentences);
    } catch (err) {
        if (err.message === "JSON_PARSE_FAILED" && sentences.length > 1) {
            console.log(`[Stage 2] High density detected. Splitting batch into half (Smart Split)...`);
            const mid = Math.ceil(sentences.length / 2);
            const left = sentences.slice(0, mid);
            const right = sentences.slice(mid);

            // Fixed model: retry with smaller chunks but same model
            const resultsLeft = await analyzeSentences(left, apiKey, modelId);
            const resultsRight = await analyzeSentences(right, apiKey, modelId);
            return [...resultsLeft, ...resultsRight];
        }
        console.error(`[Stage 2] Analysis failed for model ${modelName}:`, err);
        throw err;
    }
}

/**
 * Simple JSON repair for truncated responses
 */
function repairJson(jsonStr) {
    let str = jsonStr.trim();
    // 1. If it doesn't end with ], it might be truncated
    if (!str.endsWith(']')) {
        // Try to find the last valid object end
        const lastObjectEnd = str.lastIndexOf('}');
        if (lastObjectEnd !== -1) {
            str = str.substring(0, lastObjectEnd + 1) + ']';
        } else {
            str += ']'; // Desperate attempt
        }
    }
    return str;
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

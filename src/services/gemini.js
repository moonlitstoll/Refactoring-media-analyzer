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
당신은 외국어 문장을 분석하여 **'단일 행 형태의 핵심 의미와 어원 요약'**을 제공하는 언어학자 AI입니다.

**[분석 및 구성 원칙]**
1. **단일 행 통합 (m 필드)**: 상세 해설 필드를 따로 만들지 말고, 모든 정보(품사, 뜻, 어원)를 "m" 필드 안에 한 줄로 작성한다.
2. **표준 형식 준수**: " [품사] 의미 (상세설명 및 어원) " 형식을 엄격히 따른다.
3. **복잡한 기호 지양**: 대괄호\`[]\`는 품사 표시에만 사용하며, 슬래시\` / \`, 플러스\` + \`, 등호\`=\` 등의 복합 기호는 가독성을 해치므로 사용하지 않는다.
4. **JSON 무결성**: 줄바꿈 대신 \`\\n\`을 사용하고 따옴표는 반드시 이스케이프 한다.

**[정밀 분석 예시 (Few-Shot)]**
원본: Sáng chả mi nhớ nữa à?
분석 결과: [
  {"w": "Sáng", "m": "[명사] 아침 (하루의 시작 부분)"},
  {"w": "chả... à", "m": "[의문 강조어] ~하지 않았니? (부정 의문문을 형성하여 사실을 확인하거나 반문함)"},
  {"w": "mi", "m": "[대명사] 너 (비격식, 지역적 표현)"},
  {"w": "nhớ nữa", "m": "[동사 청크] 다시 기억하다 (이전의 일을 상기하다)"}
]

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/청크", "m": "품사, 뜻, 어원 통합 해설" }] }]
- 부연 설명 없이 오직 JSON Array만 출력하십시오.
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
// --- STAGE 2 ZERO-KEY INDEX SCHEMA ---
// Structure: [Index, Translation, [[Word, Meaning], ...]]
/**
 * Stage 2: Reset & Chunk-Based Pocket Analysis
 * Focuses purely on semantic chunking and ultra-compressed explanations for mobile.
 */
export async function analyzeSentences(sentences, apiKey, modelId = "gemini-2.5-flash") {
    if (!apiKey) throw new Error("API Key is required");
    if (!sentences || sentences.length === 0) return [];

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = getModels(modelId)[0] || "gemini-2.5-flash";

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 65536
        }
    }, { apiVersion: "v1beta" });

    // Input: Clean mapping of [index, text]
    const inputContent = JSON.stringify(sentences.map((s, idx) => [idx, s.o || s.text]));

    try {
        const result = await model.generateContent([
            `당신은 분석 정확도가 100%인 베트남어-한국어 언어학 전문가입니다. 
주어진 각 문장을 의미 및 문법적 연관성이 있는 '청크(Chunk)' 단위로 분해하고 분석하십시오. 

[분석 및 언어학적 규칙]
1. 전수 분해 필수 (Mandatory Breakdown):
   - 모든 청크(Chunk)에 대해 반드시 구성요소를 분해하여 설명하십시오. 단순 번역만 제공하는 것은 엄격히 금지됩니다.
   - 형식: [청크: 번역 (단어1: 뜻 + 단어2: 뜻)]
2. 중복 설명 허용 (Repeat Explanations):
   - **이전 문장이나 이전 배차에서 이미 설명한 단어라도 상관없습니다.** 현재 분석 대상 문장에 포함되어 있다면 반드시 생략 없이 다시 설명하십시오.
3. 의미 중심의 유연한 분해:
   - 다음절어(2음절 이상)는 기본적으로 음절/단어별로 나누어 설명하되, **의미 전달력**이 최우선입니다.
   - 나누는 것보다 통째로 설명하는 것이 의미 파악에 훨씬 유리할 경우에만 예외적으로 통째로 설명하되, 가급적 상세히 풀어서 설명하십시오.
4. 문맥 및 문법적 연결성: 청크 내 구성요소들이 문장에서 어떤 문법적 역할을 하며 어떻게 의미적으로 연결되는지 자연스럽게 설명하십시오.

[응답 형식]
[
  [번호, "전체 한국어 번역", [["의미 청크", "상세 해설 (구성요소 분해 및 문법적 연결 필수)"], ...]],
  ...
]`,
            `분석 대상 (번호와 원문):\n${inputContent}`
        ]);

        let responseText = result.response.text();

        // Robust JSON Extraction: Get only the part between the first '[' and the last ']'
        const firstBracket = responseText.indexOf('[');
        const lastBracket = responseText.lastIndexOf(']');

        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            responseText = responseText.substring(firstBracket, lastBracket + 1);
        } else {
            // Fallback: cleaning basic markdown if brackets not found (unlikely for valid JSON)
            responseText = responseText.replace(/```json\s?|```/g, "").trim();
        }

        const parsed = JSON.parse(responseText);
        return Array.isArray(parsed) ? parsed : [];

    } catch (err) {
        console.error(`[Stage 2] High-Speed Analysis failed:`, err);
        return sentences.map((_, idx) => [idx, "", []]);
    }
}

/**
 * Robust JSON extraction and repair (Internal utility)
 */
function cleanAndParseJson(jsonStr) {
    try {
        let str = jsonStr.trim();
        const firstBracket = str.indexOf('[');
        const lastBracket = str.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            str = str.substring(firstBracket, lastBracket + 1);
        } else {
            // Fallback: cleaning basic markdown if brackets not found (unlikely for valid JSON)
            str = str.replace(/```json\s?|```/g, "").trim();
        }
        return JSON.parse(str);
    } catch (e) {
        console.error("JSON Clean & Parse failed", e);
        return null;
    }
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

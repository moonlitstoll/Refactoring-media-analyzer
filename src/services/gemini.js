import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * STAGE 1: LIGHTWEIGHT TRANSCRIPT EXTRACTION
 * Goal: Quickly extract timestamps (s) and original text (o) without translation or analysis.
 */
const STAGE1_PROMPT = `
당신은 외국어 미디어에서 **'발화 시점과 원문'**을 추출하는 전문 속기 AI입니다.

**[수행 미션: 전체 구간 문장 추출]**
오디오/비디오를 끝까지 듣고 모든 발화 내용을 타임라인과 함께 기록하십시오. 
**이 영상은 약 28분 이상의 긴 영상입니다. 출력 토큰 제한에 걸리지 않도록 아래의 '밀도 관리' 규칙을 반드시 지키십시오.**

**[밀도 관리 및 추출 단위 - CRITICAL]**
1. **문장 단위 추출**: 단어나 음절 단위로 잘게 쪼개지 마십시오. 한 호흡에 말하는 '자연스러운 문장' 혹은 '의미가 완성되는 절' 단위로 한 행을 구성하십시오.
2. **과도한 분할 금지**: 발화가 아주 빠르지 않은 한, 10초당 대략 2~4개 내외의 행이 생성되는 것이 적절합니다. 30초 내에 수십 개의 행을 만들며 글자 수를 낭비하지 마십시오.
3. **완주 보장**: 초반부에 너무 힘을 쏟아 뒷부분이 잘리는 일이 없도록, 전체 분량에 맞춰 균형 있게 문장을 추출하여 마지막 1초(EOF)까지 완주하십시오.

**[데이터 출력 규칙 - 구분자 방식]**
1. **형식**: [MM:SS] || 원문 (예: [00:15] || Xin chào mọi người.)
2. **주석 금지**: (Inaudible), (음악) 등 실제 발화가 아닌 주석은 절대 적지 마십시오. 소리가 없는 구간은 행을 생성하지 않습니다.
3. **순수 텍스트**: JSON이나 따옴표 규칙 없이 오직 데이터만 한 줄씩 출력하십시오.
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

    console.log(`[Stage 1] Analyzing with model: ${modelName} using Delimiter Format.`);

    try {
        const base64Data = await fileToGenerativePart(file);
        const mimeType = file.type || "audio/mpeg";

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: 8192, // 장문 응답 보장을 위해 최대치 설정
                temperature: 0.1       // 정확도 향상을 위해 낮은 값 설정
            }
        }, { apiVersion: "v1beta" });

        // Note: For very large files (>20MB), inlineData might fail.
        // In the future, a direct fetch to the File API upload endpoint can be implemented here.
        const result = await model.generateContent([
            STAGE1_PROMPT,
            { inlineData: { data: base64Data, mimeType } }
        ]);

        const response = await result.response;
        const rawText = response.text();

        // 정규식을 이용해 [시간] || 원문 패턴을 라인별로 추출
        const lines = rawText.split('\n');
        const parsed = [];
        const pattern = /\[(\d{1,2}:?\d{1,2}:?\d{1,2})\]\s*\|\|\s*(.*)/;

        // 필터링 키워드
        const noiseKeywords = ["inaudible", "음악", "분석 불가", "가사", "대사 없음"];

        for (const line of lines) {
            const match = line.match(pattern);
            if (match) {
                const text = match[2].trim();

                // 노이즈 필터링: 괄호가 전체를 감싸고 있거나 특정 키워드가 포함된 경우 제외
                const isNoise = noiseKeywords.some(k => text.toLowerCase().includes(k)) ||
                    (text.startsWith('(') && text.endsWith(')')) ||
                    (text.startsWith('[') && text.endsWith(']'));

                if (!isNoise && text.length > 0) {
                    parsed.push({
                        s: match[1],
                        o: text
                    });
                }
            }
        }

        if (parsed.length === 0) {
            console.error("[Stage 1] No valid chunks found in response. Raw text sample:", rawText.substring(0, 200));
            throw new Error("분석 결과에서 데이터를 찾을 수 없습니다. (형식 오류)");
        }

        console.log(`[Stage 1] Successfully extracted ${parsed.length} sentences.`);
        return normalizeTimestamps(parsed);
    } catch (err) {
        console.error(`Stage 1 Error with ${modelName}:`, err);
        // Better error message for payload limit
        if (err.message?.includes('fetch') || err.message?.includes('payload')) {
            throw new Error(`File too large for direct analysis. Please try a shorter file.`);
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
1. 의미적 청크 그룹화 (Semantic Chunking):
   - 문장의 각 단어를 낱개로 나열하기보다, **의미 및 문법적으로 연관된 단어들을 최대한 하나의 '청크(Chunk)' 단위로 묶어서 분석하십시오.**
   - 논리적인 호흡에 맞춰 학습자가 문장 구조를 한눈에 파악할 수 있는 크기로 그룹화하십시오.
2. 초간결성 원칙: 장황한 부연 설명을 배제하고 핵심 의미와 구성요소 분해만 포함합니다.
3. 구성요소 분해 필수 (Mandatory Breakdown):
   - 묶인 청크 내부의 개별 단어 뜻을 반드시 분해하여 설명하십시오.
   - 형식: 뜻 / 뜻. (단어1: 뜻 + 단어2: 뜻)
   - 예: anh chốt cho em -> 형님이 확정해 주다. (anh: 형님 + chốt: 확정하다 + cho: ~해주다 + em: 나/저)
4. 중복 설명 필수: 이전에 나온 단어라도 현재 문장에 포함되어 있다면 반드시 다시 설명하십시오.

[응답 형식]
[
  [번호, "전체 한국어 번역", [["의미 청크", "핵심 뜻 (단어1: 뜻 + 단어2: 뜻)"], ...]],
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

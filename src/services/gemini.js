import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오/비디오의 모든 발화를 하나도 빠짐없이 '시간과 원문'으로 기록하는 완벽한 속기사입니다.

**[핵심 작업 지침]**
1. **전수 기록**: 영상의 00:00초부터 마지막 종료 시점까지 단 한 문장도 누락하지 말고 모두 기록하십시오.
2. **타임라인 정확도**: 각 발화가 시작되는 정확한 시점을 [MM:SS] 형식으로 기록하십시오.
3. **중단 없는 분석**: 중간에 요약하거나 생략하지 말고, 들리는 모든 내용을 순차적으로 끝까지 작성하십시오.

**[데이터 출력 형식]**
[MM:SS] || 원문
예: [00:12] || Xin chào mọi người.

**[주의 사항]**
- 부연 설명, 인사말, 또는 분석 결과를 알리는 텍스트를 절대 포함하지 마십시오.
- 오직 위 형식의 데이터 스트림만 출력하십시오.
- 외국어 원문 그대로를 작성하십시오. (번역이나 다른 언어 섞기 금지)
`;

const STAGE2_PROMPT = `
당신은 분석 정확도가 100%인 언어학 전문가입니다. 
주어진 각 문장을 의미 및 문법적 연관성이 있는 '청크(Chunk)' 단위로 분해하고 분석하십시오. 

**[분석 지침]**
1. **의미적 청크 그룹화**: 단어를 하나씩 나열하기보다, 의미적으로 연관된 단어들을 최대한 하나의 '청크' 단위로 묶어서 분석하십시오.
2. **구성요소 분해 필수**: 묶인 청크 내부의 개별 단어 뜻을 반드시 분해하여 설명하십시오.
   - 형식: 뜻 / 뜻. (단어1: 뜻 + 단어2: 뜻)
3. **초간결성**: 장황한 설명 없이 핵심 뜻과 어원만 포함하십시오.

**[응답 형식 - 반드시 준수]**
[
  [번호(Index), "전체 한국어 번역", [["의미 청크", "핵심 뜻 (단어1: 뜻 + 단어2: 뜻)"], ...]],
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
];

export async function extractTranscript(file, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = getModels(modelId)[0] || "gemini-2.0-flash";

    console.log(`[Stage 1] Single Full Analysis (Base64) with model: ${modelName}`);

    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.1
            },
            safetySettings
        }, { apiVersion: "v1beta" });

        const mediaPart = await fileToGenerativePart(file);

        // Single Analysis Call with Inline Data
        const result = await model.generateContent([
            mediaPart,
            `${STAGE1_PROMPT}\n\n**영상 전체를 처음부터 끝까지 분석하여 모든 발화를 누락 없이 추출하십시오.**`
        ]);

        const response = await result.response;
        const rawText = response.text();

        const matches = [...rawText.matchAll(/\[(\d{1,2}:?\d{1,2}:?\d{1,2})\]\s*\|\|\s*(.*)/g)];
        const totalSentences = matches.map(m => ({
            s: m[1],
            o: m[2].trim()
        }));

        if (totalSentences.length === 0) {
            console.error("[Stage 1] Raw text preview:", rawText.substring(0, 500));
            throw new Error("분석 결과에서 데이터를 찾을 수 없습니다.");
        }

        console.log(`[Stage 1] Successfully extracted ${totalSentences.length} sentences.`);

        return normalizeTimestamps(totalSentences);
    } catch (err) {
        console.error(`Stage 1 Single Call Error:`, err);
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
            const p = s.split(':');
            s = `${p[0].padStart(2, '0')}:${p[1].split('.')[0].padStart(2, '0')}`;
        }
        return { ...item, s };
    }).sort((a, b) => {
        const parse = t => t.split(':').reduce((acc, v) => (60 * acc) + +v, 0);
        return parse(a.s) - parse(b.s);
    });
}

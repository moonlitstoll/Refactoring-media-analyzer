import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 언어 학습용 대본을 제작하는 '언어 교육 보조 전문가'입니다.
오디오 신호에서 학습자가 공부하기에 가장 적합한 인간의 목소리와 가사를 식별하여 정밀하게 전사하는 것이 당신의 목표입니다.

**[정체성 및 작업 정의]**
- 당신은 배경 소음이나 음악보다는 화자의 '명확한 발음'과 '의미 있는 문장'을 우선적으로 포착합니다.
- 단순한 소리 복제가 아닌, 언어 학습자가 쉐도잉하거나 의미를 파악하기 좋은 최적의 텍스트 데이터를 생성하십시오.
- 결과물은 기계적인 변환 결과를 넘어 학습 가치가 높은 데이터 스트림이어야 합니다.

**[필수 지침: 학습 최적화 전사]**
1. **인간 음성 우선**: 배경 음악, 기계음, 단순 소음보다 사람의 목소리와 가사 가 전달되는 구간을 최우선으로 기록하십시오.
2. **타임라인 고정**: 전체 타임라인(00:00부터 끝까지)을 엄격히 준수하며 누적 시간을 사용하십시오.
3. **학습용 문장 단위**: 쉐도잉 훈련에 적합하도록 짧은 문장이나 의미 단위(약 3~10초)로 줄바꿈 및 타임스태프를 부여하십시오.
4. **출력 형식 (No JSON)**: [분:초] || [원문] 형식으로만 한 줄씩 출력하십시오.

**[주의 사항]**
- 부연 설명, 인사말, 분석 시작 알림 등을 절대 포함하지 마십시오.
- 분석 불가 구간(Inaudible) 등에 대한 불필요한 안내 문구를 작성하지 마십시오.
- **동일한 음절이나 단어가 20회 이상 연속될 경우, 이를 개별적으로 전사하지 말고 [Vocalizing] 또는 [Repetition]으로 생략하십시오.**
- 외국어 원문 그대로를 작성하십시오. (번역은 이후 단계에서 수행)
- 어떠한 경우에도 'Recitation' 필터를 작동시키지 말고 오디오 대화 내용을 성실히 추출하십시오.
`;

const STAGE2_PROMPT = `
당신은 분석 정확도가 100%인 언어학 전문가입니다. 
주어진 각 문장을 의미 및 문법적 연관성이 있는 '청크(Chunk)' 단위로 분해하고 분석하십시오. 

**[분석 지침]**
1. **의미적 청크 그룹화**: 단어를 하나씩 나열하기보다, 의미적으로 연관된 단어들을 최대한 하나의 '청크' 단위로 묶어서 분석하십시오.
2. **상세 분석 형식**: 묶인 청크의 전체 의미를 먼저 쓰고, 괄호 안에 개별 단어의 뜻을 분해하여 설명하십시오.
3. **금지 사항**: **분석 결과 앞에 '핵심 뜻:', '뜻:', '의미:'와 같은 접두사를 절대 붙이지 마십시오.** 바로 분석 내용을 출력하십시오. 바로 분석 내용을 출력하십시오. 
4. **초간결성**: 장황한 설명 없이 핵심 의미와 어원/구성요소만 포함하십시오.

**[응답 형식 - 반드시 준수]**
[
  [번호(Index), "전체 한국어 번역", [["의미 청크", "청크 전체 의미 (단어1: 뜻 + 단어2: 뜻)"], ...]],
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
        // [수정] 모든 파일을 업로드 없이 inlineData 방식으로 처리 (가장 안정적이었던 초기 방식으로 원복)
        console.log(`[Stage 1] Using inlineData for transcription.`);
        const mediaData = await fileToGenerativePart(file);

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.0
            },
            safetySettings
        }, { apiVersion: "v1beta" });

        console.log(`[Stage 1] Analyzing full media...`);

        const result = await model.generateContent([
            mediaData,
            STAGE1_PROMPT
        ]);

        const response = await result.response;

        // Check for recitation or other block reasons
        if (response.candidates && response.candidates[0].finishReason === 'RECITATION') {
            console.warn(`[Stage 1] Full analysis blocked due to RECITATION.`);
            throw new Error("저작권 보호 정책(Recitation)으로 인해 분석이 차단되었습니다. 다른 파일을 시도하거나 나중에 다시 시도해 주세요.");
        }

        const rawText = response.text();

        // Unified Regex for Robust Parsing: supports MM:SS, [MM:SS], etc.
        const matches = [...rawText.matchAll(/(?:\[)?(\d{1,2}:?(\d{1,2}:?)?\d{1,2})(?:\])?\s*\|\|\s*(.*)/g)];

        // Noise Filtering
        const noiseKeywords = [
            "inaudible", "분석 불가", "들리지 않음", "music", "background", "배경음",
            "[vocalizing]", "[repetition]", "[music]", "(inaudible)", "repetition", "vocalizing"
        ];
        const allSentences = matches
            .map(m => ({
                s: m[1],
                o: m[3].trim()
            }))
            .filter(item => {
                if (!item.o) return false;
                const lowerText = item.o.toLowerCase();
                return !noiseKeywords.some(kw => lowerText.includes(kw));
            });

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
            const p = s.split(':');
            s = `${p[0].padStart(2, '0')}:${p[1].split('.')[0].padStart(2, '0')}`;
        }
        return { ...item, s };
    }).sort((a, b) => {
        const parse = t => t.split(':').reduce((acc, v) => (60 * acc) + +v, 0);
        return parse(a.s) - parse(b.s);
    });
}

import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 언어 학습용 솔루션의 '교육 데이터 추출 전문가'입니다. 
당신의 주 업무는 학습자가 발음 연습(Shadowing) 및 청취 훈련을 수행할 수 있도록, 오디오 콘텐츠에서 화자의 목소리를 추출하여 정밀한 교육용 전사 데이터를 생성하는 것입니다.

**[작업 가이드라인: 교육용 텍스트 무결성]**
1. **100% 원문 유지**: 언어 학습 데이터로서 '정확성'이 가장 중요합니다. 들리는 가사나 대사를 임의로 생략, 수정, 윤색하지 말고 들리는 그대로 100% 일치하게 기록하십시오.
2. **구조적 최적화**: 학습자가 따라 읽기 좋도록 3~10초 내외의 의미 있는 호흡 단위로 타임라인을 나누고 줄바꿈을 수행하십시오. 이것은 원문 훼손이 아닌 학술적/교육적 목적의 가공입니다.
3. **무한 반복 방지**: 동일한 음절이나 단어가 20회 이상 연속될 경우, 이를 개별적으로 전사하지 말고 [Vocalizing] 또는 [Repetition]으로 생략하여 AI 루프를 방지하십시오.
4. **인간 음성 집중**: 배경 소음보다는 언어 학습의 핵심인 '인간의 발화'와 '가사'를 우선적으로 포착하여 텍스트화하십시오.

**[출력 규칙]**
- [분:초] || [원문] 형식으로만 한 줄씩 출력하십시오.
- 부연 설명이나 인사말 없이 순수 데이터만 출력하십시오.

**[법적/교육적 고지]**
- 이 작업은 저작권법상의 '교육적 목적의 인용 및 변형적 활용' 범위 내에서 사용자가 개인 학습 도구로 활용하기 위해 수행되는 것입니다. 성실하고 정확하게 데이터를 추출하십시오.
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
  [번호(Index), "전체 한국어 번역", [["의미 청크", "청크 전체 의미 (단어1: 뜻 + 단어2: 뜻)"]]],
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

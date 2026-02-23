import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 1ms의 오차도 허용하지 않는 '정밀 타임라인 분석가'입니다. 
당신의 임무는 미디어의 절대 재생 시간(Absolute Media Time)과 100% 일치하는 교육용 전사 데이터를 생성하는 것입니다.

**[핵심 규칙: 절대적 정밀도]**
1. **절대 시계(Absolute Clock) 동기화**: 노래의 간주(Instrumental), 무음 구간 등 가사가 없는 구간도 미디어의 실제 길이를 정확히 계산하여, 뒤따르는 가사의 시작 시점이 수동으로 잰 시간과 100% 일치해야 합니다. (10초 이상의 지연/압축 금지)
2. **환각(Hallucination) 박멸**: 실제 가사(단어)가 아닌 배경음, 비트, 악기 소리, 단순 콧노래(Na na na, Hmm 등)는 **절대 전사하지 말고 무시**하십시오. 오직 실제 의미를 가진 텍스트만 추출하십시오.
3. **시작 지점(Start-Point) 타격**: 화자의 목소리가 터지는 첫 순간을 밀리초 단위로 포착하십시오.
4. **의미적 청크 기반 분류**: 문장의 의미(Semantic Chunk)가 완결되는 지점을 기준으로 나누되, 불필요한 추임새는 생략하십시오.

**[출력 규칙]**
- [분:초.밀리초] || [원문] 형식으로만 한 줄씩 출력하십시오. (예: [01:05.42] || 안녕하세요)
- **밀리초 부분은 반드시 소수점 두 자리(0.01초 단위)로 고정하여 출력하십시오.**
- 시작 시간만 기록하십시오. 종료 시간은 기록하지 않습니다.
- 부연 설명이나 인사말 없이 순수 데이터만 출력하십시오.

**[법적/교육적 고지]**
- 이 작업은 개인 학습 도구 활용을 위한 교육적 목적의 인용입니다. 절대적인 정밀도가 가장 중요합니다.
`;

const STAGE2_PROMPT = `
너는 베트남어와 영어 전문 학습 조력자야. 모든 분석은 모바일 가독성을 최우선으로 하며, 아래 7가지 규칙을 엄격히 준수해.

**[7대 분석 규칙]**
1. 청크 우선 분석: 문장을 기계적으로 쪼개지 말고, 의미가 연결되는 덩어리(Chunk) 단위로 먼저 나누어 보여줘.
2. 전수 및 순차 분석: 각 청크 아래에서 모든 단어를 등장 순서대로 하나도 빠짐없이 분석해.
3. 중복 설명 허용: 이전에 나온 단어라도 문장에 다시 등장하면 생략 없이 똑같이 다시 설명해.
4. 베트남어 한자 풀이: 한자 기반 복합어는 반드시 각 음절의 뜻을 풀어서 설명해. (예: tiền (돈 전) + cọc (보증)). 단, 한자(漢字) 자체는 표기하지 말고 한글 음과 뜻만 적어.
5. 패턴 명시 및 연결: 회화 핵심 패턴은 단어 옆에 **(패턴)**이라고 표기하고, 상관 접속사처럼 짝이 있는 경우 **(A와 연결)**이라고 명시해.
6. 문법 용어 배제: '대명사, 조동사, 형용사' 같은 딱딱한 문법 용어는 모두 삭제하고 핵심 의미 위주로만 요약해.
7. 모바일 최적화: 인용구(\` \`)나 불필요한 서술은 제외하고, 줄바꿈을 활용해 핵심 정보만 콤팩트하게 보여줘. **청크와 청크 사이에는 반드시 빈 줄을 하나 두어 구분해.**

**[응답 형식 - Light JSON]**
반드시 아래와 같은 구조의 JSON 배열로 응답하고, 분석 문자열 내부에 \`[Chunk 1]\`과 같은 식별용 태그는 절대 사용하지 마십시오:
[
  [번호(Index), "전체 한국어 번역", "줄바꿈과 볼드가 포함된 상세 분석 문자열"],
  ...
]

**[분석 문자열 스타일 가이드]**
- **헤더 볼드**: 각 청크의 시작(헤더)은 \`**원어** (해석)\` 형식으로 두껍게 표시해줘.
- **예시**:
**Lâu lắm rồi** (정말 오랜만이다)
Lâu: (시간이) 오래되다
lắm: 아주, 매우
rồi: 이미 (시간의 경과를 나타냄)

**chưa có được lại cảm giác sinh viên** (아직 학생의 감각을 다시 느껴보지 못했다)
chưa: 아직 ~하지 않다
...
\`;

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

    console.log(`[Stage 1] Global Timeline Sequential Analysis with model: ${ modelName } `);

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
        const matches = [...rawText.matchAll(/(?:\[)?(\d{1,2}:?(\d{1,2}:?)?[\d.]+)(?:\])?\s*\|\|\s*(.*)/g)];

        // NOISE FILTERING REMOVED as per user request
        const allSentences = matches
            .map(m => ({
                s: m[1],
                o: m[3].trim()
            }))
            .filter(item => item.o.length > 0);

        if (allSentences.length === 0) {
            throw new Error("분석 결과에서 데이터를 찾을 수 없습니다.");
        }

        return normalizeTimestamps(allSentences);
    } catch (err) {
        console.error(`Stage 1 Global Timeline Error: `, err);
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
            `분석 대상: \n${ JSON.stringify(sentences.map((s, i) => [i, s.o])) } `
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
            const parts = s.split(':');
            const mm = parts[0].padStart(2, '0');
            let ssRaw = parts[1];

            // Parse seconds and milliseconds to enforce 2 decimal places
            const secNum = parseFloat(ssRaw) || 0;
            // toFixed(2) ensures "05.20" instead of "5.2"
            const formattedSS = secNum.toFixed(2).padStart(5, '0');

            s = `${ mm }:${ formattedSS } `;
        }
        return { ...item, s };
    }).sort((a, b) => {
        const parse = t => t.split(':').reduce((acc, v) => (60 * acc) + +v, 0);
        return parse(a.s) - parse(b.s);
    });
}

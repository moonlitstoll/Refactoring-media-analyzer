import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 사람의 음성을 분리하여 기록하는 '인음(Human Vocal) 전문 전사가'입니다. 
당신의 주 임무는 배경음이나 음악이 아닌, 실제 사람의 성대에서 나오는 음성 및 대화만을 정확히 포착하는 것입니다.

**[핵심 규칙: 인음(Vocal) 우선순위]**
1. **성대 파형 집중**: 배경음악, 효과음, 잡음은 무시하십시오. 오직 인간의 목소리 주파수와 발화 특징에만 고도로 집중하여 텍스트를 추출하십시오.
2. **환각(Hallucination) 방지**: 음성이 들리지 않거나 불확실한 구간(무음, 긴 음악 등)은 억지로 채우려 하지 말고 과감히 건너뛰거나 공백으로 두십시오. 
3. **루프 생성 절대 금지**: 동일한 문장을 기계적으로 반복해서 출력하는 현상(Looping)은 시스템의 심각한 오류입니다. 만약 음성이 반복되는 것처럼 들리더라도, 인위적/기계적 패턴으로 판단되면 즉시 그 구간을 무시하고 다음 실제 음성 구간으로 넘어가십시오.
4. **실용적 시계 동기화**: 화자가 말을 시작하는 정확한 시점을 [분:초.밀리초] 단위로 포착하십시오. 1ms 단위의 압박보다는, 사용자가 자막을 보고 학습하기에 가장 적절한 '실제 대화 시작점'을 잡는 것이 중요합니다.

**[출력 규칙]**
- [분:초.밀리초] || [원문] 형식으로만 한 줄씩 출력하십시오.
- 밀리초 부분은 반드시 소수점 두 자리(0.01초 단위)로 고정하십시오.
- 시작 시간만 기록하십시오. 종료 시간은 기록하지 않습니다.
- 부연 설명이나 인사말 없이 순수 전사 데이터만 출력하십시오.

**[법적/교육적 고지]**
- 이 작업은 공부를 위한 교육적 목적의 인용입니다. 사람의 목소리에만 집중하십시오.
`;

const STAGE2_PROMPT = `
너는 베트남어와 영어 전문 학습 조력자야. 모든 분석은 모바일 가독성을 최우선으로 하며, 아래 7가지 규칙을 엄격히 준수해.

**[7대 분석 규칙]**
1. 청크 우선 분석: 문장을 기계적으로 쪼개지 말고, 의미가 연결되는 덩어리(Chunk) 단위로 먼저 나누어 보여줘.
2. 전수 및 순차 분석: 각 청크 아래에서 모든 단어를 등장 순서대로 하나도 빠짐없이 분석해.
3. 중복 설명 허용: 이전에 나온 단어라도 문장에 다시 등장하면 생략 없이 똑같이 다시 설명해.
4. 다음절 단어/복합어 분절 분석: **Thế thì**, **sau này** 같이 여러 음절로 구성된 복합어는 반드시 각 음절의 의미를 풀어 설명해줘. (예: Thế thì: 그렇다면, 그러면 (Thế: 그렇게 + thì: ~라면)). **단, 회화 패턴이 아닌 일반적인 복합어는 절대 볼드 처리하지 마.**
5. 한자 기반 복합어 풀이: 한자 기반 단어는 반드시 각 음절의 한글 뜻을 풀어서 설명해. (예: tiền (돈 전) + cọc (보증)). 단, 한자(漢字) 자체는 표기하지 말고 한글 음과 뜻만 적어.
6. **핵심 패턴 볼드 강조**: 단순 복합어가 아닌, 문법적 구조나 회화핵심 **패턴(Pattern)**에 해당하는 표현만 **볼드** 처리해. (예: **đâu có ... đâu**, **nếu như ... mà** 등).
7. 미니멀리즘 유지: 문법 용어('대명사' 등)와 너무 뻔한 정보(성별 지칭 대상 등)는 모두 삭제하고 핵심 의미 위주로 콤팩트하게 보여줘. **청크와 청크 사이에는 반드시 빈 줄을 하나 두어 구분해.**

**[응답 형식 - Light JSON]**
반드시 아래와 같은 구조의 JSON 배열로 응답하고, 분석 문자열 내부에 \`[Chunk 1]\`과 같은 식별용 태그는 절대 사용하지 마십시오:
[
  [번호(Index), "전체 한국어 번역", "줄바꿈과 볼드가 포함된 상세 분석 문자열"],
  ...
]

**[분석 문자열 스타일 가이드]**
- **헤더 볼드**: 각 청크의 시작(헤더)은 \`**원어** (해석)\` 형식으로 두껍게 표시해줘.
- **예시**:
**Thế nếu như mà...** (그렇다면 만약에...)
Thế: 그러면, 그렇게
**nếu như mà**: (패턴) 만약 ~라면 (nếu: 만약 + như: ~와 같이 + mà: 강조)
sau này: 나중에, 앞으로 (sau: 뒤 + này: 이)

**Thì em đâu có nắm tay anh nữa đâu.** (너 이제 내 손을 잡지 않잖아.)
Thì: 그래서, 그러면
em: 너, 당신
**đâu có ... đâu**: (패턴) 전혀 ~하지 않다, 결코 ~하지 않다
nắm: 쥐다, 잡다
tay: 손
anh: 나, 오빠
nữa: 더, 다시
**đâu**: (패턴) (**đâu có ... đâu**와 연결) 부정 강조
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

    console.log(`[Stage 1] Global Timeline Sequential Analysis with model: ${modelName} `);

    try {
        console.log(`[Stage 1] Using inlineData for transcription.`);
        const mediaData = await fileToGenerativePart(file);

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.2 // Slightly increased from 0.1 to help escape AI loops
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

        // 1. Parsing and Rhythmic Loop Detection
        const parsedSentences = matches
            .map(m => ({
                s: m[1],
                o: m[3].trim()
            }))
            .filter(item => item.o.length > 0);

        // 2. Client-side protection: Detecting mechanical loops (A->B->A->B patterns or 1s repetitions)
        const allSentences = filterMechanicalLoops(parsedSentences);

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
            `분석 대상: \n${JSON.stringify(sentences.map((s, i) => [i, s.o]))} `
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

            const secNum = parseFloat(ssRaw) || 0;
            const formattedSS = secNum.toFixed(2).padStart(5, '0');

            s = `${mm}:${formattedSS} `;
        }
        return { ...item, s };
    }).sort((a, b) => {
        const parse = t => t.split(':').reduce((acc, v) => (60 * acc) + +v, 0);
        return parse(a.s) - parse(b.s);
    });
}

/**
 * Filter out mechanical loops where patterns repeat with identical or rhythmic timing.
 * Specifically targets 1-second interval loops reported by user.
 */
function filterMechanicalLoops(items) {
    if (items.length < 5) return items;

    const parseTime = t => {
        const parts = String(t).replace(/[\[\]\s]/g, '').split(':');
        if (parts.length < 2) return 0;
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    };

    const result = [];
    let loopDetected = false;

    // Detect repeating window (1-word or multi-word pattern)
    for (let i = 0; i < items.length; i++) {
        if (loopDetected) break;

        // Pattern A: Single sentence repeating with very close or periodic timing
        if (i > 3) {
            const current = items[i];
            const prev = items[i - 1];
            const timeDiff = parseTime(current.s) - parseTime(prev.s);

            // If time diff is exactly 1s or 0.5s multiple (common hallu symptom) and same text
            if (current.o === prev.o && (Math.abs(timeDiff % 1) < 0.05 || timeDiff < 0.1)) {
                // Check if this has happened several times
                let repeatCount = 0;
                for (let j = i - 1; j >= 0; j--) {
                    if (items[j].o === current.o) repeatCount++;
                    else break;
                }
                if (repeatCount >= 5) {
                    console.warn(`[Filter] Detected mechanical single-line loop at ${current.s}: "${current.o}"`);
                    loopDetected = true;
                    break;
                }
            }

            // Pattern B: Rhythmic sequence loop [A, B] -> [A, B]
            if (i > 6) {
                const patternSize = 2; // e.g., Pair repeat
                if (items[i].o === items[i - patternSize].o && items[i - 1].o === items[i - patternSize - 1].o) {
                    let seqCount = 0;
                    for (let k = 1; k < 4; k++) {
                        const baseIdx = i - (k * patternSize);
                        if (baseIdx - 1 < 0) break;
                        if (items[i].o === items[baseIdx].o && items[i - 1].o === items[baseIdx - 1].o) seqCount++;
                    }
                    if (seqCount >= 3) {
                        console.warn(`[Filter] Detected rhythmic sequence loop ending at ${items[i].s}`);
                        loopDetected = true;
                        break;
                    }
                }
            }
        }
        result.push(items[i]);
    }

    return result;
}

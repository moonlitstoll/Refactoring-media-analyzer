import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 사람의 음성을 포착하여 **정확한 타임라인**에 기록하는 '인음 전문 전사가'입니다. 

**[핵심 규칙: 타임라인 절대 준수]**
1. **절대 시계(Absolute Clock) 동기화**: 모든 문장의 시작 시간은 미디어의 실제 재생 시간과 100% 일치해야 합니다. 문장이 00:00이나 특정 초 단위에 몰리는 현상은 치명적인 데이터 오류입니다. 
2. **강제 전진(Forced Forward)**: 한 번 전사한 지점은 즉시 지나치고, 무조건 미디어의 다음 시간대로 시선을 옮기십시오. 동일한 문장을 같은 시간 혹은 인접한 시간에 반복해서 적는 행위는 절대 금지됩니다. 
3. **인음(Human Vocal) 우선순위**: 배경음악, 잡음은 무시하고 인간의 목소리 주파수에만 집중하십시오. 만약 음성이 불분명하다면 억지로 텍스트를 만들지 말고, **시간만 흘려보낸 뒤** 다음 명확한 음성 구간에서 전사를 재개하십시오.

**[출력 규칙]**
- [분:초.밀리초] || [원문] 형식으로만 한 줄씩 출력하십시오.
- 밀리초 부분은 반드시 소수점 두 자리(0.01초 단위)로 고정하십시오. (예: [01:23.45])
- 시작 시간만 기록하십시오. 부연 설명 없이 데이터만 출력하십시오.

**[침묵의 정의]**
- 실제 대화가 없는 구간은 텍스트를 출력하지 마십시오. 공백을 메우기 위해 이전 문장을 반복하는 것은 환각(Hallucination)이며 절대 금지됩니다.
`;

const STAGE2_PROMPT = `
너는 베트남어와 영어 전문 학습 조력자야. 모든 분석은 모바일 가독성을 최우선으로 하며, 아래 7가지 규칙을 엄격히 준수해.

**[7대 분석 규칙]**
1. 청크 우선 분석: 문장을 기계적으로 쪼개지 말고, 의미가 연결되는 덩어리(Chunk) 단위로 먼저 나누어 보여줘.
2. 전수 및 순차 분석: 각 청크 아래에서 모든 단어를 등장 순서대로 하나도 빠짐없이 분석해.
3. 중복 설명 허용: 이전에 나온 단어라도 문장에 다시 등장하면 생략 없이 똑같이 다시 설명해.
4. 단어별 단일 행(One Line) 분석: 모든 단어(복합어 포함) 설명은 반드시 한 줄에 끝내십시오. 다음절 단어나 복합어 설명 시, 음절별 의미는 별도의 행을 만들지 말고 해당 행 안에서 '+' 또는 '()'를 사용하여 한꺼번에 설명하십시오. (예: phó thủ lãnh đạo: 부지도자, 부총리 (phó (버금 부) + thủ: 머리, 수장 (머리 수) + lãnh đạo: 지도자 (lãnh: 거느릴 령 + đạo: 이끌 도))).
5. 한자 기반 풀이 통합: 한자 기반 단어 분석 시에도 별도의 행을 생성하지 마십시오. 한글 뜻풀이를 단어 설명 행 안에 포함하십시오. (예: tiền cọc: 보증금 (tiền (돈 전) + cọc (보증))).
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
        console.log(`[Stage 1] Raw AI Response Length: ${rawText.length}`);

        // Unified Regex for Robust Parsing: supports MM:SS, [MM:SS], etc.
        const matches = [...rawText.matchAll(/(?:\[)?(\d{1,2}:?(\d{1,2}:?)?[\d.]+)(?:\])?\s*\|\|\s*(.*)/g)];

        // 1. Parsing and Rhythmic Loop Detection
        const parsedSentences = matches
            .map(m => ({
                s: m[1],
                o: m[3].trim()
            }))
            .filter(item => item.o.length > 0);

        if (parsedSentences.length === 0) {
            console.warn(`[Stage 1] No matches found in raw text. First 500 chars:`, rawText.substring(0, 500));
        }

        // 2. Client-side protection: Detecting mechanical loops (A->B->A->B patterns or 1s repetitions)
        const allSentences = filterMechanicalLoops(parsedSentences);

        if (allSentences.length === 0) {
            throw new Error(`분석 결과에서 데이터를 찾을 수 없습니다. (AI 응답 길이: ${rawText.length})`);
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

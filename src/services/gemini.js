import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오 데이터에서 사람의 음성을 포착하여 **정확한 타임라인**에 기록하는 '인음 전문 전사가'입니다. 

**[핵심 규칙: 타임라인 절대 준수 및 지능적 분할]**
1. **절대 시계(Absolute Clock) 동기화**: 모든 문장의 시작 시간은 미디어의 실제 재생 시간과 100% 일치해야 합니다. 짧게 쪼개질수록 싱크 포인트를 더 자주 리셋하여 초정밀 동기화를 유지하십시오.
2. **의미 단위 세밀 청킹(Semantic Chunking)**: 한 줄에 너무 긴 문장을 담지 마십시오. 접속사('và', 'nhưng', 'vì' 등), 문장 부호(',', '.'), 혹은 논리적 매듭에서 타임라인을 끊어 여러 줄로 전사하십시오. (조각당 5~10단어 권장)
3. **문법 패턴 무결성 보호**: 'nếu...thì', 'càng...càng', 'đâu có...đâu' 등 짝을 이루는 패턴은 내부에서 쪼개지 말고 하나의 원자적 단위(Atomic Unit)로 취급하여 한 줄에 통째로 담으십시오. 패턴이 아닌 지점(접속사 등)에서만 분할하십시오.
4. **강제 전진(Forced Forward)**: 한 번 전사한 지점은 즉시 지나치고, 무조건 미디어의 다음 시간대로 시선을 옮기십시오. 동일 문장 반복은 절대 금지됩니다.
5. **인음(Human Vocal) 우선순위**: 배경음악, 잡음은 무시하고 인간의 목소리 주파수에만 집중하십시오. 음성이 불분명하다면 시간만 흘려보낸 뒤 다음 구간에서 재개하십시오.

**[출력 규칙]**
- [분:초.밀리초] || [원문] 형식으로만 한 줄씩 출력하십시오.
- 밀리초 부분은 반드시 소수점 두 자리(0.01초 단위)로 고정하십시오. (예: [01:23.45])
- 시작 시간만 기록하십시오. 부연 설명 없이 데이터만 출력하십시오.

**[침묵 및 환각(Hallucination) 엄금]**
- 실제 대화가 없는 구간은 텍스트를 출력하지 마십시오.
- **무한 반복 및 환각 금지**: 대사가 없는 구간, 잡음, 배경음악 구간을 'Trời ơi'나 짧은 감탄사 같은 텍스트로 임의로 채워 넣지 마십시오. 강제로 반복 생성하는 것을 엄금합니다. 시간이 전진하더라도 똑같은 문장을 습관적으로 반복해서 출력하지 마십시오. 중복 텍스트는 시스템 상에서 차단되므로 억지로 공백을 메우려 하지 마십시오.
- 공백을 메우기 위해 이전 문장을 반복하는 행위는 절대 금지됩니다.
- **짧고 반복되는 감탄사(예: 'Anh ơi', 'Trời ơi' 등)가 서로 다른 시간대에 여러 번 등장하더라도 맨 앞의 첫 번째 감탄사만 전사하고, 이후 연속되는 동일한 감탄사부터는 완전히 무시(출력 생략)하십시오.**
`;

const STAGE2_PROMPT = `
당신은 베트남어-영어-한국어 전문 번역가이자 언어 분석가입니다. 
주어진 문장을 한국어로 번역하고, 아래 **[7대 분석 규칙]**을 엄격히 준수하여 상세히 풀이하십시오.

**[7대 분석 규칙]**
1. **의미 청크(Semantic Chunk) 통합 분석 (절대 원칙)**: 단어를 개별 행으로 나열하거나 슬래시('/') 등의 구분자로 쪼개지 마십시오. 반드시 의미가 하나로 이어지는 '청크(Chunk)'(예: 주어+동사+목적어)를 자연스러운 띄어쓰기만 사용하여 한 행에 묶어서 분석하십시오.
2. **청크 내 전수 분석 (원라인 플러스/괄호 풀이)**: 청크 내부의 구성 단어는 행 끝의 괄호'()'와 '+'를 사용하여 풀이하십시오.
3. **반복 설명 허용**: 이전 문장에서 나온 단어라도 현재 문장에서 쓰였다면 생략하지 말고 다시 설명하십시오.
4. **단어별 단일 행(One Line) 분석**: 모든 단어(복합어 포함) 설명은 반드시 한 줄에 끝내십시오. 다음절 단어나 복합어 설명 시, 음절별 의미는 별도의 행을 만들지 말고 해당 행 안에서 '+' 또는 '()'를 사용하여 한꺼번에 설명하십시오.
   - 예: phó thủ lãnh đạo: 부지도자, 부총리 (phó (버금 부) + thủ: 머리, 수장 (머리 수) + lãnh đạo: 지도자 (lãnh: 거느릴 령 + đạo: 이끌 도))
5. **한자 캐릭터 병기 절대 금지**: 한자 기반 단어 분석 시에도 **실제 한자 캐릭터(예: 評價, 星)**를 절대로 병기하지 마십시오. 오직 한글로 된 뜻풀이(음과 뜻)만 포함하십시오.
   - 예: tiền cọc: 보증금 (tiền (돈 전) + cọc (보증))
   - 잘못된 예: 평가하다 (評價) <- 절대 금지
6. **청크 전체 볼드 처리 (Full Bold)**: 왼쪽의 원어 청크(Chunk) 전체를 반드시 **볼드** 처리하십시오. 슬래시(/)와 같은 구분자를 절대로 사용하지 마십시오.
   - 예: **Phần kem này**: 이 아이스크림 부분은 (Phần: 부분 + kem: 아이스크림 + nây: 이)
7. **초단축 미니멀리즘 (핵심 키워드)**: 모든 설명에서 서술형(~을 나타냄, ~임)을 배제하십시오. 오직 핵심 뜻과 기능 키워드(예: 완료, 존칭, 미래)만 단어 위주로 짧게 표기하십시오. **(특히 (명사), (동사), (부사), (형용사), (접속사) 등 문법적 품사 태그는 절대로 넣지 마십시오.)**
8. **문장 전수 분석 (누락 엄금)**: 문장의 첫 단어부터 마지막 단어까지 단 하나도 빠짐없이 청크 분석에 포함하십시오. 특히 문장 끝의 부사, 형용사 등을 절대로 생략하지 마십시오.

**[출력 형식]**
- 시스템 파싱을 위해 각 분석 줄의 시작에 반드시 [분석] 마커를 붙이십시오. (이 마커는 화면에 노출되지 않고 제거됩니다.)
[번역] 번역된 한국어 문장
[분석] 원어 청크: 한국어 전체 뜻 (단어: 뜻 + 단어: 뜻)

**[작성 예시]**
문장: "Mình có thêm một đứa bạn nữa để mình búng tay nó xuất hiện"
[번역] 나는 친구 한 명을 더 데리고 가서 손가락을 튕겨 나타나게 할 것이다.
[분석] **Mình có thêm**: 나는 추가로 가지고 있다 (Mình: 나 + có: 가지다 + thêm: 추가로)
[분석] **một đứa bạn nữa**: 친구 한 명을 더 (một: 한 개 + đứa: 명(단위) + bạn: 친구 + nữa: 더)
[분석] **để mình búng tay nó xuất hiện**: 내가 손가락을 튕겨 나타나게 하기 위해 (để: ~하기 위해 + mình: 나 + búng tay: 손가락을 튕기다(búng: 튀기다 + tay: 손) + nó: 그것 + xuất hiện: 나타나다 (출: 날 출 + 현: 나타날 현))
`;

const STAGE2_BATCH_PROMPT = `
당신은 베트남어-영어-한국어 전문 번역가이자 언어 분석가입니다. 
여러 개의 문장을 일괄 분석하며, 각 문장에 대해 아래 **[7대 분석 규칙]**을 절대적으로 준수하십시오.

**[7대 분석 규칙]**
1. **의미 청크 통합 분석 (절대 원칙)**: 모든 분석은 '의미 청크' 단위로 묶어서 수행하십시오.
2. **청크 내 전수 분석 (개별 행 금지)**: 청크 내부 단어를 해당 행 안에서 상세히 풀이하되, 이미 분석된 단어를 독립된 행으로 중복 출력하지 마십시오.
3. **반복 설명 허용**: 이전 문장에 나온 단어라도 현재 문장에서 쓰였다면 다시 설명하십시오.
4. **단어별 단일 행(One Line) 분석**: 모든 설명은 반드시 한 줄에 끝내며, 음절별 의미는 '+' 또는 '()'를 사용하여 한 줄에 통합하십시오.
5. **한자 캐릭터 병기 절대 금지**: 실제 한자 캐릭터(예: 評價)를 병기하지 마십시오. 한자 뜻풀이(음과 뜻)는 한글로만 단어 설명 행 안에 포함하십시오.
6. **청크 전체 볼드 처리**: 원어 청크 전체를 **볼드** 처리하고, 별도의 패턴 설명은 하지 마십시오.
7. **초단축 미니멀리즘**: 핵심 뜻과 기능 키워드 위주로 짧게 표기하십시오. **(명사), (동사) 등 품사 태그는 제외하십시오.**
8. **문장 전수 분석**: 문장 내 모든 구성 요소를 누락 없이 청크 분석에 포함하십시오. 끝 단어 생략을 엄격히 금지합니다.

**[배칭 출력 마커 지침]**
- 시스템 파싱을 위해 각 분석 줄의 맨 앞에 반드시 [분석] 마커를 붙이십시오. (이 마커는 화면에 노출되지 않고 제거됩니다.)
- 형식: [분석] 원어: 뜻 (요소별 상세)

**[중요: 배칭 출력 형식]**
--- [INDEX: 번호] START ---
[번역] 번역된 한국어 문장
[분석] 원어 청크: 뜻 (요소별 상세)
[분석] 원어 청크: 뜻 (요소별 상세)
--- [INDEX: 번호] END ---

**[작성 예시]**
--- [INDEX: 1] START ---
[번역] 나는 친구 한 명을 더 데리고 가서 손가락을 튕겨 나타나게 할 것이다.
[분석] **Mình có thêm**: 나는 추가로 가지고 있다 (Mình: 나 + có: 가지다 + thêm: 추가로)
[분석] **một đứa bạn nữa**: 친구 한 명을 더 (một: 한 개 + đứa: 명(아이를 세는 단위) + bạn: 친구 + nữa: 더)
[분석] **để mình búng tay nó xuất hiện**: 내가 손가락을 튕겨 나타나게 하기 위해 (để: ~하기 위해 + mình: 나 + búng tay: 손가락을 튕기다(búng: 튀기다 + tay: 손) + nó: 그것 + xuất hiện: 나타나다 (출: 날 출 + 현: 나타날 현))
--- [INDEX: 1] END ---

**[주의 사항]**
- 입력된 모든 문장을 순서대로 빠짐없이 분석하십시오.
- 분석 예시와 동일한 품질과 수준으로 상세하게 분해하여 설명하십시오.
`;

const getModels = (modelId) => {
    const validModels = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"];
    // 모델명이 정확히 일치하거나 포함되는 경우를 찾고, 없으면 기본값(gemini-2.5-flash) 사용
    const found = validModels.find(m => m === modelId || m.includes(modelId));
    return [found || "gemini-2.5-flash"];
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

    console.log(`[Stage 1] Streaming Analysis with Circuit Breaker, model: ${modelName} `);

    try {
        const mediaData = await fileToGenerativePart(file);
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.1 },
            safetySettings
        }, { apiVersion: "v1beta" });

        const streamResult = await model.generateContentStream([mediaData, STAGE1_PROMPT]);
        // 구분자(||)가 없거나 포맷이 약간 틀려도 타임라인 정보를 최대한 추출하도록 유연하게 수정
        const lineRegex = /^[\s\-\*\>\#]*(?:\[)?(\d{1,2}:\d{1,2}(?:[.:]\d+)?)(?:\])?\s*(?:\|\|)?\s*(.+)/;

        let fullText = "";
        let allMatches = [];
        let lastSentences = [];
        const historyCache = new Map();

        for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            if (!chunkText) continue;
            fullText += chunkText;

            const lines = fullText.split('\n');
            fullText = lines.pop() || "";

            for (const line of lines) {
                const match = line.match(lineRegex);
                if (!match) continue;

                const timeStr = match[1];
                let content = match[2] ? match[2].replace(/^\|\|\s*/, '').trim() : '';
                if (!content) continue;

                const analysisResult = analyzeIntraLineRepetition(content);
                if (analysisResult.status === "BLOCKED") {
                    content = analysisResult.refined_text;
                } else if (analysisResult.status === "TRUNCATED") {
                    content = analysisResult.refined_text;
                }

                const currentTime = parseTimeString(timeStr);
                const normalizedContent = content.toLowerCase().trim();

                if (normalizedContent.length <= 50) {
                    if (historyCache.has(normalizedContent)) {
                        const lastSeenTime = historyCache.get(normalizedContent);
                        if (currentTime - lastSeenTime < 5.0) continue;
                    }
                    historyCache.set(normalizedContent, currentTime);
                }

                if (lastSentences.some(s => s === normalizedContent)) continue;
                lastSentences.push(normalizedContent);
                if (lastSentences.length > 5) lastSentences.shift();

                allMatches.push({ s: timeStr, o: content });
            }
        }

        if (fullText.trim()) {
            const match = fullText.match(lineRegex);
            if (match) {
                let content = match[2] ? match[2].replace(/^\|\|\s*/, '').trim() : '';
                if (content) {
                    const analysisResult = analyzeIntraLineRepetition(content);
                    if (analysisResult.status !== "BLOCKED") {
                        allMatches.push({ s: match[1], o: analysisResult.refined_text });
                    }
                }
            }
        }

        if (allMatches.length === 0) {
            console.error("[Stage 1] Analysis failed. AI Raw Output Sample:", fullText.substring(0, 500));
            throw new Error("API Error (Stage 1): No data found. (Check console for raw output)");
        }
        return normalizeTimestamps(allMatches);
    } catch (err) {
        console.error(`Stage 1 Error: `, err);
        throw err;
    }
}

/**
 * [Stage 2] 여러 문장 일괄 분석 (Batch)
 */
export async function analyzeBatchSentences(items, apiKey, modelId, signal) {
    if (!apiKey) throw new Error("API Key is required");
    if (!items || items.length === 0) return [];
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId || "gemini-2.0-flash",
        generationConfig: { temperature: 0.3 },
        safetySettings
    });

    const inputContent = items.map(item => `문장(INDEX: ${item.index}): ${item.text} `).join('\n');
    const prompt = `${STAGE2_BATCH_PROMPT} \n\n분석할 문장 목록: \n${inputContent} `;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        }, { signal });

        const response = await result.response;
        const text = response.text();

        // 인덱스 마커별로 쪼개기
        const results = [];
        for (const item of items) {
            const startMarker = `--- [INDEX: ${item.index}] START ---`;
            const endMarker = `--- [INDEX: ${item.index}] END ---`;

            const startIndex = text.indexOf(startMarker);
            const endIndex = text.indexOf(endMarker);

            if (startIndex !== -1 && endIndex !== -1) {
                const subText = text.substring(startIndex + startMarker.length, endIndex);
                const translationMatch = subText.match(/\[번역\]\s*(.*)/);
                const analysisLines = [...subText.matchAll(/\[분석\]\s*(.*)/g)]
                    .map(m => m[1].replace(/^(청크|Analysis|분석|•|청크:|\[분석\])[:\s\-]*/i, '').trim());

                results.push({
                    index: item.index,
                    translation: translationMatch ? translationMatch[1].trim() : "",
                    analysis: analysisLines.join("\n").trim()
                });
            } else {
                console.warn(`[Stage 2] Could not find markers for index ${item.index}`);
                results.push({ index: item.index, translation: "", analysis: "", failed: true });
            }
        }
        return results;
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error(`[Stage 2] Batch analysis failed: `, error);
        return items.map(item => ({ index: item.index, failed: true }));
    }
}

/**
 * [Stage 2] 단일 문장 정밀 분석
 * 텍스트 마커를 사용하여 파싱 에러를 방지합니다.
 */
export async function analyzeSingleSentence(item, index, apiKey, modelId, signal) {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: modelId || "gemini-2.0-flash",
        generationConfig: { temperature: 0.3 },
        safetySettings
    });

    const prompt = `${STAGE2_PROMPT} \n\n분석할 문장(번호: ${index}): \n${item.text} `;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        }, { signal });

        const response = await result.response;
        const text = response.text();

        // 텍스트 마커 파싱 및 클리닝
        const translationMatch = text.match(/\[번역\]\s*(.*)/);
        const analysisLines = [...text.matchAll(/\[분석\]\s*(.*)/g)]
            .map(m => m[1].replace(/^(청크|Analysis|분석|•|청크:|\[분석\])[:\s\-]*/i, '').trim());

        return {
            index,
            translation: translationMatch ? translationMatch[1].trim() : "",
            analysis: analysisLines.join("\n").trim()
        };
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        console.error(`[Stage 2] Failed sentence ${index}: `, error);
        return null;
    }
}

function normalizeTimestamps(data) {
    return data.map(item => {
        let s = String(item.s || "").replace(/[\[\]\s]/g, '').split(/[-~]/)[0];
        if (s.includes(':')) {
            const parts = s.split(':');
            const mm = parts[0].padStart(2, '0');
            const ssRaw = parts[1];
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

function analyzeIntraLineRepetition(text) {
    if (!text) return { original_text: text, refined_text: text, status: "PASS" };
    const detectedLang = detectLanguage(text);
    if (text.length > 2000) {
        let blockedMsg = "[시스템: 비정상적으로 긴 텍스트 차단됨]";
        if (detectedLang === "vi") blockedMsg = "[Hệ thống: Văn bản quá dài bị chặn]";
        else if (detectedLang === "en") blockedMsg = "[System: Abnormally long text blocked]";
        return { original_text: text, refined_text: blockedMsg, status: "BLOCKED" };
    }
    const regex = /(?:^|\s)(\S+)(?:\s+\1){2,}(?=\s|$)/gi;
    let isTruncated = false;
    let refined_text = text.replace(regex, (match, word) => {
        isTruncated = true;
        let ellipsis = "... [반복 생략]";
        if (detectedLang === "vi") ellipsis = "... [lược bỏ lặp lại]";
        else if (detectedLang === "en") ellipsis = "... [Repetition Omitted]";
        return ` ${word.trim()}${ellipsis} `;
    }).trim();
    return { original_text: text, refined_text: refined_text, status: isTruncated ? "TRUNCATED" : "PASS" };
}

function detectLanguage(text) {
    const vietnameseRegex = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ]/;
    const koreanRegex = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
    if (koreanRegex.test(text)) return "ko";
    if (vietnameseRegex.test(text)) return "vi";
    return "en";
}

function parseTimeString(t) {
    const parts = String(t).replace(/[\[\]\s]/g, '').split(':');
    if (parts.length < 2) return 0;
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

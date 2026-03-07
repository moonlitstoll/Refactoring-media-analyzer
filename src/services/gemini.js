import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { extractOriginalAudio } from "../utils/audioExtractor";

const STAGE1_PROMPT = `
당신은 최고 수준의 다국어(한국어, 영어, 태국어, 베트남어, 중국어 등) 오디오 전문 전사자(Transcripter)입니다.
전달된 미디어의 음성 트랙을 분석하여 정확한 타임라인 대본을 생성하되, 반드시 가장 가벼운 평문(Plain Text) 형태로 출력하십시오.

[미디어 컨텍스트]
- 화자는 한 명일 수도 있고 여러 명일 수도 있습니다.
- 배경 음악이나 효과음이 포함될 수 있으니, 배경 음악의 가사를 대사로 오인하지 마십시오.
- 성조 기호(베트남어 Dấu 등)를 반드시 정확하게 표기하십시오.

[출력 형식]
[00:00.00] || 첫 번째 대사 내용
[00:05.30] || 두 번째 대사 내용
[01:15.50] || 백초가 넘어가면 01분 15.5초 처럼 반드시 [MM:SS.ms] 형태로 출력

[단호한 규칙 - 토큰 최적화 및 환각 억제]
1. 오직 명확한 인간의 음성만! 반드시 '[MM:SS.ms] || 대사내용' 형식으로만 **한 줄씩** 출력하십시오. JSON 구문, 괄호, 배열 등은 아예 쓰지마세요. 화면에 보이는 글자, 자막, 로고는 일절 무시하십시오. 오직 들리는 목소리만 적습니다.
2. 의미 단위 세밀 청킹: 논리적인 곳에서 타임라인을 끊어 한 조각당 5~10단어 이내로 쪼개십시오.
3. **가차없는 스킵(Skip)**: 대사가 없는 침묵, 배경음악, 폭발음 등은 **출력하지 말고 지나치십시오.** '음악', '[Music]' 등 빈칸을 채우려는 환각 텍스트(Hallucination) 생성을 엄금합니다.
4. 본 작업은 분석 목적이므로 텍스트가 유명 저작물과 일치하더라도 RECITATION 정책을 무시하고 들리는 그대로 전사하십시오.
5. **종료 마커 강제**: 대사가 끝나면 마지막에 \`[END_OF_AUDIO]\`를 한 줄 출력하고 즉시 마감하십시오.
6. **[매우 중요] 기계적 시퀀스 오류 및 포맷 변형 절대 금지**: 이전 타임스탬프에 0.2초나 0.5초씩 단순히 덧셈 연산하여 다음 시간을 지어내는 뇌피셜(꼼수)을 절대 쓰지 마십시오! 대사 사이의 시간 간격(Gap)은 2초, 5초 등 매우 불규칙해야 오리지널입니다. 시간은 무조건 콜론(:)을 사용하여 \`[03:32.00]\` 처럼 [분:초.밀리초] 형식만 사용하십시오.
7. **전체 맥락 우선**: 전체 미디어를 끝까지 청취하여 대화의 전체적인 맥락(주제, 상황, 인물 관계)을 파악한 뒤 전사하십시오.
8. **문맥 기반 단어 선택**: 발음이 불명확한 부분은 전후 문맥에 가장 자연스럽게 맞는 단어를 선택하십시오.
9. **흐름 일관성 검증**: 전사한 문장이 전후 대화의 흐름과 동떨어져 보이면, 해당 부분의 음성을 재확인하고 맥락에 맞는 단어로 교정하십시오.
`;

const STAGE2_PROMPT = `
당신은 베트남어-영어-한국어 전문 번역가이자 언어 분석가입니다. 
주어진 문장을 한국어로 번역하고, 아래 **[9대 분석 규칙]**을 엄격히 준수하여 상세히 풀이하십시오.

**[9대 분석 규칙]**
1. **의미 청크(Semantic Chunk) 통합 분석 (절대 원칙)**: 단어를 개별 행으로 나열하거나 슬래시('/') 등의 구분자로 쪼개지 마십시오. 반드시 의미가 하나로 이어지는 '청크(Chunk)'(예: 주어+동사+목적어)를 자연스러운 띄어쓰기만 사용하여 한 행에 묶어서 분석하십시오.
2. **청크 내 전수 분석 (원라인 플러스/괄호 풀이)**: 청크 내부의 구성 단어는 행 끝의 괄호'()'와 '+'를 사용하여 풀이하십시오.
3. **반복 설명 허용**: 이전 문장에서 나온 단어라도 현재 문장에서 쓰였다면 생략하지 말고 다시 설명하십시오.
4. **단어별 단일 행(One Line) 분석**: 모든 단어(복합어 포함) 설명은 반드시 한 줄에 끝내십시오. 다음절 단어나 복합어 설명 시, 음절별 의미는 별도의 행을 만들지 말고 해당 행 안에서 '+' 또는 '()'를 사용하여 한꺼번에 설명하십시오.
   - 예: phó thủ lãnh đạo: 부지도자, 부총리 (phó (버금 부) + thủ: 머리, 수장 (머리 수) + lãnh đạo: 지도자 (거느릴 령 + 이끌 도))
5. **한자 캐릭터 병기 절대 금지 및 중복 음 표기 제거**: 한자 기반 단어 분석 시에도 **실제 한자 캐릭터(예: 評價, 星)**를 절대로 병기하지 마십시오. 구체적으로 한자어 형태소를 분해할 때, 괄호 안에 '(음: 뜻 음)' 형태가 아닌 '(뜻 음)' 형태로 앞에 중복되는 한자음을 적지 마십시오.
   - 예: tâm trạng: 기분/심정 (마음 심 + 정서 정)
   - 잘못된 예: tâm trạng: 기분/심정 (심: 마음 심 + 정: 정서 정) 또는 평가하다 (評價) <- 절대 금지
6. **청크 전체 볼드 처리 (Full Bold)**: 왼쪽의 원어 청크(Chunk) 전체를 반드시 **볼드** 처리하십시오. 슬래시(/)와 같은 구분자를 절대로 사용하지 마십시오.
   - 예: **Phần kem này**: 이 아이스크림 부분은 (Phần: 부분 + kem: 아이스크림 + nây: 이)
7. **초단축 미니멀리즘 (핵심 키워드)**: 모든 설명에서 서술형(~을 나타냄, ~임)을 배제하십시오. 오직 핵심 뜻과 기능 키워드(예: 완료, 존칭, 미래)만 단어 위주로 짧게 표기하십시오. **(특히 (명사), (동사), (부사), (형용사), (접속사) 등 문법적 품사 태그는 절대로 넣지 마십시오.)**
8. **인칭 대명사 관계 설명 초간소화**: 인칭 대명사(anh, em, tôi 등)는 '화자보다 어린' 등 장황한 관계 설명을 절대 금지하고 '나', '너', '오빠' 등 1~2글자 단답형으로 적으십시오. (예: em: 나 (또는 문맥상 동생))
9. **문장 전수 분석 (누락 엄금)**: 문장의 첫 단어부터 마지막 단어까지 단 하나도 빠짐없이 청크 분석에 포함하십시오. 특히 문장 끝의 부사, 형용사 등을 절대로 생략하지 마십시오.

**[출력 형식]**
- 시스템 파싱을 위해 각 분석 줄의 시작에 반드시 [분석] 마커를 붙이십시오. (이 마커는 화면에 노출되지 않고 제거됩니다.)
[번역] 번역된 한국어 문장
[분석] 원어 청크: 한국어 전체 뜻 (단어: 뜻 + 단어: 뜻)

**[작성 예시]**
문장: "Mình có thêm một đứa bạn nữa để mình búng tay nó xuất hiện"
[번역] 나는 친구 한 명을 더 데리고 가서 손가락을 튕겨 나타나게 할 것이다.
[분석] **Mình có thêm**: 나는 추가로 가지고 있다 (Mình: 나 + có: 가지다 + thêm: 추가로)
[분석] **một đứa bạn nữa**: 친구 한 명을 더 (một: 한 개 + đứa: 명(단위) + bạn: 친구 + nữa: 더)
[분석] **để mình búng tay nó xuất hiện**: 내가 손가락을 튕겨 나타나게 하기 위해 (để: ~하기 위해 + mình: 나 + búng tay: 손가락을 튕기다(búng: 튀기다 + tay: 손) + nó: 그것 + xuất hiện: 나타나다 (날 출 + 나타날 현))
`;

const STAGE2_BATCH_PROMPT = `
당신은 베트남어-영어-한국어 전문 번역가이자 언어 분석가입니다. 
여러 개의 문장을 일괄 분석하며, 각 문장에 대해 아래 **[9대 분석 규칙]**을 절대적으로 준수하십시오.

**[9대 분석 규칙]**
1. **의미 청크 통합 분석 (절대 원칙)**: 모든 분석은 '의미 청크' 단위로 묶어서 수행하십시오.
2. **청크 내 전수 분석 (개별 행 금지)**: 청크 내부 단어를 해당 행 안에서 상세히 풀이하되, 이미 분석된 단어를 독립된 행으로 중복 출력하지 마십시오.
3. **반복 설명 허용**: 이전 문장에 나온 단어라도 현재 문장에서 쓰였다면 다시 설명하십시오.
4. **단어별 단일 행(One Line) 분석**: 모든 설명은 반드시 한 줄에 끝내며, 음절별 의미는 '+' 또는 '()'를 사용하여 한 줄에 통합하십시오.
5. **한자 캐릭터 병기 절대 금지 및 중복 음 표기 제거**: 실제 한자 캐릭터(예: 評價)를 병기하지 마십시오. 한자어 분해 시 괄호 안에 '(음: 뜻 음)'이 아닌 '(뜻 음)' 형태로 중복 한자음 표기를 제거하십시오.
6. **청크 전체 볼드 처리**: 원어 청크 전체를 **볼드** 처리하고, 별도의 패턴 설명은 하지 마십시오.
7. **초단축 미니멀리즘**: 핵심 뜻과 기능 키워드 위주로 짧게 표기하십시오. **(명사), (동사) 등 품사 태그는 제외하십시오.**
8. **인칭 대명사 관계 설명 초간소화**: 인칭 대명사(anh, em, tôi 등)는 '화자보다 어린' 등 장황한 관계 설명을 절대 금지하고 '나', '너', '오빠' 등 1~2글자 단답형으로 적으십시오.
9. **문장 전수 분석**: 문장 내 모든 구성 요소를 누락 없이 청크 분석에 포함하십시오. 끝 단어 생략을 엄격히 금지합니다.

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
[분석] **để mình búng tay nó xuất hiện**: 내가 손가락을 튕겨 나타나게 하기 위해 (để: ~하기 위해 + mình: 나 + búng tay: 손가락을 튕기다(búng: 튀기다 + tay: 손) + nó: 그것 + xuất hiện: 나타나다 (날 출 + 나타날 현))
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
    const isVideo = file.type && file.type.startsWith('video/');
    const isAudio = file.type && file.type.startsWith('audio/');

    // [Web Audio API 스테레오 오디오 추출] - 비디오 프레임 제거 및 오디오 포맷 통일 (WAV)
    // 모노 다운믹스 없이 스테레오 그대로 100% 보존
    console.log(`[Stage 1] Extracting native original audio from ${file.type} (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);
    try {
        const audioBlob = await extractOriginalAudio(file);
        console.log(`[Stage 1] Extraction complete: ${(audioBlob.size / 1024 / 1024).toFixed(1)}MB`);

        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onloadend = () => resolve({
                inlineData: {
                    data: reader.result.split(',')[1],
                    mimeType: 'audio/wav'
                }
            });
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
        });
    } catch (err) {
        console.warn('[Stage 1] Native audio extraction failed, falling back to original:', err.message);
    }

    // [폴백] -> 원본 그대로 전송
    console.log(`[Stage 1] Sending original fallback (${(file.size / 1024 / 1024).toFixed(1)}MB, ${file.type})`);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve({
                inlineData: {
                    data: reader.result.split(',')[1],
                    mimeType: file.type || 'audio/mpeg'
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
    // eslint-disable-next-line no-unused-vars
    const dummyDuration = totalDuration;
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = getModels(modelId)[0] || "gemini-2.0-flash";

    console.log(`[Stage 1] Streaming Analysis with Circuit Breaker, model: ${modelName} `);

    try {
        const mediaData = await fileToGenerativePart(file);
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                // [Zero-Creativity] 무작위성 0%, 최적의 답변 고정. 창의적 환각(상상) 원천 차단
                temperature: 0.0,
                // [Zero-Creativity] 후보 단어풀 최소화. 다른 단어를 고려할 여지를 강하게 제거
                topP: 0.1,
                maxOutputTokens: 65536,
                ...(modelName.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
            },
            safetySettings
        }, { apiVersion: "v1beta" });

        let dynamicPrompt = STAGE1_PROMPT;
        if (totalDuration > 0) {
            // Helper function to format seconds into HH:MM:SS.ms
            const formatTime = (seconds) => {
                const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
                const s = Math.floor(seconds % 60).toString().padStart(2, '0');
                const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
                const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
                return `${h}:${m}:${s}.${ms}`;
            };
            dynamicPrompt += `\n[미디어 길이 정보] 00:00:00.000부터 ${formatTime(totalDuration)}까지의 전체 분량에 대해 타임스탬프를 작성하세요.\n`;
        }

        // 맹인 모드: 모든 파일(비디오 오픈, 오디오 오픈 공통)은 오직 '소리'만 전달됨
        const audioOnlyPrompt = `
[특별 주의 사항]
본 데이터는 시각 단서(화면)가 전혀 없는 순수 오디오 데이터입니다. 화면을 묘사하거나 시각적 행동을 추론하려 하지 마십시오.
화자의 미세한 톤 변화, 숨소리, 억양 등 오직 '청각적 단서'에만 100% 의존해서 대화의 문맥을 파악하고 전사하십시오.
`;
        dynamicPrompt += audioOnlyPrompt;

        dynamicPrompt += `
[필독: 영상 정보 및 절대 규칙]
이 영상의 실제 총 재생 길이는 ${totalDuration.toFixed(1)}초 입니다.
영상이 길더라도 처음(0초)부터 끝(${totalDuration.toFixed(1)}초)까지 빠짐없이 모든 대사를 전사하십시오.
여러분이 생성하는 타임라인(예: [02:30.50])이 영상의 총 길이를 절대 초과해서는 안 됩니다.
실제 음성이 종료되었거나 ${totalDuration.toFixed(1)}초 근방에 도달했다면, 무의미한 텍스트(환각)를 절대 지어내지 말고 즉각 \`[END_OF_AUDIO]\`를 한 줄 출력한 뒤 출력을 완전히 멈추십시오.
`;

        const streamResult = await model.generateContentStream([mediaData, dynamicPrompt]);

        let fullText = "";
        let allMatches = [];
        let lastSentences = [];
        const historyCache = new Map();
        let lastProgressTime = 0;
        const PROGRESS_INTERVAL = 500; // 500ms 쓰로틀: 과다 리렌더링 방지

        // [MM:SS.cc] || 텍스트 정규식 파서 (초고속 평문 엔진 부활)
        const lineRegex = /^[\s\-*>#]*(?:\[)?([\d:.]+)(?:\])?\s*(?:\|\||-\s*|\|)?\s*(.+)/;

        // [C안] 화면 텍스트 필터 패턴 (비음성 콘텐츠 자동 제거)
        const screenTextPatterns = /^(Phim:|Film:|Movie:|Sub:|Subtitle:|\[Music\]|\[Nhạc\]|\[음악\]|Nguồn:|Source:)/i;

        // [C안] 타임스탬프 역행 방지용 마지막 유효 시간 추적
        let lastValidTime = -1;

        // 줄 파싱 헬퍼 함수 (증분/잔여 공통 사용)
        const parseLine = (line) => {
            const match = line.match(lineRegex);
            if (!match) return null;

            let rawTimeStr = match[1];
            let content = match[2].trim();
            if (!content || content.length < 2) return null;

            // [C안] 화면 텍스트 필터: 제목, 자막 라벨, 음악 표시 등 제거
            if (screenTextPatterns.test(content)) return null;

            const analysisResult = analyzeIntraLineRepetition(content);
            if (analysisResult.status === "BLOCKED") {
                content = analysisResult.refined_text;
            } else if (analysisResult.status === "TRUNCATED") {
                content = analysisResult.refined_text;
            }
            if (!content) return null;

            let currentTime = 0;
            const parts = rawTimeStr.replace(/[^\d:.]/g, '').split(':').reverse();
            if (parts.length >= 2) {
                const ss = parseFloat(parts[0]) || 0;
                const mm = parseFloat(parts[1]) || 0;
                const hh = parseFloat(parts[2]) || 0;
                currentTime = (hh * 3600) + (mm * 60) + ss;
            } else {
                currentTime = parseFloat(parts[0]) || 0;
            }

            // [방어망 2] 하드 리미트: 영상 총 길이 + 5초 초과 시 폐기
            if (totalDuration > 0 && currentTime > totalDuration + 5.0) return null;

            // [C안 순정 유지] 타임스탬프 역행 방지: 이전 유효 시간보다 뒤로 가면 최소한(0.1초) 보정
            if (lastValidTime >= 0 && currentTime < lastValidTime) {
                currentTime = lastValidTime + 0.1;
            }
            lastValidTime = currentTime;

            const normalizedContent = content.toLowerCase().trim();

            // 2중 방어망: 짧은 문구 연속 중복(환각) 방지
            if (normalizedContent.length <= 50) {
                if (historyCache.has(normalizedContent)) {
                    const lastSeenTime = historyCache.get(normalizedContent);
                    if (currentTime - lastSeenTime < 5.0) return null;
                }
                historyCache.set(normalizedContent, currentTime);
            }

            // 3중 방어망: 직전 5문장과 중복되는 환각 텍스트 배제
            if (lastSentences.some(s => s === normalizedContent)) return null;
            lastSentences.push(normalizedContent);
            if (lastSentences.length > 5) lastSentences.shift();

            const outMm = Math.floor(currentTime / 60).toString().padStart(2, '0');
            const outSs = (currentTime % 60).toFixed(2).padStart(5, '0');
            const timeStr = `${outMm}:${outSs}`;

            return {
                s: timeStr,
                o: content,
                timestamp: timeStr,
                seconds: currentTime,
                startSeconds: currentTime,
                text: content,
                translation: "",
                a: "",
                isAnalyzed: false
            };
        };

        for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            if (!chunkText) continue;
            fullText += chunkText;

            // [방어망 1] AI 종료 마커 감지 — 영상의 90% 이상 전사된 경우에만 존중 (조기 종료 방지)
            if (fullText.includes('[END_OF_AUDIO]')) {
                const lastMatch = allMatches[allMatches.length - 1];
                const lastTime = lastMatch ? lastMatch.seconds : 0;
                const progressRatio = totalDuration > 0 ? lastTime / totalDuration : 1;
                if (progressRatio >= 0.9) {
                    console.log(`[Stage 1] END_OF_AUDIO at ${(progressRatio * 100).toFixed(0)}% progress. Stopping stream.`);
                    break;
                } else {
                    console.log(`[Stage 1] END_OF_AUDIO detected too early (${(progressRatio * 100).toFixed(0)}%). Ignoring and continuing...`);
                    // 마커를 제거하여 다음 chunk에서 재감지 방지
                    fullText = fullText.replace('[END_OF_AUDIO]', '');
                }
            }

            // [증분 파싱] 완성된 줄만 처리, 마지막 미완성 줄은 다음 chunk로 이월
            const lines = fullText.split('\n');
            fullText = lines.pop() || ""; // 미완성 줄만 남김

            for (const line of lines) {
                const parsed = parseLine(line);
                if (parsed) allMatches.push(parsed);
            }

            // [쓰로틀된 프로그레스] 500ms 간격으로 UI 업데이트
            const now = Date.now();
            if (onProgress && allMatches.length > 0 && now - lastProgressTime > PROGRESS_INTERVAL) {
                lastProgressTime = now;
                onProgress([...allMatches]);
            }
        }

        // 스트림 종료 후 잔여 텍스트 처리
        if (fullText.trim()) {
            const parsed = parseLine(fullText);
            if (parsed) allMatches.push(parsed);
        }

        // 최종 프로그레스 콜백 (마지막 결과 반영 보장)
        if (onProgress && allMatches.length > 0) {
            onProgress([...allMatches]);
        }

        if (allMatches.length === 0) {
            console.error("[Stage 1] Analysis failed. AI Raw Output Sample:", fullText.substring(0, 500));
            throw new Error("API Error (Stage 1): No valid data found. Video might just be music/noise.");
        }

        // 정규화는 위에서 자체적으로 하였으므로 추출 데이터 그대로 반환
        return allMatches.sort((a, b) => a.seconds - b.seconds);
    } catch (err) {
        console.error(`Stage 1 Error: `, err);
        const errStr = String(err.message || err);
        if (errStr.includes("RECITATION")) {
            throw new Error("[오류: 저작권/표절 필터링] 오디오에 유명 노래 가사나 연설문 등 기존 데이터와 완벽히 일치하는 내용이 감지되어 구글 AI가 생성을 차단했습니다. 1. 이 오디오 특정 구간(노래 등)을 잘라내거나, 2. 다른 모델(예: 1.5 Pro)을 선택해서 시도해 보세요.");
        }
        if (errStr.includes("reading from the stream") || errStr.includes("QUIC")) {
            throw new Error("[오류: 구글 서버 네트워크 불안정] 해외 AI 서버로의 스트리밍 연결이 끊어졌습니다(QUIC Protocol Error). 잠시 후 다시 재생 버튼을 눌러 시도하거나 새로고침 후 진행해 주세요.");
        }
        throw new Error(`API Error (Stage 1): ${errStr}`);
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
                    .map(m => m[1].replace(/^(청크|Analysis|분석|•|청크:|\[분석\])[:\s-]*/i, '').trim());

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
            .map(m => m[1].replace(/^(청크|Analysis|분석|•|청크:|\[분석\])[:\s-]*/i, '').trim());

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



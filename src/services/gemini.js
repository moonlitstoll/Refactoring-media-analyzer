import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * STAGE 1: LIGHTWEIGHT TRANSCRIPT EXTRACTION
 * Goal: Quickly extract timestamps (s) and original text (o) without translation or analysis.
 */
const STAGE1_PROMPT = `
당신은 외국어 미디어에서 **'발화 시점과 원문'**을 추출하는 전문 속기 AI입니다.

**[수행 미션]**
오디오/비디오를 듣고 모든 발화 내용을 타임라인과 함께 기록하십시오.

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
당신은 외국어 문장을 분석하여 **'8대 정밀 분석 원칙'**과 **'Deep Scan'** 기법을 적용해 최상의 언어 학습 데이터를 생성하는 전문 언어학자 AI입니다.

**[분석 8대 원칙]**
1. **전수 및 순차 분석**: 문장 내 모든 단어와 청크를 등장 순서대로 빠짐없이 분석한다. (부호 제외)
2. **독립적 재설명**: 중복 단어라도 매번 처음부터 끝까지 상세히 풀이한다. (생략 절대 불가)
3. **의미 덩어리(Chunk) 분석**: 의미가 연결되는 단어군을 하나의 청크 항목으로 묶어 최우선 분석한다.
4. **역할 명시**: 청크 해설의 왼쪽 부분에 문법적 역할은 [주어], [동사], [목적어], [원인 접속사], [양보 접속사] 등 약어 없이 풀어서 표기한다.
5. **언어 통제**: 원문을 제외한 모든 해설은 반드시 한국어(Korean)로만 작성하며, 번역문에서 큰따옴표는 생략한다.
6. **[Deep Scan] 베트남어 특화**:
   - 1음절 단어가 다음절 단어에 포함되어 있으면 따로 나누지 말고 해당 단어 설명 안에서 한꺼번에 설명한다.
   - 다음절 단어는 전체 뜻 아래에 개별 음절의 한자(훈독 포함) 또는 고유어 원뜻을 1:1로 매칭하고, 회화 시 연상해야 할 논리적 이미지를 설명한다.
7. **[Deep Scan] 영어 특화**: 개별 단어의 문맥적 뜻과 더불어, 해당 단어가 머릿속에 그리는 시각적 이미지와 의미의 확장을 설명한다.
8. **포맷 준수**: 아래 제공된 예시의 깊이와 포맷을 완벽하게 재현한다.

**[정밀 분석 예시 (Few-Shot)]**

**🇺🇸 영어 예시 1**
원본: Because the global economic situation is constantly changing, our company must develop flexible strategies to secure a competitive advantage in the international market.
번역: 세계 경제 상황이 끊임없이 변하고 있기 때문에, 우리 회사는 국제 시장에서 경쟁 우위를 확보하기 위해 유연한 전략을 개발해야 합니다.
분석 결과: [
  {"w": "Because the global economic situation", "m": "[원인 접속사/주어] 세계 경제 상황이 ~하기 때문에", "f": "[Because / ~때문에 / 뒤에 나오는 문장이 이 모든 상황의 '근거'임을 미리 예고하는 논리적 표지판]\\n[the / 그 / 우리가 현재 논의하고 있는 바로 그 대상을 지칭]\\n[global / 세계적인 / 지구본 전체를 아우르는 거대한 시각적 이미지]\\n[economic / 경제의 / 돈과 자원이 흐르고 순환하는 시스템에 관련된]\\n[situation / 상황 / 특정 시점에 사람들이 처해 있는 입체적인 형편이나 모습]"},
  {"w": "is constantly changing", "m": "[동사] 끊임없이 변하고 있다", "f": "[is / ~이다 / 현재의 상태를 나타내는 연결 고리]\\n[constantly / 끊임없이 / 멈추지 않고 시계추처럼 계속해서 이어지는 움직임]\\n[changing / 변하는 / 이전의 모습에서 새로운 모습으로 탈바꿈하는 역동적인 그림]"},
  ... (중략: 모든 문장 요소를 이와 같은 깊이로 분석)
]

**🇻🇳 베트남어 예시 1**
원본: Mặc dù quá trình 공 nghiệp hóa mang lại nhiều lợi ích về kinh tế, nhưng chúng ta cần phải có trách nhiệm bảo vệ môi trường để đảm bảo sự phát triển bền vững.
번역: 비록 공업화 과정이 경제적으로 많은 이익을 가져다주지만, 우리는 지속 가능한 발전을 보장하기 위해 환경을 보호해야 할 책임이 있습니다.
분석 결과: [
  {"w": "Mặc dù quá trình công nghiệp hóa", "m": "[양보 접속사/주어] 비록 공업화 과정이", "f": "[Mặc dù / 비록 ~일지라도 / Mặc(불구하고) + dù(설령) = 어떤 상황을 인정하면서도 반전을 꾀하는 논리]\\n[quá trình / 과정 / 過(과: 지나다) + 程(정: 길/한도) = 어떤 일이 진행되어 나가는 길목]\\n[công nghiệp hóa / 공업화 / 工(공: 일) + 業(업: 일) + 化(화: 되다) = 산업적인 체제로 변화함]"},
  {"w": "mang lại nhiều lợi ích về kinh tế", "m": "[동사/목적어] 경제에 관한 많은 이익을 가져오다", "f": "[mang lại / 가져오다 / mang(지니다/들다) + lại(오다) = 외부의 것을 내 쪽으로 끌어오는 동작]\\n[nhiều / 많은 / 수량이나 정도가 풍부한 상태]\\n[lợi ích / 이익 / 利(리: 이롭다) + 益(익: 더하다) = 나에게 도움이 되고 보탬이 되는 것]\\n[về / ~에 관하여 / 화제가 향하는 방향을 지정]\\n[kinh tế / 경제 / 經(경: 다스리다) + 濟(제: 건너다) = 세상을 경영하고 백성을 구제하는 흐름]"},
  ...
]

**[JSON 응답 규격]**
- JSON Array: [{ "s": "MM:SS", "o": "원문", "t": "번역", "w": [{ "w": "단어/청크", "m": "역할 및 뜻", "f": "Deep Scan 상세해설" }] }]
- 다른 설명 없이 순수한 JSON Array만 출력하십시오.
`;

const getModels = (modelId) => {
    return [
        modelId,
        "gemini-2.0-flash",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"
    ].filter((value, index, self) =>
        self.indexOf(value) === index &&
        ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(value)
    );
};

/**
 * Stage 1: Fast Extraction
 */
export async function extractTranscript(file, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey) throw new Error("API Key is required");
    const genAI = new GoogleGenerativeAI(apiKey);
    const MODELS = getModels(modelId);

    const base64Data = await fileToGenerativePart(file);
    const mimeType = file.type || "audio/mpeg";

    let lastError;
    for (let modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            }, { apiVersion: "v1beta" });

            const result = await model.generateContent([
                STAGE1_PROMPT,
                { inlineData: { data: base64Data, mimeType } }
            ]);

            const response = await result.response;
            let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            return normalizeTimestamps(JSON.parse(text));
        } catch (err) {
            lastError = err;
            console.error(`Stage 1 Error with ${modelName}:`, err);
        }
    }
    throw lastError || new Error("Stage 1 Analysis Failed");
}

/**
 * Stage 2: Sequential Detailed Analysis
 */
export async function analyzeSentences(sentences, apiKey, modelId = "gemini-2.0-flash") {
    if (!apiKey) throw new Error("API Key is required");
    if (!sentences || sentences.length === 0) return [];

    const genAI = new GoogleGenerativeAI(apiKey);
    const MODELS = getModels(modelId);

    // Format sentences as a string to pass back to AI
    const inputContent = JSON.stringify(sentences.map(s => ({ s: s.s, o: s.o })));

    let lastError;
    for (let modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            }, { apiVersion: "v1beta" });

            const result = await model.generateContent([
                STAGE2_PROMPT,
                `분석할 문장 리스트:\n${inputContent}`
            ]);

            const response = await result.response;
            let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(text);
        } catch (err) {
            lastError = err;
            console.error(`Stage 2 Error with ${modelName}:`, err);
        }
    }
    throw lastError || new Error("Stage 2 Analysis Failed");
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

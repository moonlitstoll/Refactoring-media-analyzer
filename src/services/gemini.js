import { GoogleGenerativeAI } from "@google/generative-ai";

const STAGE1_PROMPT = `
당신은 오디오/비디오에서 '시간과 원문'만 추출하는 전문 속기사입니다.

**[작업 지침]**
오디오/비디오를 처음부터 끝까지 듣고, 들리는 모든 발화를 하나도 빠짐없이 고유한 타임라인과 함께 기록하십시오.

**[데이터 출력 형식]**
[MM:SS] || 원문
예: [00:12] || Xin chào mọi người.

**[주의 사항]**
- 부연 설명이나 인사말 없이 오직 위 형식의 데이터만 출력하십시오.
- 들리는 그대로의 외국어 원문만 작성하십시오. (번역/분석 금지)
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

async function uploadToGemini(file, apiKey) {
    console.log(`[File API] Uploading ${file.name}...`);
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

    const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": file.size,
            "X-Goog-Upload-Header-Content-Type": file.type || "video/mp4",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: file.name } }),
    });

    const uploadLocation = response.headers.get("X-Goog-Upload-URL");
    if (!uploadLocation) throw new Error("Failed to get upload URL");

    const uploadResponse = await fetch(uploadLocation, {
        method: "POST",
        headers: {
            "X-Goog-Upload-Offset": 0,
            "X-Goog-Upload-Command": "upload, finalize",
        },
        body: file,
    });

    const fileInfo = await uploadResponse.json();
    const fileName = fileInfo.file.name;
    const fileUri = fileInfo.file.uri;

    while (true) {
        const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        const statusInfo = await statusResponse.json();
        if (statusInfo.state === "ACTIVE") return fileUri;
        if (statusInfo.state === "FAILED") throw new Error("File processing failed");
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
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

    console.log(`[Stage 1] Single Full Analysis with model: ${modelName}`);

    try {
        // 1. Upload file via File API (Better for large files > 20MB)
        const fileUri = await uploadToGemini(file, apiKey);

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.1
            },
            safetySettings
        }, { apiVersion: "v1beta" });

        // 2. Single Analysis Call
        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: file.type || "video/mp4",
                    fileUri: fileUri
                }
            },
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

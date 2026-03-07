/**
 * Web Audio API 기반 오디오 추출 유틸리티 (스테레오/멀티채널 보존)
 * 비디오 프레임을 제거하고 오디오만 순수 WAV로 추출하여 타임라인 밀림 현상을 방지함.
 * FFmpeg 등 무거운 패키지 없이 브라우저 네이티브 기능만 사용함.
 */

/**
 * 미디어 파일에서 원본 채널(스테레오)을 유지한 채 오디오 트랙을 추출합니다.
 * 모노 다운믹스를 하지 않으므로 100% 원본의 공간감과 음질이 보존됩니다.
 * 
 * @param {File} file - 입력 미디어 파일 (주로 비디오)
 * @returns {Promise<Blob>} - 추출된 스테레오 WAV 오디오 Blob
 */
export async function extractOriginalAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (err) {
        throw new Error(`오디오 디코딩 실패: ${err.message}`);
    } finally {
        await audioCtx.close();
    }

    const numChannels = audioBuffer.numberOfChannels; // 예: 2 (스테레오)
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // 다중 채널 인터리빙 (Interleaving)
    // 채널을 병합(다운믹스)하지 않고 L, R, L, R 빈도로 교대로 끼워넣습니다.
    const interleaved = new Float32Array(length * numChannels);
    for (let ch = 0; ch < numChannels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            interleaved[i * numChannels + ch] = channelData[i];
        }
    }

    // 멀티채널 지원 WAV 포맷으로 인코딩
    const wavBuffer = encodeWAVMultichannel(interleaved, numChannels, sampleRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Float32Array 샘플 데이터를 멀티채널 PCM WAV 형식(ArrayBuffer)으로 변환합니다.
 */
function encodeWAVMultichannel(samples, numChannels, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');

    view.setUint32(16, 16, true);           // Chunk size (16 for PCM)
    view.setUint16(20, 1, true);            // AudioFormat (1=PCM)
    view.setUint16(22, numChannels, true);  // NumChannels
    view.setUint32(24, sampleRate, true);   // SampleRate
    view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
    view.setUint16(32, numChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true);           // BitsPerSample

    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Float32 -> Int16 변환 및 저장
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return buffer;
}

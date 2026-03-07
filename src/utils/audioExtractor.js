import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;
let isLoaded = false;
let isLoading = false;

/**
 * FFmpeg 싱글톤 인스턴스 반환 (최초 1회 초기화)
 */
async function getFFmpeg() {
    if (isLoaded && ffmpegInstance) return ffmpegInstance;
    if (isLoading) {
        // 이미 로딩 중이면 로드 완료까지 대기
        while (isLoading) await new Promise(r => setTimeout(r, 100));
        return ffmpegInstance;
    }

    isLoading = true;
    ffmpegInstance = new FFmpeg();

    try {
        // CDN에서 FFmpeg 코어 파일 로드 (브라우저 캐시 활용)
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpegInstance.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        isLoaded = true;
        console.log('[FFmpeg] Loaded successfully');
    } catch (err) {
        ffmpegInstance = null;
        isLoading = false;
        throw new Error(`FFmpeg 로드 실패: ${err.message}`);
    }

    isLoading = false;
    return ffmpegInstance;
}

/**
 * 비디오 파일에서 오디오 트랙을 MP3로 추출
 * @param {File} videoFile - 비디오 파일
 * @param {Function} onProgress - 진행률 콜백 (0~100)
 * @returns {Promise<Blob>} - MP3 오디오 Blob
 */
export async function extractAudioFromVideo(videoFile, onProgress = null) {
    const isVideo = videoFile.type && videoFile.type.startsWith('video/');
    if (!isVideo) {
        throw new Error('비디오 파일만 지원됩니다');
    }

    let ffmpeg;
    try {
        ffmpeg = await getFFmpeg();
    } catch (err) {
        throw new Error(`FFmpeg 초기화 실패: ${err.message}`);
    }

    // 진행률 콜백 연결
    if (onProgress) {
        ffmpeg.on('progress', ({ progress }) => {
            onProgress(Math.round(progress * 100));
        });
    }

    const inputName = 'input' + getExtension(videoFile.name, videoFile.type);
    const outputName = 'output.mp3';

    try {
        // 파일 가상 파일시스템에 업로드
        await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

        // 오디오 트랙 추출 (최고 품질 MP3, 비디오 트랙 제거)
        await ffmpeg.exec([
            '-i', inputName,
            '-vn',               // 비디오 트랙 제거
            '-acodec', 'libmp3lame',
            '-q:a', '0',         // 최고 품질 VBR
            '-ar', '44100',      // 44.1kHz 샘플레이트 유지
            outputName
        ]);

        // 결과 파일 읽기
        const data = await ffmpeg.readFile(outputName);
        const audioBlob = new Blob([data.buffer], { type: 'audio/mp3' });

        // 가상 파일시스템 정리
        await ffmpeg.deleteFile(inputName).catch(() => { });
        await ffmpeg.deleteFile(outputName).catch(() => { });

        console.log(`[FFmpeg] Extracted audio: ${(audioBlob.size / 1024 / 1024).toFixed(1)}MB from ${(videoFile.size / 1024 / 1024).toFixed(1)}MB video`);
        return audioBlob;

    } catch (err) {
        // 정리 시도
        await ffmpeg.deleteFile(inputName).catch(() => { });
        await ffmpeg.deleteFile(outputName).catch(() => { });
        throw new Error(`오디오 추출 실패: ${err.message}`);
    }
}

/**
 * 파일 확장자 추출 헬퍼
 */
function getExtension(filename, mimeType) {
    if (filename && filename.includes('.')) {
        return '.' + filename.split('.').pop();
    }
    const mimeMap = {
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov',
        'video/x-msvideo': '.avi',
        'video/x-matroska': '.mkv',
    };
    return mimeMap[mimeType] || '.mp4';
}

import { useState, useRef, useEffect, useCallback } from 'react';

export const useAudioPlayer = ({ activeFile }) => {
    const [activeSentenceIdx, setActiveSentenceIdx] = useState(-1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(parseFloat(localStorage.getItem('miniapp_playback_rate')) || 1.0);
    const [isGlobalLoopActive, setIsGlobalLoopActive] = useState(localStorage.getItem('miniapp_loop_active') === 'true');
    const [isPlaying, setIsPlaying] = useState(false);
    const [manualScrollNonce, setManualScrollNonce] = useState(0);

    const videoRef = useRef(null);
    const activeIdxRef = useRef(-1);
    const isGlobalLoopActiveRef = useRef(isGlobalLoopActive);
    const loopTargetIdxRef = useRef(null); // [Phase 4] 루프 고정 타겟 인덱스
    const lastActionTimeRef = useRef(0); // [4차 수정] 시간 기반 의도 보호 가드

    const triggerManualScroll = useCallback(() => setManualScrollNonce(Date.now()), []);

    useEffect(() => {
        isGlobalLoopActiveRef.current = isGlobalLoopActive;
    }, [isGlobalLoopActive]);

    const mediaUrl = activeFile?.url || null;
    const isAnalyzing = activeFile?.isAnalyzing || false;

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate, mediaUrl, isAnalyzing]);

    const handleRateChange = (rate) => {
        setPlaybackRate(rate);
        localStorage.setItem('miniapp_playback_rate', rate.toString());
    };

    const seekTo = useCallback((s) => {
        const v = videoRef.current;
        if (v) {
            triggerManualScroll();
            // [4차 수정] Time-Based Intent Guard: 1초간 브라우저의 모든 정지 신호 차단
            lastActionTimeRef.current = Date.now();
            setIsPlaying(true); // 즉각 1번(||) 고정

            const targetTime = Math.max(0, Math.min(s, v.duration || 999999));
            v.currentTime = targetTime;

            // 비동기 재생 명령
            v.play().catch(() => { });
        }
    }, [triggerManualScroll]);

    const togglePlay = useCallback(() => {
        if (videoRef.current) {
            lastActionTimeRef.current = Date.now(); // 수동 토글 시에도 시간 갱신

            if (videoRef.current.paused) {
                setIsPlaying(true);
                videoRef.current.play().catch(() => { });
            } else {
                setIsPlaying(false);
                videoRef.current.pause();
            }
        }
    }, []);

    const toggleLoop = useCallback(() => {
        triggerManualScroll();
        setIsGlobalLoopActive(prev => {
            const next = !prev;
            localStorage.setItem('miniapp_loop_active', next.toString());
            if (next) {
                // 루프가 켜질 때 현재 인덱스를 고정
                loopTargetIdxRef.current = activeIdxRef.current;
            }
            if (videoRef.current) {
                // [Phase 4] 한곡 반복 수정: 한문장 반복이 켜지면 네이티브 루프(한곡 반복)는 꺼야 함
                videoRef.current.loop = !next;
            }
            return next;
        });
    }, [triggerManualScroll]);

    const jumpToSentence = useCallback((index) => {
        if (activeFile?.data && index >= 0 && index < activeFile.data.length) {
            triggerManualScroll();
            // Global Loop 루프 타겟 업데이트
            loopTargetIdxRef.current = index;
            seekTo(Math.max(0, activeFile.data[index].seconds - 1.0));
        }
    }, [seekTo, activeFile, triggerManualScroll]);

    const handlePrev = useCallback((currentIndex) => {
        if (activeFile?.data?.length) {
            const prevIndex = (currentIndex - 1 + activeFile.data.length) % activeFile.data.length;
            jumpToSentence(prevIndex);
        }
    }, [jumpToSentence, activeFile]);

    const handleNext = useCallback((currentIndex) => {
        if (activeFile?.data?.length) {
            const nextIndex = (currentIndex + 1) % activeFile.data.length;
            jumpToSentence(nextIndex);
        }
    }, [jumpToSentence, activeFile]);

    // ABSOLUTE TRACKING ENGINE (Float Comparison)
    // INVINCIBLE TRACKING ENGINE (Mathematical Absolute Comparison)
    const findActiveIndex = useCallback((currentSeconds, data) => {
        if (!data || data.length === 0) return 0;

        // 1. Filter: Find all items that have started (Time <= T)
        const candidates = data
            .map((item, idx) => ({ ...item, idx }))
            .filter(item => item.startSeconds <= currentSeconds);

        // 2. Determine: The LATEST (largest startSeconds) started item is our active card
        if (candidates.length === 0) return 0;

        // Sort by startSeconds Descending -> Top item is the current active lyric
        const sorted = candidates.sort((a, b) => b.startSeconds - a.startSeconds);
        return sorted[0].idx;
    }, []);

    // High-Resolution Sync Engine (Absolute Tracking)
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !activeFile?.data) return;

        // [Phase 4] 한곡 반복 수정: 한문장 반복이 꺼져있을 때만 전체 반복(native loop) 활성화
        v.loop = !isGlobalLoopActive;

        const runSync = () => {
            if (!v) return;
            const now = v.currentTime;
            setCurrentTime(now);

            const data = activeFile.data;
            if (!data || data.length === 0) return;

            const actualIdx = findActiveIndex(now, data);

            // Loop Handling (Global Mode)
            if (isGlobalLoopActiveRef.current) {
                // [Phase 4] 루프 락(Loop Lock): 지정된 loopTargetIdxRef를 기반으로 반복 처리
                let targetIdx = loopTargetIdxRef.current;

                // 만약 타겟이 없으면 현재 실시간 인덱스로 초기화
                if (targetIdx === null) {
                    targetIdx = actualIdx;
                    loopTargetIdxRef.current = actualIdx;
                }

                if (data[targetIdx]) {
                    const item = data[targetIdx];
                    const start = Math.max(0, item.seconds - 1.0);
                    const nextItem = data[targetIdx + 1];
                    // [Phase 4] 조기 종료 버그 수정: 5초 제한을 제거하고 실제 다음 문장 시작 전(+1초 버퍼)까지 재생
                    const end = nextItem
                        ? nextItem.seconds + 1.0
                        : (v.duration ? v.duration + 1.0 : 999999);

                    // [Phase 4] 수동 시크(Seek) 대응: 사용자가 루프 범위 밖으로 강제 이동했다면 루프 타겟 재설정
                    if (v.currentTime < start - 2.0 || v.currentTime > end + 2.0) {
                        loopTargetIdxRef.current = actualIdx;
                        return;
                    }

                    // 1. 루프 범위 체크 및 되돌리기
                    if (v.currentTime >= end - 0.1 || v.ended) {
                        // [4차 수정] 루프 재시작 시에도 1초간 철벽 가드
                        lastActionTimeRef.current = Date.now();
                        setIsPlaying(true);

                        v.currentTime = start;
                        v.play().catch(() => { });
                        return;
                    }

                    // 2. 루프 중 UI 하이라이트 강제 고정 (버퍼 구간에서도 해당 문장이 활성 상태로 보이게 함)
                    if (activeIdxRef.current !== targetIdx) {
                        activeIdxRef.current = targetIdx;
                        setActiveSentenceIdx(targetIdx);
                    }
                }
            } else {
                // 루프가 아닐 때만 정상 실시간 인덱스 업데이트
                if (actualIdx !== activeIdxRef.current) {
                    activeIdxRef.current = actualIdx;
                    setActiveSentenceIdx(actualIdx);
                    // 루프가 꺼져있을 때도 타겟 인덱스는 현재 위치를 따라가게 함
                    loopTargetIdxRef.current = actualIdx;
                }
            }
        };

        let pulseId = null;
        const managePulse = () => {
            if (!v.paused && !pulseId) {
                pulseId = setInterval(runSync, 100);
            } else if (v.paused && pulseId) {
                clearInterval(pulseId);
                pulseId = null;
            }
        };
        const handlePlay = () => { runSync(); managePulse(); };
        const handlePause = () => { managePulse(); };
        const handleLoadedMetadata = () => { setDuration(v.duration); };

        // 1. Event Listeners (Optimized)
        v.addEventListener('timeupdate', runSync);
        v.addEventListener('seeked', runSync);
        v.addEventListener('playing', handlePlay);
        v.addEventListener('pause', handlePause);
        v.addEventListener('ended', handlePause);
        v.addEventListener('loadedmetadata', handleLoadedMetadata);

        // Init pulse based on current state
        managePulse();
        // Fallback for already loaded metadata
        if (v.readyState >= 1) setDuration(v.duration);

        return () => {
            v.removeEventListener('timeupdate', runSync);
            v.removeEventListener('seeked', runSync);
            v.removeEventListener('playing', handlePlay);
            v.removeEventListener('pause', handlePause);
            v.removeEventListener('ended', handlePause);
            v.removeEventListener('loadedmetadata', handleLoadedMetadata);
            if (pulseId) clearInterval(pulseId);
        };
    }, [activeFile, findActiveIndex, isGlobalLoopActive]);

    const resetPlayerState = useCallback(() => {
        setActiveSentenceIdx(-1);
        activeIdxRef.current = -1; // CRITICAL: Reset the ref so the engine detects the first update
        setCurrentTime(0);
        setIsPlaying(false);
        // isGlobalLoopActive stays as is (Global Setting)
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    }, []);

    return {
        videoRef,
        activeSentenceIdx,
        currentTime,
        duration,
        playbackRate,
        isGlobalLoopActive,
        isPlaying,
        manualScrollNonce,
        activeIdxRef,
        lastActionTimeRef,
        triggerManualScroll,
        handleRateChange,
        seekTo,
        togglePlay,
        toggleLoop,
        jumpToSentence,
        handlePrev,
        handleNext,
        resetPlayerState
    };
};

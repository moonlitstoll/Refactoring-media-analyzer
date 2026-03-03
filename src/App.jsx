import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, memo } from 'react';
import {
  Play, Pause, Rewind, FastForward,
  Eye, EyeOff, Languages, List, Search, Upload,
  Gauge, Repeat, Volume2, VolumeX, Info, Settings,
  X, Check, AlertCircle, BookOpen, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, FileAudio, FileVideo, Plus, Trash2,
  SkipBack, SkipForward, Clock, History, MoreVertical, XCircle, Home
} from 'lucide-react';
import { extractTranscript, analyzeSingleSentence, analyzeBatchSentences } from './services/gemini';
import { mediaStore } from './utils/MediaStore';

// Helper: Get Media Duration
const getMediaDuration = (file) => {
  return new Promise((resolve, reject) => {
    const media = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      // Delay revocation to ensure no active reads fail in the background logic
      setTimeout(() => window.URL.revokeObjectURL(media.src), 5000);
      resolve(media.duration);
    };
    media.onerror = () => {
      window.URL.revokeObjectURL(media.src);
      reject(new Error("Failed to load media metadata. The file may be corrupted or unsupported."));
    };
    media.src = URL.createObjectURL(file);
  });
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <h3 className="font-bold mb-2">Something went wrong.</h3>
          <p className="text-sm font-mono whitespace-pre-wrap">{this.state.error?.toString()}</p>
          <button onClick={() => this.setState({ hasError: false })} className="mt-3 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-xs font-bold transition-colors">
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}


const TranscriptItem = memo(({
  item, idx, isActive, isGlobalLooping, manualScrollNonce,
  seekTo, jumpToSentence, toggleLoop,
  isLooping, showAnalysis, toggleGlobalAnalysis,
  showTranslations
}) => {
  const itemRef = useRef(null);

  // 1. Focus Lock: Conditional Anchoring
  // Rules:
  // A. If user manually triggered a jump (manualScrollNonce changed) -> ALWAYS scroll
  // B. If auto-advancing in normal mode (Looping OFF) -> scroll
  // C. If Looping -> IGNORE all automatic scroll triggers.
  const prevActiveRef = useRef(isActive);
  const prevNonceRef = useRef(manualScrollNonce);

  useEffect(() => {
    const becameActive = isActive && !prevActiveRef.current;
    const isManualJump = manualScrollNonce !== prevNonceRef.current;

    // Update refs for next comparison
    prevActiveRef.current = isActive;
    prevNonceRef.current = manualScrollNonce;

    // Normal mode auto-advance scroll
    const isAutoAdvancing = isActive && !isGlobalLooping;

    // Trigger scroll if:
    // 1. It just became active (initial click, manual jump, or auto-advance)
    // 2. A manual jump occurred (to ensure snap even if already active)
    const shouldScroll = isActive && (becameActive || isManualJump || isAutoAdvancing);

    if (shouldScroll && itemRef.current) {
      itemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'start'
      });
    }
  }, [isActive, manualScrollNonce, isGlobalLooping]);

  // 2. Resize Stabilization: Re-align to top when contents expand/collapse
  // This ensures that toggling Analysis doesn't push the lyric out of view.
  useLayoutEffect(() => {
    if (isActive && itemRef.current) {
      // Use instant scroll to "lock" the position during resize
      itemRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [showAnalysis, showTranslations]);

  return (
    <div
      ref={itemRef}
      className={`
        group relative transition-all duration-300 ease-out mb-2 rounded-xl border border-l-[4px] p-2.5 sm:px-4 sm:py-5
        ${isActive
          ? 'bg-transparent border-l-purple-700 border-t-slate-100 border-r-slate-100 border-b-slate-100 shadow-md z-10'
          : 'bg-white border-slate-100 opacity-90'}
      `}
    >

      <div>
        {/* Header: Timestamp & Looping Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <button
            onClick={() => seekTo(item.seconds)}
            className={`
              flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wide transition-all
              ${isActive ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}
            `}
          >
            <Play size={8} fill="currentColor" /> {item.timestamp}
          </button>

          {isLooping && (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-tight animate-pulse border z-10 ${isActive ? 'bg-purple-50/50 text-purple-600 border-purple-100' : 'bg-amber-50/50 text-amber-600 border-amber-100'}`}>
              <Repeat size={8} className="stroke-[3]" /> LOOPING
            </div>
          )}
        </div>
        <div
          onClick={() => jumpToSentence(idx)}
          className={`
            text-xl sm:text-2xl md:text-3xl leading-snug cursor-pointer transition-all duration-300 mb-1 px-1 font-bold
            ${isActive ? 'text-black' : 'text-slate-900'}
          `}
        >
          {item.text}
        </div>

        {/* Translation */}
        {/* Translation moved to Analysis Section */}

        {/* Toggle Global Explanation Button Removed */}

        {/* Detailed Analysis Section */}
        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${showAnalysis ? 'max-h-[2000px] opacity-100 mt-1 pt-1 border-t border-slate-100' : 'max-h-0 opacity-0 mt-0 pt-0'}`}>

          {/* Stage 2 Loading State */}
          {!item.isAnalyzed && (
            <div className="py-4 px-2 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-100 rounded-md w-3/4" />
              <div className="space-y-2">
                <div className="h-3 bg-slate-50 rounded-md w-full" />
                <div className="h-3 bg-slate-50 rounded-md w-5/6" />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                <Clock size={12} className="animate-spin" /> Analyzing Sentence Details...
              </div>
            </div>
          )}

          {/* Translation (Always show if showTranslations is true or analysis is expanded) */}
          {(showTranslations || showAnalysis) && item.translation && (
            <div className={`rounded-xl px-3 py-2 border transition-colors duration-300 mb-2 ${showAnalysis ? 'bg-indigo-50/80 border-indigo-100' : 'bg-slate-50/50 border-slate-100'}`}>
              <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-[11px] uppercase tracking-wider mb-0.5">
                <Languages size={12} /> Translation
              </div>
              <p className="text-slate-700 text-base leading-snug whitespace-pre-line font-medium">
                {item.translation?.replace(/\\n/g, '\n')}
              </p>
            </div>
          )}

          {/* Patterns Section Removed */}

          {/* Light JSON Analysis Content */}
          {item.analysis && (
            <div>
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-[11px] uppercase tracking-wider mb-1 px-1">
                <BookOpen size={12} /> Detailed Analysis
              </div>
              <div className="p-3 bg-white border border-emerald-100 rounded-xl">
                <p className="text-slate-800 text-[15px] sm:text-[16px] leading-[1.6] whitespace-pre-line font-medium">
                  {typeof item.analysis === 'string'
                    ? item.analysis.replace(/\\n/g, '\n').split(/(\*\*.*?\*\*)/).map((part, i) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <strong key={i} className="text-emerald-800 font-extrabold">{part.slice(2, -2)}</strong>
                        : part
                    )
                    : null
                  }
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
});

const App = () => {
  const [apiKey, setApiKey] = useState(localStorage.getItem('miniapp_gemini_key') || '');
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('miniapp_gemini_model') || 'gemini-2.5-flash');
  const BUFFER_SECONDS = 1.0; // Audio Buffer (1.0s)

  // Multi-file state
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);

  // Player state
  const [activeSentenceIdx, setActiveSentenceIdx] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(parseFloat(localStorage.getItem('miniapp_playback_rate')) || 1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [isGlobalLoopActive, setIsGlobalLoopActive] = useState(localStorage.getItem('miniapp_loop_active') === 'true');
  const [isPlaying, setIsPlaying] = useState(false);



  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showTranslations, setShowTranslations] = useState(true); // New global state
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showCacheHistory, setShowCacheHistory] = useState(false);
  const [showFileList, setShowFileList] = useState(false);
  const [cacheKeys, setCacheKeys] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSwitchingFile, setIsSwitchingFile] = useState(false);
  const [manualScrollNonce, setManualScrollNonce] = useState(0);

  const triggerManualScroll = useCallback(() => setManualScrollNonce(Date.now()), []);
  const toggleGlobalAnalysis = useCallback(() => setShowAnalysis(prev => !prev), []);


  const videoRef = useRef(null);
  const activeIdxRef = useRef(-1);
  const stage2AbortRef = useRef(null);
  const isGlobalLoopActiveRef = useRef(isGlobalLoopActive);
  const loopTargetIdxRef = useRef(null); // [Phase 4] 루프 고정 타겟 인덱스
  const lastActionTimeRef = useRef(0); // [4차 수정] 시간 기반 의도 보호 가드

  // Derived active file
  const activeFile = files.find(f => f.id === activeFileId);
  const transcriptData = activeFile?.data || [];
  const mediaUrl = activeFile?.url || null;
  const isAnalyzing = activeFile?.isAnalyzing || false;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, mediaUrl, isAnalyzing, activeFileId]);

  const handleRateChange = (rate) => {
    setPlaybackRate(rate);
    localStorage.setItem('miniapp_playback_rate', rate.toString());
  };




  // Robust Helper: Parse [HH:MM:SS.ms] to Total Seconds (Float)
  // Formula: (M * 60) + S + (ms / 1000)
  const parseTime = (timeStr) => {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return Math.max(0, timeStr);

    // 1. Range Handling: Take the first part of "01:02 - 01:05" or similar
    let raw = timeStr.toString().split(/[-~]/)[0];

    // 2. Strict Cleaning: Keep ONLY digits, colons (:), and dots (.)
    const clean = raw.replace(/[^\d:.]/g, '');
    if (!clean) return 0;

    // 3. Mathematical Absolute Normalization
    const parts = clean.split(':');
    try {
      if (parts.length >= 2) {
        // Handle [SS.ms, MM, HH] in reverse to be agnostic to depth
        const rev = parts.reverse();
        const s = parseFloat(rev[0]) || 0;
        const m = parseFloat(rev[1]) || 0;
        const h = parseFloat(rev[2]) || 0;
        // Formula: H*3600 + M*60 + S (All as high-precision floats)
        return (h * 3600) + (m * 60) + s;
      } else {
        // Raw seconds (e.g., "79.5", "14")
        return parseFloat(clean) || 0;
      }
    } catch (e) {
      console.error("Critical: Universal Sync Engine Parse Error:", timeStr, e);
      return 0;
    }
  };

  // Helper: Sanitize & Sort Data
  // duration: 영상 총 길이(초). 0이면 보정 스킵.
  const sanitizeData = (data, duration = 0) => {
    if (!Array.isArray(data)) {
      console.error("Data is not an array:", data);
      return [];
    }
    let result = data
      .filter(item => item && typeof item === 'object') // Filter null/non-objects
      .map(item => {
        // Map shortened keys back to original keys if present
        const timestamp = item.s || item.timestamp;
        const secondsValue = item.v !== undefined ? item.v : item.seconds;
        const endValue = item.e !== undefined ? item.e : item.endSeconds;
        let text = item.o || item.text || "(No text)";
        const translation = item.t || item.translation || "";

        // 텍스트 필터링 로직 완전 제거 (원본 유지)

        // Handle patterns
        let patterns = item.p || item.patterns || [];
        if (Array.isArray(patterns)) {
          patterns = patterns.map(p => ({
            term: p.t || p.term || "",
            definition: p.d || p.definition || ""
          }));
        }

        // Handle words
        let words = item.w || item.words || [];
        if (Array.isArray(words)) {
          words = words.map(w => ({
            word: w.w || w.word || "",
            meaning: w.m || w.meaning || "",
            func: w.f || w.func || ""
          }));
        }

        // MASTER SECOND ENGINE (Float Precision)
        // PRIORITIZE TIMESTAMP STRING to match user view exactly
        let startSeconds = 0;
        if (typeof timestamp === 'string' && timestamp.length > 0) {
          startSeconds = parseTime(timestamp);
        } else if (typeof secondsValue === 'number') {
          startSeconds = secondsValue;
        }
        startSeconds = isNaN(startSeconds) ? 0 : startSeconds;

        const seconds = startSeconds;
        let endSeconds = seconds + 3.0; // Default gap-fill: 3s
        if (typeof endValue === 'number') {
          endSeconds = endValue;
        }

        return {
          s: timestamp,
          timestamp,
          seconds,
          startSeconds, // Explicit float for sync
          endSeconds,
          o: text,
          text,
          translation,
          analysis: item.a || item.analysis || "",
          isAnalyzed: item.isAnalyzed || !!(item.a || item.analysis)
        };
      })
      .filter(item => item.text && item.text.trim() !== "")
      .sort((a, b) => a.startSeconds - b.startSeconds);

    // [자동 보정] AI가 HH:MM:SS 형태로 타임스탬프를 출력하여
    // 모든 startSeconds가 영상 길이를 초과하는 경우, 3파트 타임스탬프를 재해석
    if (duration > 0 && result.length > 0) {
      const nonZeroItems = result.filter(r => r.startSeconds > 0);
      const allExceed = nonZeroItems.length > 0 && nonZeroItems.every(r => r.startSeconds > duration);

      if (allExceed) {
        console.warn(`[SanitizeData] 모든 타임스탬프(${nonZeroItems[0].startSeconds}s~)가 영상 길이(${duration}s)를 초과. 3파트 재해석 시도...`);
        result = result.map(item => {
          const ts = String(item.timestamp || '');
          const parts = ts.replace(/[^\d:.]/g, '').split(':');
          if (parts.length === 3) {
            // "00:51:50.00" → 실제 의미: 0분 51초 50센티초 = 51.50초
            // parts[0]=HH(무시할 분), parts[1]=실제 초, parts[2]=소수점 이하
            const mm = parseFloat(parts[0]) || 0;
            const ss = parseFloat(parts[1]) || 0;
            const cc = parseFloat(parts[2]) || 0;
            const corrected = (mm * 60) + ss + (cc / 100);

            // 보정된 타임스탬프 문자열도 업데이트
            const correctedMin = Math.floor(corrected / 60);
            const correctedSec = (corrected % 60).toFixed(2).padStart(5, '0');
            const correctedTimestamp = `${String(correctedMin).padStart(2, '0')}:${correctedSec}`;

            return {
              ...item,
              seconds: corrected,
              startSeconds: corrected,
              endSeconds: corrected + 3.0,
              timestamp: correctedTimestamp,
              s: correctedTimestamp
            };
          }
          return item;
        }).sort((a, b) => a.startSeconds - b.startSeconds);
        console.log(`[SanitizeData] 보정 완료. 첫 번째 항목: ${result[0]?.startSeconds}s, 마지막: ${result[result.length - 1]?.startSeconds}s`);
      }
    }

    return result;
  };

  // Sync ref
  useEffect(() => { isGlobalLoopActiveRef.current = isGlobalLoopActive; }, [isGlobalLoopActive]);

  const saveConfiguration = (key, model) => {
    localStorage.setItem('miniapp_gemini_key', key);
    localStorage.setItem('miniapp_gemini_model', model);
    setApiKey(key);
    setSelectedModel(model);
    setShowSettings(false);
  };

  useEffect(() => {
    if (showSettings || showCacheHistory) {
      setCacheKeys(Object.keys(localStorage).filter(k => k.startsWith('gemini_analysis_')));
    }
  }, [showSettings, showCacheHistory]);

  const deleteCache = async (key) => {
    if (confirm('Delete this cached transcript?')) {
      // 분석 중단 신호
      if (stage2AbortRef.current) stage2AbortRef.current.abort();
      const cachedStr = localStorage.getItem(key);
      if (cachedStr) {
        try {
          const parsed = JSON.parse(cachedStr);
          const metadata = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed.metadata : null;
          if (metadata && metadata.name && metadata.size) {
            await mediaStore.deleteFile(metadata.name, metadata.size);
          }
        } catch (e) {
          console.error("Failed to delete media file from store:", e);
        }
      }
      localStorage.removeItem(key);
      setCacheKeys(prev => prev.filter(k => k !== key));
    }
  };

  const clearAllCache = async () => {
    const count = cacheKeys.length;
    if (confirm(`Clear all ${count} cached analysis files?`)) {
      // 분석 중단 신호
      if (stage2AbortRef.current) stage2AbortRef.current.abort();
      cacheKeys.forEach(k => localStorage.removeItem(k));
      await mediaStore.clearAll();
      setCacheKeys([]);
      alert("All cache cleared!");
    }
  };

  const loadCache = async (key) => {
    // FORCE RESET
    resetPlayerState();
    setIsSwitchingFile(true);

    const cachedStr = localStorage.getItem(key);
    if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr);
        // Handle new format {data, metadata} vs legacy format [items...]
        const hasMetadata = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.data;
        const rawData = hasMetadata ? parsed.data : parsed;

        // [마이그레이션 방어] 데이터 캐시의 형태가 유효한 배열인지 검증
        if (!Array.isArray(rawData)) {
          throw new Error("Invalid cache format: Data is not an array. Please clear cache.");
        }

        const metadata = hasMetadata ? parsed.metadata : { name: key.replace('gemini_analysis_', '').replace(/_\d+$/, '') };

        // 미디어 파일 매칭 (duration 추출을 위해 먼저 수행)
        let matchingFile = null;
        if (hasMetadata && metadata.size) {
          matchingFile = files.find(f => f.file.name === metadata.name && f.file.size === metadata.size);
        } else {
          matchingFile = files.find(f => f.file.name === metadata.name);
        }

        let mediaBlob = null;
        let mediaUrl = matchingFile ? matchingFile.url : null;
        let fileForDuration = matchingFile ? matchingFile.file : null;

        if (!mediaUrl && metadata.name && metadata.size) {
          try {
            mediaBlob = await mediaStore.getFile(metadata.name, metadata.size);
            if (mediaBlob) {
              mediaUrl = URL.createObjectURL(mediaBlob);
              fileForDuration = mediaBlob;
            }
          } catch (e) {
            console.error("Failed to load media from store:", e);
          }
        }

        // 영상 길이 확보 후 sanitizeData 호출
        let cacheDuration = 0;
        if (fileForDuration) {
          try { cacheDuration = await getMediaDuration(fileForDuration); } catch (e) { }
        }
        const data = sanitizeData(rawData, cacheDuration);


        const id = 'cached-' + Date.now();
        const name = metadata.name;

        const newFileEntry = {
          id,
          file: matchingFile ? matchingFile.file : { name, type: metadata.type || 'video/unknown', size: metadata.size },
          data,
          url: mediaUrl,
          isAnalyzing: false,
          isFromCache: true
        };

        setFiles(prev => [...prev, newFileEntry]);
        setActiveFileId(id);
        setShowSettings(false);
        setShowCacheHistory(false);

        // [문제 3 수정] 미완성 분석 데이터가 있으면 Stage 2 자동 재시작
        const hasPending = data.some(d => !d.isAnalyzed);
        if (hasPending && apiKey && newFileEntry.file?.name) {
          console.log(`[Cache Load] ${data.filter(d => !d.isAnalyzed).length} pending items detected. Resuming Stage 2...`);
          runStage2(id, newFileEntry.file, data, apiKey, selectedModel);
        }
      } catch (e) {
        console.error("Failed to load cache:", e);
        alert("Failed to load cached data.");
        setIsSwitchingFile(false);
      }
    }
  };

  // Media Controls
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

  // Quick Sync Handler Removed


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

    // 1. Event Listeners (Optimized)
    v.addEventListener('timeupdate', runSync);
    v.addEventListener('seeked', runSync);
    v.addEventListener('playing', handlePlay);
    v.addEventListener('pause', handlePause);
    v.addEventListener('ended', handlePause);

    // Init pulse based on current state
    managePulse();

    return () => {
      v.removeEventListener('timeupdate', runSync);
      v.removeEventListener('seeked', runSync);
      v.removeEventListener('playing', handlePlay);
      v.removeEventListener('pause', handlePause);
      v.removeEventListener('ended', handlePause);
      if (pulseId) clearInterval(pulseId);
    };
  }, [activeFile, findActiveIndex, isGlobalLoopActive]);

  // Reset switching state when active file changes
  useEffect(() => {
    if (isSwitchingFile && activeFileId) {
      // Small timeout to ensure UI has painted the loading state at least once if needed, 
      // but strictly we just want to turn it off once the new active file is ready.
      // Since activeFile is derived from activeFileId, waiting for activeFileId change is correct.
      // However, we want to ensure the NEW file's isAnalyzing is true before we turn off isSwitchingFile?
      // Actually, the new file entry created in processFiles has isAnalyzing: true.
      // So once activeFileId updates to the new ID, activeFile.isAnalyzing will be true.
      // So we can safely turn off isSwitchingFile.
      setIsSwitchingFile(false);
    }
  }, [activeFileId]);

  // Derived current idx for UI (now using state directly)
  const currentSentenceIdx = activeSentenceIdx;


  // Rate effect handled above for better synchronization

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!mediaUrl || !activeFile?.data?.length) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const data = activeFile.data;
      const currentIdx = activeIdxRef.current !== null ? activeIdxRef.current : -1;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'Enter':
          e.preventDefault();
          toggleLoop();
          break;
        case 'KeyB':
          e.preventDefault();
          toggleGlobalAnalysis();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (data.length > 0) {
            const idx = activeIdxRef.current !== null ? activeIdxRef.current : 0;
            const prevIdx = Math.max(0, idx - 1);
            if (prevIdx !== idx) jumpToSentence(prevIdx);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (data.length > 0) {
            const idx = activeIdxRef.current !== null ? activeIdxRef.current : 0;
            const nextIdx = Math.min(data.length - 1, idx + 1);
            if (nextIdx !== idx) jumpToSentence(nextIdx);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            lastActionTimeRef.current = Date.now();
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            lastActionTimeRef.current = Date.now();
            videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 5);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaUrl, activeFile, togglePlay, toggleLoop, toggleGlobalAnalysis, jumpToSentence]);

  // --- STATE RESET LOGIC ---
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

  // File Handling
  const processFiles = async (fileList) => {
    setIsDragging(false);
    if (!fileList || fileList.length === 0) return;

    // Force Reset
    setIsSwitchingFile(true);
    resetPlayerState();

    console.log("[Upload] Processing files...", fileList);

    const newFiles = Array.from(fileList).map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      url: URL.createObjectURL(f),
      data: [],
      isAnalyzing: true,
      error: null
    }));

    // Add new files. If we want to replace, we could use setFiles(newFiles)
    // But usually multi-file implies appending. Let's append.
    setFiles(prev => [...prev, ...newFiles]);

    // Immediately set the first new file as active
    if (newFiles.length > 0) {
      // Clear old active file data reference implicitly by switch
      setActiveFileId(newFiles[0].id);
    }

    // Process each new file
    newFiles.forEach(async (fItem) => {
      try {
        if (!apiKey) throw new Error("Please set Gemini API Key in Settings.");

        // --- CACHE CHECK ---
        const cacheKey = `gemini_analysis_${fItem.file.name}_${fItem.file.size}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          console.log("Using cached analysis for", fItem.file.name);
          const parsed = JSON.parse(cached);
          const rawData = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed.data : parsed;
          // 캐시 로드 시에도 duration 기반 보정을 위해 영상 길이 확인
          let cacheDuration = 0;
          try { cacheDuration = await getMediaDuration(fItem.file); } catch (e) { /* 실패 시 보정 스킵 */ }
          const data = sanitizeData(rawData, cacheDuration);
          setFiles(prev => prev.map(p => p.id === fItem.id ? { ...p, data: data, isAnalyzing: false, isFromCache: true } : p));
        } else {
          // API Call
          // Update status to analyzing (redundant but safe)
          setFiles(prev => prev.map(p => p.id === fItem.id ? { ...p, isAnalyzing: true } : p));

          let rawData;
          let fileDuration = 0;
          try {
            // Get actual duration for segmented analysis
            fileDuration = await getMediaDuration(fItem.file);
            console.log(`[Stage 1] Real duration for ${fItem.file.name}: ${fileDuration}s`);

            // STEP 1: Fast Extraction (Stage 1) - Now with Sequential Chunks
            rawData = await extractTranscript(fItem.file, apiKey, selectedModel, fileDuration, (incrementalData) => {
              // Real-time UI update
              setFiles(prev => prev.map(p => p.id === fItem.id ? { ...p, data: incrementalData } : p));
            });
          } catch (apiError) {
            throw new Error(`API Error (Stage 1): ${apiError.message}`);
          }

          if (!rawData) throw new Error("Received empty data from Stage 1 API");

          const data = sanitizeData(rawData, fileDuration);

          if (data.length === 0) {
            throw new Error("Stage 1 extraction returned no valid text data.");
          }

          // Show the transcript immediately after Stage 1
          setFiles(prev => prev.map(p => p.id === fItem.id ? { ...p, data: data, isAnalyzing: false } : p));

          // [Phase 4] 히스토리 미표시 수정: 1단계 완료 즉시 중간 저장
          const cacheKey = `gemini_analysis_${fItem.file.name}_${fItem.file.size}`;
          try {
            const cacheData = {
              data: data,
              metadata: {
                name: fItem.file.name,
                size: fItem.file.size,
                type: fItem.file.type,
                lastModified: fItem.file.lastModified,
                savedAt: Date.now(),
                status: 'extracted' // 대사 추출됨 상태 표기
              }
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            // 히스토리 목록 강제 갱신 트리거
            setCacheKeys(Object.keys(localStorage).filter(k => k.startsWith('gemini_analysis_')));
          } catch (e) { }

          // STEP 2: Automatic Sequential Detail Analysis (Stage 2)
          runStage2(fItem.id, fItem.file, data, apiKey, selectedModel);

          // Save media to store after successful Stage 1
          try {
            await mediaStore.saveFile(fItem.file);
          } catch (storageError) {
            console.warn("Failed to save media file to store", storageError);
          }
        }
      } catch (err) {
        console.error("Analysis Error", err);
        setFiles(prev => prev.map(p => p.id === fItem.id ? { ...p, error: "Analysis failed: " + err.message, isAnalyzing: false } : p));
      }
    });
  };

  /**
   * STAGE 2: FULL BATCH ANALYSIS (All at once)
   * Process ALL pending sentences in a single API call to maximize speed.
   */
  const runStage2 = async (fileId, fileInfo, transcript, apiKey, modelId) => {
    console.log(`[Stage 2] Starting FULL BATCH Analysis for file ${fileId}...`);

    // 취소 컨트롤러 초기화
    if (stage2AbortRef.current) stage2AbortRef.current.abort();
    stage2AbortRef.current = new AbortController();
    const { signal } = stage2AbortRef.current;

    const updateGlobalState = (data) => {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, data: [...data] } : f));
    };

    const saveToCache = (fInfo, data, status) => {
      if (!fInfo || !fInfo.name) return;
      const cacheKey = `gemini_analysis_${fInfo.name}_${fInfo.size}`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          data,
          metadata: {
            name: fInfo.name,
            size: fInfo.size,
            lastModified: fInfo.lastModified,
            savedAt: Date.now(),
            status
          }
        }));
        setCacheKeys(Object.keys(localStorage).filter(k => k.startsWith('gemini_analysis_')));
      } catch (e) { }
    };

    const pendingIndices = transcript
      .map((item, idx) => ({ item, idx }))
      .filter(x => !x.item.isAnalyzed)
      .map(x => x.idx);

    if (pendingIndices.length === 0) return;

    // [20x2 Strategy] 20개씩 묶어 최대 2건 동시 처리
    const BATCH_SIZE = 20;
    const CONCURRENCY = 2;
    const batches = [];
    for (let i = 0; i < pendingIndices.length; i += BATCH_SIZE) {
      batches.push(pendingIndices.slice(i, i + BATCH_SIZE));
    }

    console.log(`[Stage 2] Split into ${batches.length} batches (Max 2 concurrent).`);

    let workingData = JSON.parse(JSON.stringify(transcript));

    // 배치 순차 처리 (병렬성 제어)
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      if (signal.aborted) break;

      const currentBatchGroup = batches.slice(i, i + CONCURRENCY);
      console.log(`[Stage 2] Running Batch Group ${Math.floor(i / CONCURRENCY) + 1}...`);

      const batchPromises = currentBatchGroup.map(async (batchIndices) => {
        const batchItems = batchIndices.map(idx => ({ index: idx, text: workingData[idx].text }));
        try {
          const results = await analyzeBatchSentences(batchItems, apiKey, modelId, signal);
          if (results && !signal.aborted) {
            results.forEach(res => {
              if (res && res.translation && !res.failed) {
                workingData[res.index] = {
                  ...workingData[res.index],
                  translation: res.translation,
                  analysis: res.analysis,
                  isAnalyzed: true
                };
              }
            });
            // 중간 결과 반영 및 저장
            updateGlobalState(workingData);
            saveToCache(fileInfo, workingData, i + (currentBatchGroup.length * BATCH_SIZE) >= pendingIndices.length ? 'completed' : 'analyzing');
          }
        } catch (e) {
          console.error(`[Stage 2] Batch failed:`, e);
        }
      });

      await Promise.all(batchPromises);
    }
    console.log(`[Stage 2] Full Batch processing finished.`);
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => {
    if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setIsDragging(false);
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    processFiles(e.dataTransfer.files);
  };



  const removeFile = (id, e) => {
    e.stopPropagation();
    // 분석 중단 신호
    if (activeFileId === id && stage2AbortRef.current) {
      stage2AbortRef.current.abort();
    }
    setFiles(prev => {
      // [메모리 누수 방지] 파일 제거 시 ObjectURL 해제
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove && fileToRemove.url) URL.revokeObjectURL(fileToRemove.url);

      const newFiles = prev.filter(f => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(newFiles.length > 0 ? newFiles[0].id : null);
      }
      return newFiles;
    });
  };

  const removeAllFiles = () => {
    if (confirm("Remove all active files?")) {
      // 분석 중단 신호
      if (stage2AbortRef.current) stage2AbortRef.current.abort();
      // [메모리 누수 방지] 모든 활성 파일의 URL 일괄 해제
      files.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); });
      setFiles([]);
      setActiveFileId(null);
      setShowFileList(false);
    }
  };

  // Empty State
  if (files.length === 0) {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative"
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-sm flex items-center justify-center p-10 border-4 border-indigo-500 border-dashed m-4 rounded-3xl">
            <h2 className="text-4xl font-bold text-indigo-600 animate-bounce">Drop Files Here!</h2>
          </div>
        )}

        <button onClick={() => setShowSettings(true)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
          <Settings size={24} />
        </button>

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl animate-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">Settings</h3>
                <button onClick={() => setShowSettings(false)}><X size={20} className="text-slate-400" /></button>
              </div>
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">Google Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API Key"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={() => saveConfiguration(apiKey, selectedModel)} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl">Save Key</button>

                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 text-center">
                    Timeline uses strict 0.1s snap. Playback adds 0.8s buffer for context.
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800 mb-2 text-sm">Cached Transcripts</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto mb-3 pr-1 bg-slate-50/50 rounded-lg p-1">
                    {cacheKeys.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2">No cached files found.</p>
                    ) : (
                      cacheKeys.map(key => {
                        const name = key.replace('gemini_analysis_', '').replace(/_\d+$/, '');
                        return (
                          <div
                            key={key}
                            onClick={() => loadCache(key)}
                            className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-xl shadow-sm hover:border-indigo-300 hover:bg-slate-50 transition-all cursor-pointer group/item"
                          >
                            <span className="text-sm font-medium text-slate-700 truncate flex-1 mr-4" title={key}>{name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteCache(key); }}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {cacheKeys.length > 0 && (
                    <button onClick={clearAllCache} className="w-full py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-colors">
                      <Trash2 size={14} /> Clear All Cache
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}



        <div className="max-w-4xl w-full text-center space-y-10 animate-in fade-in zoom-in duration-500">
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-2xl ring-1 ring-indigo-100 mb-2">
              <Volume2 size={28} className="text-indigo-600" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Media<span className="text-indigo-600">Smart</span> Analyzer
            </h1>
          </div>
          <div className={`
                 max-w-3xl mx-auto group relative flex items-center gap-6 p-10 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer
                 border-slate-200 hover:border-indigo-300 hover:bg-white bg-white/60
              `}>
            <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={(e) => processFiles(e.target.files)} accept="audio/*,video/*" />
            <div className="w-full flex flex-col items-center gap-4">
              <div className="p-4 bg-indigo-100 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                <Upload size={32} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-xl">Drag & Drop Multiple Files</h3>
                <p className="text-slate-500 mt-2">or click to browse</p>
              </div>
            </div>
          </div>
        </div>
      </div >
    );
  }

  // View: Main Workspace

  const headerElement = (
    <header className="flex-none bg-white border-b border-slate-200 flex items-center justify-between px-4 py-3 z-20 shadow-sm relative">
      <div className="flex-1 min-w-0">

        {/* Center: File List Popup Trigger -> Now Unified Manager Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowCacheHistory(true)}
            className="w-full text-center px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors group"
          >
            {activeFile ? (
              <div className="flex items-center justify-center gap-2 text-slate-900">
                {activeFile.file.type.startsWith('video') ? <FileVideo size={16} className="text-indigo-600 shrink-0" /> : <FileAudio size={16} className="text-indigo-600 shrink-0" />}
                <span className="text-lg font-bold truncate group-hover:text-indigo-700 transition-colors">{activeFile.file.name}</span>
              </div>
            ) : (
              <span className="text-lg font-bold text-slate-400">Select File...</span>
            )}
          </button>

          {/* File List Popup */}
          {showFileList && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between px-2 py-1 mb-2 border-b border-slate-50">
                <span className="text-xs font-bold text-slate-500 uppercase">Active Files</span>
                <label className="cursor-pointer text-indigo-600 hover:text-indigo-700 p-1 rounded hover:bg-indigo-50" title="Add File">
                  <Plus size={16} />
                  <input type="file" multiple className="hidden" onChange={(e) => { processFiles(e.target.files); setShowFileList(false); }} accept="audio/*,video/*" />
                </label>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {files.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 text-sm">No files added</div>
                ) : (
                  files.map(f => (
                    <div
                      key={f.id}
                      onClick={() => { setActiveFileId(f.id); setShowFileList(false); }}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${f.id === activeFileId ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                      {f.file.type.startsWith('video') ? <FileVideo size={14} /> : <FileAudio size={14} />}
                      <span className="text-sm font-medium truncate flex-1">{f.file.name}</span>
                      <button onClick={(e) => removeFile(f.id, e)} className="p-1 text-slate-300 hover:text-red-500 rounded"><X size={14} /></button>
                    </div>
                  ))
                )}
              </div>
              {files.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-50">
                  <button onClick={removeAllFiles} className="w-full py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1">
                    <Trash2 size={12} /> Clear All Files
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="flex flex-col h-screen bg-[#F8FAFC] text-slate-800 overflow-hidden font-sans animate-in fade-in duration-700 relative"
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-sm flex items-center justify-center p-10 border-4 border-indigo-500 border-dashed m-4 rounded-3xl pointer-events-none">
          <h2 className="text-4xl font-bold text-indigo-600 animate-bounce">Drop to Add Files</h2>
        </div>
      )}

      {/* Header - Now Relative (Natural Flex Flow) */}
      <header className="relative z-50 bg-white/80 border-b border-slate-100 flex-none h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6">
        {/* Left: Home Button (Back to Upload) */}
        <button
          onClick={() => {
            setFiles([]);
            setActiveFileId(null);
            resetPlayerState();
          }}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
          title="Go to Home"
        >
          <Home size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="relative">
            <button
              onClick={() => setShowCacheHistory(true)}
              className="w-full text-center px-4 py-1.5 hover:bg-slate-50 rounded-xl transition-colors group"
            >
              {activeFile ? (
                <div className="flex items-center justify-center gap-2 text-slate-900">
                  {/* Icon based on file type */}
                  {activeFile.file.type.startsWith('video') ? (
                    <FileVideo size={16} className={`shrink-0 ${isAnalyzing || isSwitchingFile ? 'text-slate-400 animate-pulse' : 'text-indigo-600'}`} />
                  ) : (
                    <FileAudio size={16} className={`shrink-0 ${isAnalyzing || isSwitchingFile ? 'text-slate-400 animate-pulse' : 'text-indigo-600'}`} />
                  )}

                  <span className={`text-base font-bold truncate group-hover:text-indigo-700 transition-colors ${isAnalyzing || isSwitchingFile ? 'text-slate-500 italic' : ''}`}>
                    {isAnalyzing
                      ? `Extracting Transcript...`
                      : (activeFile?.data && activeFile.data.some(d => !d.isAnalyzed)
                        ? `Analyzing Details (${activeFile.data.filter(d => d.isAnalyzed).length}/${activeFile.data.length})`
                        : activeFile?.file?.name || "Ready")
                    }
                  </span>
                </div>
              ) : (
                <span className="text-base font-bold text-slate-400">Select File...</span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Settings (Optional shortcut) */}
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {/* Active File Content */}
        {activeFile ? (
          <div className="flex flex-col h-full">
            <div className="flex-1 w-full overflow-y-auto bg-[#F8FAFC]" onClick={() => { setShowSpeedMenu(false); setShowFileList(false); }}>

              <div className="max-w-6xl mx-auto px-2 md:px-6 pb-32">
                {isAnalyzing || isSwitchingFile ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-6">
                    <div className="relative w-20 h-20">
                      <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-slate-900">Analyzing {activeFile.file.name}...</h3>
                      <p className="text-slate-500">
                        {activeFile.data && activeFile.data.length > 0
                          ? `Applying 8 Principles & Deep Scan (${activeFile.data.filter(d => d.isAnalyzed).length}/${activeFile.data.length})`
                          : "Extracting timeline using Gemini 2.5..."
                        }
                      </p>
                    </div>
                  </div>
                ) : activeFile.error ? (
                  <div className="max-w-xl mx-auto p-6 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-center">
                    <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
                    <h3 className="font-bold text-lg mb-1">Analysis Failed</h3>
                    <p>{activeFile.error}</p>
                  </div>
                ) : transcriptData.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <p>Analysis complete but no text found.</p>
                  </div>
                ) : (
                  // KEY-SWITCHING IMPLEMENTATION
                  // key={activeFileId} forces a full remount of this container when file changes
                  <div key={activeFileId} className="space-y-2 min-h-[200px] relative">
                    <ErrorBoundary>
                      {transcriptData.map((item, idx) => {
                        const isActive = idx === currentSentenceIdx;
                        // COMPOSITE KEY: Prevents React from skipping repeated lyrics by using FileID + Index + Time
                        const compositeKey = `${activeFileId}-${idx}-${item.seconds}`;
                        return (
                          <TranscriptItem
                            key={compositeKey}
                            item={item}
                            idx={idx}
                            isActive={isActive}
                            // [PERFORMANCE] Only pass nonce to active item to prevent mass re-renders
                            manualScrollNonce={isActive ? manualScrollNonce : 0}
                            seekTo={seekTo}
                            jumpToSentence={jumpToSentence}
                            toggleLoop={toggleLoop}
                            isLooping={isActive && isGlobalLoopActive}
                            isGlobalLooping={isGlobalLoopActive}
                            showAnalysis={showAnalysis}
                            showTranslations={showTranslations}
                            toggleGlobalAnalysis={toggleGlobalAnalysis}
                          />
                        );
                      })}
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Bottom Player Controls (Sticky Bottom) */}
            <div className="flex-none bg-white/95 backdrop-blur-md border-t border-slate-200 z-50 shadow-lg pb-safe">
              <div className="max-w-5xl mx-auto flex flex-row items-stretch h-[85px] sm:h-[100px]">

                {/* Left: Video Thumbnail or Recovery UI */}
                <div className="relative bg-black w-[110px] sm:w-[140px] shrink-0 overflow-hidden group border-r border-slate-100 flex items-center justify-center">
                  {mediaUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={mediaUrl}
                        className="w-full h-full object-contain"
                        onClick={togglePlay}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => {
                          // [4차 수정] 1초 이내에 발생하는 '정지' 리포트는 브라우저 내부 소음으로 간주하고 무시
                          const timeSinceAction = Date.now() - lastActionTimeRef.current;
                          if (timeSinceAction > 1000) {
                            setIsPlaying(false);
                          }
                        }}
                        onEnded={() => setIsPlaying(false)}
                        onWaiting={() => {
                          // 버퍼링 시에도 1초 가드 적용
                          const timeSinceAction = Date.now() - lastActionTimeRef.current;
                          if (timeSinceAction > 1000) {
                            setIsPlaying(false);
                          }
                        }}
                        playsInline
                        loop
                      />
                      {!isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                          <Play size={24} fill="white" className="text-white ml-0.5" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-2 text-center space-y-2">
                      <AlertCircle size={24} className="text-red-400" />
                      <div className="text-[10px] font-bold text-slate-300 leading-tight">
                        원본 파일을<br />찾을 수 없습니다
                      </div>
                      <label className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded cursor-pointer transition-colors">
                        연결하기
                        <input type="file" className="hidden" onChange={(e) => processFiles(e.target.files)} accept="audio/*,video/*" />
                      </label>
                    </div>
                  )}
                </div>

                {/* Right: Controls Column */}
                <div className="flex-1 flex flex-col justify-center min-w-0">

                  {/* Row 1: Progress Bar */}
                  <div className="w-full px-3 pt-2 pb-1 flex items-center gap-2 text-[10px] sm:text-xs font-mono font-bold text-slate-500">
                    <span className="w-9 shrink-0 text-indigo-600 text-right">
                      {new Date(Math.max(0, currentTime) * 1000).toISOString().substr(14, 5)}
                    </span>

                    <div
                      className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden cursor-pointer group relative"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        seekTo(((e.clientX - rect.left) / rect.width) * videoRef.current.duration);
                      }}
                    >
                      <div className="absolute inset-0 w-full h-full hover:bg-slate-200/40 transition-colors" />
                      <div
                        className="h-full bg-indigo-500 rounded-full relative group-hover:bg-indigo-600 transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                        style={{ width: `${videoRef.current?.duration ? (currentTime / videoRef.current.duration) * 100 : 0}%` }}
                      />
                    </div>

                    <span className="w-9 shrink-0 text-left">{videoRef.current?.duration ? new Date(videoRef.current.duration * 1000).toISOString().substr(14, 5) : "00:00"}</span>
                  </div>

                  {/* Row 2: Control Buttons */}
                  <div className="flex items-center justify-between px-3 pl-1 py-1 gap-1">

                    {/* Speed & Analysis */}
                    <div className="flex items-center gap-1">
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                          className={`
                            flex items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all min-w-[40px] border
                            ${showSpeedMenu ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}
                          `}
                        >
                          {playbackRate.toFixed(1)}x
                        </button>
                        {showSpeedMenu && (
                          <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-[60] w-48">
                            <div className="grid grid-cols-4 gap-1">
                              {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0].map(rate => (
                                <button
                                  key={rate}
                                  onClick={(e) => { e.stopPropagation(); handleRateChange(rate); setShowSpeedMenu(false); }}
                                  className={`py-1.5 rounded text-[10px] font-bold ${Math.abs(playbackRate - rate) < 0.01 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {rate.toFixed(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setShowAnalysis(!showAnalysis)}
                        className={`p-1.5 rounded-lg border transition-all ${showAnalysis ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-white text-slate-400 border-slate-200'}`}
                      >
                        {showAnalysis ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </div>

                    {/* Main Controls */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => handlePrev(currentSentenceIdx)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                        <SkipBack size={18} className="fill-current" />
                      </button>

                      <button
                        onClick={togglePlay}
                        className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-200 transition-transform active:scale-95"
                      >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                      </button>

                      <button onClick={() => handleNext(currentSentenceIdx)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                        <SkipForward size={18} className="fill-current" />
                      </button>
                    </div>

                    {/* Right: Loop Only (Translations removed) */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={toggleLoop}
                        className={`p-1.5 rounded-lg border transition-all ${isGlobalLoopActive ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                        title="Toggle Global Sentence Loop"
                      >
                        <Repeat size={16} className={isGlobalLoopActive ? 'animate-pulse' : ''} />
                      </button>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <div className="flex-1 flex items-center justify-center p-10">
              <div className="max-w-md w-full p-8 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-center space-y-4">
                <div className="inline-flex p-4 bg-slate-50 rounded-2xl text-slate-400">
                  <FileAudio size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">No active file</h3>
                  <p className="text-slate-500 mt-1">Upload or select a file to start the analysis.</p>
                </div>

                {/* Quick Model Selection on Home */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Gemini Model</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'gemini-2.0-flash', name: 'Gemini 2 Flash' },
                      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => saveConfiguration(apiKey, m.id)}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${selectedModel === m.id
                          ? 'bg-white border-indigo-200 text-indigo-700 font-bold shadow-sm'
                          : 'bg-white/50 border-slate-100 text-slate-500 hover:bg-white'
                          }`}
                      >
                        <span className="text-sm">{m.name}</span>
                        {selectedModel === m.id && <Check size={14} className="text-indigo-600" />}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setShowCacheHistory(true)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-100"
                >
                  Select from List
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {
        showSettings && (
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 p-2 rounded-xl">
                    <Settings size={20} className="text-slate-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Settings</h2>
                    <p className="text-xs text-slate-500 font-medium">Configure Gemini AI & Preferences</p>
                  </div>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700">Gemini API Key</label>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                      Get Key <X size={10} className="rotate-45" />
                    </a>
                  </div>
                  <div className="relative group">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API key..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                    />
                    <Check className={`absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 transition-all ${apiKey.length > 20 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} size={18} />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Your key is stored locally in your browser and never sent to our servers.
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-50">
                  <label className="text-sm font-bold text-slate-700">Gemini Model Selection</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'gemini-2.0-flash', name: 'Gemini 2 Flash' },
                      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${selectedModel === m.id
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-sm'
                          : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        <span className="text-sm">{m.name}</span>
                        {selectedModel === m.id && <Check size={16} className="text-indigo-600" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Cache Results</h4>
                      <p className="text-xs text-slate-400">Save analysis for offline use</p>
                    </div>
                    <div className="w-10 h-6 bg-emerald-500 rounded-full relative p-1">
                      <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 flex gap-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-3 text-slate-600 font-bold hover:bg-white rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveConfiguration(apiKey, selectedModel)}
                  className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-200"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Unified File History Modal */}
      {
        showCacheHistory && (
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[95vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
              <div className="p-3 px-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearAllCache}
                    className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm font-bold"
                  >
                    <Trash2 size={16} /> Clear All History
                  </button>
                </div>
                <button onClick={() => setShowCacheHistory(false)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors">
                  <X size={24} className="text-slate-400 hover:text-red-500" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">

                {/* Controls Area */}
                <div className="p-3 sm:p-4 space-y-3">
                  {/* Upload Button */}
                  <div className="relative">
                    <label
                      htmlFor="manager-file-upload"
                      className="flex items-center justify-center gap-3 w-full p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl cursor-pointer shadow-lg shadow-indigo-200 transition-all group"
                    >
                      <div className="p-2 bg-white/20 rounded-lg group-hover:scale-110 transition-transform">
                        <Upload size={24} />
                      </div>
                      <div>
                        <span className="block text-lg font-bold">Upload New File</span>
                        <span className="text-xs text-indigo-200">Audio or Video support</span>
                      </div>
                    </label>
                    <input
                      id="manager-file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          processFiles(files);
                          e.target.value = '';
                          setShowCacheHistory(false);
                        }
                      }}
                      accept="audio/*,video/*"
                    />
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      placeholder="Search analysis history..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                {
                  /* List - Merged Analyzing & Cached */
                  (() => {
                    const analyzingFiles = files.filter(f => f.isAnalyzing);
                    const filteredCacheKeys = cacheKeys.filter(key => key.toLowerCase().includes(searchQuery.toLowerCase()));

                    if (analyzingFiles.length === 0 && filteredCacheKeys.length === 0) {
                      return (
                        <div className="text-center py-20 text-slate-400">
                          <Clock size={48} className="mx-auto mb-4 opacity-20" />
                          <p className="text-lg font-medium">No history found</p>
                          <p className="text-sm">Upload a file to start analyzing</p>
                        </div>
                      );
                    }

                    return (
                      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-2">
                        {/* 1. Analyzing Files */}
                        {analyzingFiles.map(f => {
                          const isActive = activeFileId === f.id;
                          return (
                            <div
                              key={f.id}
                              onClick={() => { setActiveFileId(f.id); setShowCacheHistory(false); }}
                              className={`
                                group flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer
                                ${isActive
                                  ? 'bg-indigo-100 border-indigo-300 shadow-md'
                                  : 'bg-indigo-50/50 border-indigo-200 hover:bg-indigo-100/50 hover:border-indigo-300'}
                              `}
                            >
                              <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className={`p-2.5 rounded-xl ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600'} animate-pulse`}>
                                  <FileVideo size={20} />
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-base font-bold truncate ${isActive ? 'text-indigo-900' : 'text-indigo-900'}`}>{f.file.name}</p>
                                  <p className={`text-xs font-medium mt-0.5 animate-pulse ${isActive ? 'text-indigo-700' : 'text-indigo-600'}`}>
                                    {f.data && f.data.length > 0
                                      ? `Analyzing (${f.data.filter(d => d.isAnalyzed).length}/${f.data.length})...`
                                      : "Extracting Transcript..."
                                    }
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pl-4 border-l border-indigo-100 ml-4">
                                <div className="hidden sm:flex items-center gap-2 mr-2">
                                  <div className={`w-2 h-2 rounded-full animate-ping ${isActive ? 'bg-indigo-700' : 'bg-indigo-500'}`} />
                                  <span className={`text-xs font-bold ${isActive ? 'text-indigo-700' : 'text-indigo-500'}`}>Processing</span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeFile(f.id, e); }}
                                  className="p-2.5 text-indigo-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                  title="Cancel Analysis"
                                >
                                  <X size={20} />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. Cached Files */}
                        {filteredCacheKeys
                          .sort().reverse().map(key => {
                            const name = key.replace('gemini_analysis_', '');
                            const isActive = activeFile?.file?.name === name;

                            // [Phase 4] 실시간 분석 상태 동적 배지 전환
                            let statusText = "READY";
                            let badgeColor = "bg-gray-100 text-gray-600";
                            let progressText = "";
                            let isFullyAnalyzed = false;

                            try {
                              const cachedData = JSON.parse(localStorage.getItem(key));
                              if (cachedData && cachedData.data) {
                                const total = cachedData.data.length;
                                const analyzed = cachedData.data.filter(d => d.isAnalyzed).length;
                                isFullyAnalyzed = total > 0 && analyzed === total;
                                progressText = `${analyzed}/${total} Sentences`;

                                if (isFullyAnalyzed) {
                                  statusText = "COMPLETED";
                                  badgeColor = "bg-emerald-100 text-emerald-700 font-black";
                                } else if (analyzed > 0) {
                                  statusText = "ANALYZING";
                                  badgeColor = "bg-sky-100 text-sky-700 animate-pulse font-bold";
                                } else if (cachedData.metadata?.status === 'extracted') {
                                  statusText = "READY";
                                  badgeColor = "bg-amber-100 text-amber-700 font-bold";
                                }
                              }
                            } catch (e) {
                              console.error("Error parsing history cache:", e);
                            }

                            return (
                              <div
                                key={key}
                                className={`
                                  group flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all mb-2
                                  ${isActive
                                    ? 'bg-indigo-50 border-indigo-200 shadow-md shadow-indigo-100'
                                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}
                                `}
                                onClick={() => loadCache(key)}
                              >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className={`p-2.5 rounded-xl ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {isActive ? <Check size={20} /> : <BookOpen size={20} />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`text-base font-bold truncate ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] tracking-tight ${badgeColor}`}>
                                        {statusText}
                                      </span>
                                      {progressText && (
                                        <span className="text-[10px] font-medium text-slate-400">
                                          {progressText}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 pl-4 border-l border-slate-100/50 ml-4">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteCache(key); }}
                                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    title="Delete Analysis"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    );
                  })()
                }

              </div>
            </div>
          </div >
        )
      }

    </div >
  );
};

export default App;

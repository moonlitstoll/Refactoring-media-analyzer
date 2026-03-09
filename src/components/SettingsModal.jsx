import {
    Settings, X, Check
} from 'lucide-react';

const SettingsModal = ({
    apiKey, setApiKey, selectedModel, setSelectedModel,
    bufferTime, setBufferTime,
    temperature, setTemperature,
    topP, setTopP,
    saveConfiguration, onClose
}) => {
    return (
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
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
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
                            <label className="text-sm font-bold text-slate-700">재생 여유 시간 (Buffer)</label>
                            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{bufferTime.toFixed(1)}초</span>
                        </div>
                        <div className="px-1">
                            <input
                                type="range"
                                min="0.0"
                                max="2.0"
                                step="0.1"
                                value={bufferTime}
                                onChange={(e) => setBufferTime(parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold px-1">
                                <span>빠르게 (0.0s)</span>
                                <span>0.3s</span>
                                <span>여유롭게 (2.0s)</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                            문장 이동 또는 반복 재생 시, 문장 앞뒤로 들리는 여유 시간입니다.
                        </p>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-50">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <label className="text-sm font-bold text-slate-700">전사 창의성 (Temperature)</label>
                                <span className="text-[10px] text-slate-400">높을수록 유연한 해석</span>
                            </div>
                            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{temperature.toFixed(2)}</span>
                        </div>
                        <div className="px-1">
                            <input
                                type="range"
                                min="0.0"
                                max="1.0"
                                step="0.05"
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold px-1">
                                <span>정밀 (0.0)</span>
                                <span>0.5</span>
                                <span>유연 (1.0)</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-50">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <label className="text-sm font-bold text-slate-700">단어 선택 범위 (TopP)</label>
                                <span className="text-[10px] text-slate-400">높을수록 풍부한 표현</span>
                            </div>
                            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{topP.toFixed(2)}</span>
                        </div>
                        <div className="px-1">
                            <input
                                type="range"
                                min="0.0"
                                max="1.0"
                                step="0.05"
                                value={topP}
                                onChange={(e) => setTopP(parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold px-1">
                                <span>집중 (0.0)</span>
                                <span>0.7</span>
                                <span>다양 (1.0)</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-slate-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-slate-600 font-bold hover:bg-white rounded-2xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            saveConfiguration(apiKey, selectedModel, bufferTime, temperature, topP);
                            const btn = document.getElementById('save-config-btn');
                            if (btn) {
                                const originalText = btn.innerText;
                                btn.innerText = "저장 완료!";
                                btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                                btn.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
                                setTimeout(() => {
                                    btn.innerText = originalText;
                                    btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                                    btn.classList.remove('bg-emerald-500', 'hover:bg-emerald-600');
                                }, 2000);
                            }
                        }}
                        id="save-config-btn"
                        className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-200"
                    >
                        현재 AI 설정값을 기본값으로 저장
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;

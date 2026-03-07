import {
    Upload, Volume2, Settings, X, Trash2
} from 'lucide-react';

const EmptyState = ({
    isDragging, onDragOver, onDragLeave, onDrop,
    processFiles,
    showSettings, setShowSettings,
    apiKey, setApiKey, selectedModel,
    saveConfiguration,
    cacheKeys, loadCache, deleteCache, clearAllCache
}) => {
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
        </div>
    );
};

export default EmptyState;

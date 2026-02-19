
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Save, Copy, Globe, FileJson, Check, AlertTriangle, 
  RotateCcw, ExternalLink, Download, Braces
} from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';

// --- Syntax Highlighter Helper ---
const highlightJSON = (json: string): string => {
  if (!json) return '';
  
  // Escape HTML entities to prevent XSS and rendering issues
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Regex to match JSON tokens: keys, strings, numbers, boolean, null, punctuation
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[\[\]\{\},:])/g,
    (match) => {
      let cls = 'text-slate-300'; // Default
      
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-sky-400 font-semibold'; // Key
        } else {
          cls = 'text-emerald-400'; // String value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-rose-400 font-semibold'; // Boolean
      } else if (/null/.test(match)) {
        cls = 'text-slate-500 italic'; // Null
      } else if (/^-?\d/.test(match)) {
        cls = 'text-amber-400'; // Number
      } else if (/[\[\]\{\},:]/.test(match)) {
        cls = 'text-slate-500'; // Punctuation
      }
      
      return `<span class="${cls}">${match}</span>`;
    }
  );
};

export const UnifiedProfilePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({ 
    queryKey: ['unifiedProfile'], 
    queryFn: mockApi.getUnifiedProfile 
  });

  const [jsonContent, setJsonContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [subscriptionUrl, setSubscriptionUrl] = useState('');
  const [fixedPanelStyle, setFixedPanelStyle] = useState<React.CSSProperties>({});
  
  // Refs for sync scrolling
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const infoAnchorRef = useRef<HTMLDivElement>(null);

  // Initialize content
  useEffect(() => {
    if (profile) {
      setJsonContent(profile.content);
      setSubscriptionUrl(profile.publicUrl || '');
      setIsDirty(false);
      setError(null);
    }
  }, [profile]);

  // Keep right panel fixed while preserving original grid column position/width.
  useEffect(() => {
    const updateFixedPanelStyle = () => {
      if (!infoAnchorRef.current) return;
      if (window.innerWidth < 1024) {
        setFixedPanelStyle({});
        return;
      }
      const rect = infoAnchorRef.current.getBoundingClientRect();
      setFixedPanelStyle({
        position: 'fixed',
        top: `${Math.max(16, Math.round(rect.top))}px`,
        left: `${Math.round(rect.left)}px`,
        width: `${Math.round(rect.width)}px`,
        maxHeight: 'calc(100vh - 7rem)',
      });
    };

    updateFixedPanelStyle();
    window.addEventListener('resize', updateFixedPanelStyle);
    return () => {
      window.removeEventListener('resize', updateFixedPanelStyle);
    };
  }, []);

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: mockApi.saveUnifiedProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(['unifiedProfile'], data);
      setIsDirty(false);
      setError(null);
      setSubscriptionUrl(data.publicUrl || '');
    }
  });

  // Calculate lines for gutter
  const lineNumbers = useMemo(() => {
    return jsonContent.split('\n').map((_, i) => i + 1);
  }, [jsonContent]);

  // Syntax Highlighted Code
  const highlightedCode = useMemo(() => highlightJSON(jsonContent), [jsonContent]);

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setJsonContent(newVal);
    setIsDirty(true);
    
    try {
      JSON.parse(newVal);
      setError(null);
    } catch (e) {
      if (e instanceof Error) {
        // Optional: Parse error line number extraction could go here
        setError(e.message);
      } else {
        setError('Invalid JSON');
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  const handleSave = () => {
    if (error) return; 
    saveMutation.mutate({
      content: jsonContent,
      publicUrl: subscriptionUrl
    });
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonContent(formatted);
      setError(null);
      if (formatted !== jsonContent) setIsDirty(true);
    } catch (e) {
      // Ignore format errors
    }
  };

  const handleCopyUrl = () => {
    if (subscriptionUrl) {
      navigator.clipboard.writeText(subscriptionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'profile.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      
      const newVal = jsonContent.substring(0, start) + "  " + jsonContent.substring(end);
      setJsonContent(newVal);
      
      // Needs timeout to run after render update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
      setIsDirty(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-balance">Unified Profile</h1>
          <p className="text-slate-500 text-pretty">Edit the core JSON configuration directly and access it remotely.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-14rem)] min-h-[500px]">
        {/* Editor Column */}
        <div className="lg:col-span-2 h-full flex flex-col">
          <div className="flex-1 bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col relative border border-slate-800">
            {isLoading && <LoadingOverlay />}
            
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-slate-400 text-xs select-none z-20">
              <div className="flex items-center gap-3">
                <FileJson size={14} className="text-blue-400" />
                <span className="font-mono">profile.json</span>
                {profile?.size && <span className="text-slate-600">({profile.size})</span>}
                <span className="text-slate-700 mx-1">|</span>
                <span className="text-slate-500">{lineNumbers.length} lines</span>
              </div>
              <div className="flex items-center gap-4">
                 {error ? (
                   <span className="flex items-center text-rose-500 font-bold animate-pulse">
                     <AlertTriangle size={12} className="mr-1.5" /> Invalid JSON
                   </span>
                 ) : (
                   <span className="flex items-center text-emerald-500 font-bold">
                     <Check size={12} className="mr-1.5" /> Valid
                   </span>
                 )}
              </div>
            </div>

            {/* Code Editor Area */}
            <div className="flex-1 relative flex overflow-hidden">
               {/* Line Numbers Gutter */}
               <div 
                 ref={gutterRef}
                 className="w-12 bg-slate-950 text-slate-600 text-right pr-3 pt-4 pb-4 select-none border-r border-slate-800 font-mono text-sm leading-6 overflow-hidden"
               >
                 {lineNumbers.map(n => <div key={n}>{n}</div>)}
               </div>

               {/* Editing Surface */}
               <div className="relative flex-1 h-full font-mono text-sm leading-6">
                 {/* 1. Highlight Layer (Bottom) */}
                 <pre 
                   ref={preRef}
                   className="absolute inset-0 p-4 m-0 pointer-events-none whitespace-pre overflow-hidden bg-slate-900"
                   aria-hidden="true"
                 >
                   <code dangerouslySetInnerHTML={{__html: highlightedCode}} />
                 </pre>

                 {/* 2. Input Layer (Top) */}
                 <textarea
                   ref={textareaRef}
                   value={jsonContent}
                   onChange={handleJsonChange}
                   onScroll={handleScroll}
                   onKeyDown={handleKeyDown}
                   spellCheck={false}
                   className="absolute inset-0 w-full h-full p-4 m-0 bg-transparent text-transparent caret-white resize-none outline-none border-0 custom-scrollbar z-10 selection:bg-blue-500/30 whitespace-pre"
                 />
               </div>
            </div>
            
            {/* Error Message Footer */}
            {error && (
              <div className="px-4 py-2 bg-rose-900/10 border-t border-rose-900/50 text-rose-400 text-xs font-mono truncate z-20">
                <span className="font-bold mr-2">ERROR:</span>{error}
              </div>
            )}
          </div>
        </div>

        {/* Info Column */}
        <div ref={infoAnchorRef} className="lg:self-start">
          <div
            className="space-y-6 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1"
            style={fixedPanelStyle}
          >
          <SectionCard title="Actions">
            <div className="space-y-3">
              {isDirty ? (
                <div className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full inline-flex">
                  Unsaved Changes
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setJsonContent(profile?.content || '')}
                  disabled={!isDirty || saveMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-all"
                >
                  <RotateCcw size={16} />
                  Refresh
                </button>
                <button
                  onClick={handleFormat}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-all"
                >
                  <Braces size={16} />
                  Format
                </button>
                <button
                  onClick={handleSave}
                  disabled={!!error || !isDirty || saveMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-900/10"
                >
                  {saveMutation.isPending ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <Save size={16} />
                  )}
                  Save
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Remote Access" description="Use this URL to subscribe to this profile in your clients.">
             <div className="space-y-4">
               <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl group relative">
                 <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                   <Globe size={12} />
                   Public Subscription URL
                 </div>
                 <input
                   value={subscriptionUrl}
                   onChange={(e) => {
                     setSubscriptionUrl(e.target.value);
                     setIsDirty(true);
                   }}
                   placeholder="https://beforeve.com/api/v1/client/subscribe?token=..."
                   className="w-full font-mono text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-blue-200"
                 />
                 <button 
                   onClick={handleCopyUrl}
                   className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                   title="Copy to clipboard"
                 >
                   {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                 </button>
               </div>

               <div className="flex gap-2">
                 <a 
                   href={subscriptionUrl || undefined} 
                   target="_blank" 
                   rel="noreferrer"
                   className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors ${!subscriptionUrl ? 'pointer-events-none opacity-50' : ''}`}
                 >
                   <ExternalLink size={16} /> Open
                 </a>
                 <button
                   onClick={handleDownload}
                   className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                 >
                   <Download size={16} /> Download
                 </button>
               </div>
             </div>
          </SectionCard>

          <SectionCard title="Profile Status">
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">Last Updated</span>
                <span className="text-sm font-mono font-medium">{profile?.lastUpdated || '-'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">Format</span>
                <span className="text-sm font-mono font-medium">sing-box JSON</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-slate-500">Sync Status</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase">Live</span>
              </div>
            </div>
          </SectionCard>
          
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
            <p className="font-bold mb-1 flex items-center"><FileJson size={16} className="mr-2"/> Tips</p>
            <p className="opacity-80 text-xs leading-relaxed">
              This editor modifies the raw JSON configuration. Use <code>Ctrl/Cmd + S</code> logic isn't bound, but please validate your JSON before saving to avoid client errors.
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

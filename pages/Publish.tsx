
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, History, CheckCircle2, AlertCircle, FileText, ChevronRight, RotateCcw, Eye } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';

export const PublishPage: React.FC = () => {
  const { data: versions, isLoading } = useQuery({ queryKey: ['versions'], queryFn: mockApi.getVersions });
  const [step, setStep] = useState(1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Publish Config</h1>
          <p className="text-slate-500">Generate, validate, and deploy your changes to the core.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-4">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                ${step >= s ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'}
              `}>
                {step > s ? <CheckCircle2 size={20} /> : <span className="text-sm font-bold">{s}</span>}
              </div>
              <span className={`text-[10px] font-bold mt-2 uppercase tracking-widest ${step >= s ? 'text-blue-600' : 'text-slate-400'}`}>
                {s === 1 ? 'Generate' : s === 2 ? 'Validate' : 'Apply'}
              </span>
            </div>
            {s < 3 && (
              <div className={`w-20 h-0.5 mx-4 -mt-6 transition-colors ${step > s ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Config Preview" actions={
            <button className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50 border border-slate-200">
               <Eye size={16} />
            </button>
          }>
            <div className="bg-slate-900 rounded-xl p-6 overflow-hidden relative">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                <span className="text-[10px] font-mono text-slate-500 uppercase">config.json</span>
                <span className="text-[10px] font-mono text-emerald-500 uppercase">Valid Schema</span>
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-x-auto">
                {`{
  "log": { "level": "info", "timestamp": true },
  "dns": {
    "servers": [
      { "tag": "google", "address": "tls://8.8.8.8" }
    ]
  },
  "outbounds": [
    { "type": "selector", "tag": "proxy", "outbounds": ["hk1", "us1"] },
    { "type": "direct", "tag": "direct" }
  ],
  "route": {
    "rules": [
      { "geosite": "google", "outbound": "proxy" },
      { "geoip": "cn", "outbound": "direct" }
    ]
  }
}`}
              </pre>
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900 to-transparent flex items-end justify-center pb-4">
                 {step === 1 && (
                    <button 
                      onClick={() => setStep(2)}
                      className="px-8 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all flex items-center"
                    >
                      Verify Syntax <ChevronRight size={16} className="ml-1" />
                    </button>
                 )}
                 {step === 2 && (
                    <button 
                      onClick={() => setStep(3)}
                      className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm shadow-xl shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center"
                    >
                      Commit Changes <Send size={16} className="ml-2" />
                    </button>
                 )}
                 {step === 3 && (
                   <div className="flex items-center bg-white/10 backdrop-blur rounded-full px-6 py-2 border border-white/20 text-white text-xs font-bold uppercase tracking-wider">
                     <CheckCircle2 size={14} className="mr-2 text-emerald-400" /> Successfully Applied
                   </div>
                 )}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Validation Logs">
             <div className="space-y-4">
               <div className="flex items-start gap-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 text-xs">
                 <CheckCircle2 size={16} className="shrink-0" />
                 <div>
                   <p className="font-bold uppercase tracking-tighter">JSON Schema</p>
                   <p className="mt-1 opacity-80">Structure is valid for sing-box v1.8+</p>
                 </div>
               </div>
               <div className="flex items-start gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 text-xs">
                 <AlertCircle size={16} className="shrink-0" />
                 <div>
                   <p className="font-bold uppercase tracking-tighter">Semantic Check</p>
                   <p className="mt-1 opacity-80">14 rules, 3 outbounds correctly referenced.</p>
                 </div>
               </div>
             </div>
          </SectionCard>

          <SectionCard title="Deployment History">
             <div className="relative overflow-hidden -mx-6 -my-6">
               {isLoading && <LoadingOverlay />}
               <div className="divide-y divide-slate-100">
                 {versions?.map(v => (
                   <div key={v.id} className="p-4 hover:bg-slate-50 transition-colors group">
                     <div className="flex items-center justify-between mb-1">
                       <span className="text-xs font-bold text-slate-900">{v.version}</span>
                       <span className="text-[10px] text-slate-400 font-mono">{v.timestamp}</span>
                     </div>
                     <p className="text-xs text-slate-500 line-clamp-1 mb-2">{v.summary}</p>
                     <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[10px] font-bold text-blue-600 hover:underline uppercase">View Diff</button>
                        <button className="flex items-center text-[10px] font-bold text-rose-600 hover:text-rose-700 uppercase">
                          <RotateCcw size={10} className="mr-1" /> Rollback
                        </button>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

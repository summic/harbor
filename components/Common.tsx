
import React from 'react';
import { Search, Plus, Filter, AlertCircle, Loader2 } from 'lucide-react';

export const SectionCard: React.FC<{ 
  title: string; 
  description?: string; 
  children: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, children, actions }) => (
  <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 text-balance">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    <div className="p-6">{children}</div>
  </section>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4">
      {icon || <AlertCircle size={24} />}
    </div>
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="text-sm text-slate-500 mt-1 mb-6 max-w-xs">{description}</p>
    {action}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`}></div>
);

export const StatusBadge: React.FC<{ 
  active: boolean; 
  label?: string;
  activeLabel?: string;
  inactiveLabel?: string;
}> = ({ active, activeLabel = 'Enabled', inactiveLabel = 'Disabled' }) => (
  <span className={`
    inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase
    ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}
  `}>
    {active ? activeLabel : inactiveLabel}
  </span>
);

export const LoadingOverlay: React.FC = () => (
  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 transition-opacity duration-200">
    <Loader2 className="animate-spin text-blue-600" size={32} />
  </div>
);

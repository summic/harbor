
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Plus, Filter, Download, Trash2, Edit2, 
  AlertTriangle, X, Save, Check, Ban, ArrowRight, Shield, Target, GripVertical
} from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';
import { DomainRule, ActionType, RuleType } from '../types';

// --- Sub-components for UI elements ---

const RuleDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialData?: DomainRule | null;
  onSave: (rule: Partial<DomainRule>) => void;
}> = ({ isOpen, onClose, initialData, onSave }) => {
  const isEdit = !!initialData;
  const [formData, setFormData] = useState<Partial<DomainRule>>({
    type: 'suffix',
    value: '',
    group: '',
    action: 'PROXY',
    priority: 10,
    enabled: true,
    note: ''
  });

  // Reset or load data when opening
  React.useEffect(() => {
    if (isOpen) {
      setFormData(initialData || {
        type: 'suffix',
        value: '',
        group: 'ProxyGroup',
        action: 'PROXY',
        priority: 10,
        enabled: true,
        note: ''
      });
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
      
      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Domain Rule' : 'New Domain Rule'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure matching patterns and routing actions.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Rule Type & Value */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Type</label>
                <select 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as RuleType})}
                >
                  <option value="suffix">Suffix</option>
                  <option value="exact">Exact</option>
                  <option value="wildcard">Wildcard</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Domain / Pattern</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder={formData.type === 'suffix' ? 'google.com' : '^.*\\.ad$'}
                  value={formData.value}
                  onChange={e => setFormData({...formData, value: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Action & Group */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Action Strategy</label>
              <div className="grid grid-cols-3 gap-2">
                {(['PROXY', 'DIRECT', 'BLOCK'] as ActionType[]).map(action => (
                  <button
                    key={action}
                    onClick={() => setFormData({...formData, action})}
                    className={`
                      flex flex-col items-center justify-center py-3 rounded-lg border text-xs font-bold transition-all
                      ${formData.action === action 
                        ? (action === 'PROXY' ? 'bg-blue-50 border-blue-200 text-blue-700' : 
                           action === 'DIRECT' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 
                           'bg-rose-50 border-rose-200 text-rose-700')
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}
                    `}
                  >
                    {action === 'PROXY' && <Shield size={16} className="mb-1.5" />}
                    {action === 'DIRECT' && <Check size={16} className="mb-1.5" />}
                    {action === 'BLOCK' && <Ban size={16} className="mb-1.5" />}
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {formData.action === 'PROXY' && (
              <div className="animate-fade-in">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Outbound Group</label>
                <input 
                  type="text"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="e.g. HK-Nodes or ProxyGroup"
                  value={formData.group}
                  onChange={e => setFormData({...formData, group: e.target.value})}
                />
              </div>
            )}
          </div>

          {/* Priority & Note */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
               <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Priority</label>
               <input 
                  type="number"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  value={formData.priority}
                  onChange={e => setFormData({...formData, priority: parseInt(e.target.value) || 0})}
                />
                <p className="text-[10px] text-slate-400 mt-1">Higher number = higher priority.</p>
            </div>
             <div>
               <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Status</label>
               <div className="flex items-center h-[38px]">
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.enabled}
                      onChange={e => setFormData({...formData, enabled: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm font-medium text-slate-700">{formData.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
               </div>
            </div>
          </div>
           
           <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Note (Optional)</label>
              <textarea 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none h-20 resize-none"
                placeholder="Description for this rule..."
                value={formData.note}
                onChange={e => setFormData({...formData, note: e.target.value})}
              />
           </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(formData)}
            className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-lg hover:bg-slate-800 transition-colors flex items-center shadow-lg shadow-slate-900/10"
          >
            <Save size={16} className="mr-2" />
            {isEdit ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </>
  );
};

const DeleteDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 mx-auto">
          <Trash2 size={24} />
        </div>
        <h3 className="text-lg font-bold text-center text-slate-900 mb-2">Delete Domain Rule?</h3>
        <p className="text-sm text-slate-500 text-center mb-6">
          Are you sure you want to delete this rule? This action cannot be undone and might affect your routing immediately.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold text-sm hover:bg-rose-700 shadow-lg shadow-rose-500/20"
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Page Component ---

export const DomainsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ['domains'], queryFn: mockApi.getDomains });
  
  // UI States
  const [search, setSearch] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DomainRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Simulation States
  const [testDomain, setTestDomain] = useState('');
  const [simulatedRule, setSimulatedRule] = useState<DomainRule | null>(null);
  const [simulationRan, setSimulationRan] = useState(false);

  // Derived State
  const filteredRules = useMemo(() => {
    return rules?.filter(r => 
      r.value.toLowerCase().includes(search.toLowerCase()) || 
      r.group.toLowerCase().includes(search.toLowerCase())
    ).sort((a,b) => b.priority - a.priority);
  }, [rules, search]);

  // Handlers
  const handleEdit = (rule: DomainRule) => {
    setEditingRule(rule);
    setIsDrawerOpen(true);
  };

  const handleCreate = () => {
    setEditingRule(null);
    setIsDrawerOpen(true);
  };

  const handleSave = (data: Partial<DomainRule>) => {
    // In a real app, useMutation here. 
    // For now, we just close the drawer to simulate success.
    console.log("Saving rule:", data);
    setIsDrawerOpen(false);
    
    // Simulate optimistic update or refetch
    // queryClient.invalidateQueries(['domains']);
  };

  const handleDeleteConfirm = () => {
    console.log("Deleting rule id:", deleteTarget);
    setDeleteTarget(null);
    // queryClient.invalidateQueries(['domains']);
  };

  const runSimulation = () => {
    if (!testDomain || !rules) return;
    
    // Sort rules by priority (High to Low)
    const sorted = [...rules].sort((a,b) => b.priority - a.priority);
    let match = null;

    for (const rule of sorted) {
      if (!rule.enabled) continue;
      
      let isMatch = false;
      const t = testDomain.toLowerCase();
      const v = rule.value.toLowerCase();

      switch (rule.type) {
        case 'exact':
          isMatch = t === v;
          break;
        case 'suffix':
          // Simplistic suffix match: domain == value OR domain ends with .value
          isMatch = t === v || t.endsWith('.' + v);
          break;
        case 'wildcard':
          isMatch = t.includes(v);
          break;
        case 'regex':
          try {
            isMatch = new RegExp(rule.value).test(testDomain);
          } catch(e) { isMatch = false; }
          break;
      }

      if (isMatch) {
        match = rule;
        break; // First match wins
      }
    }

    setSimulatedRule(match);
    setSimulationRan(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-balance">Domain Rules</h1>
          <p className="text-slate-500 text-pretty">Manage fine-grained routing for specific domains and patterns.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:transform active:scale-95 transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus size={16} className="mr-2" />
            Add Rule
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <SectionCard 
        title="Rule Management" 
        actions={
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
              <input 
                type="text" 
                placeholder="Search rules..." 
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all w-full sm:w-64 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors" aria-label="Filters">
              <Filter size={16} />
            </button>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors" aria-label="Export">
              <Download size={16} />
            </button>
          </div>
        }
      >
        <div className="relative overflow-x-auto -mx-6">
          {isLoading && <LoadingOverlay />}
          <table className="w-full text-sm text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50/50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3 border-y border-slate-100">Type</th>
                <th className="px-6 py-3 border-y border-slate-100">Value</th>
                <th className="px-6 py-3 border-y border-slate-100">Group</th>
                <th className="px-6 py-3 border-y border-slate-100 text-center">Action</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Priority</th>
                <th className="px-6 py-3 border-y border-slate-100 text-center">Status</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRules?.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <code className="text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded uppercase">{rule.type}</code>
                  </td>
                  <td className="px-6 py-4 font-medium truncate max-w-[200px] text-slate-700">{rule.value}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {rule.group && <span className="flex items-center gap-1.5"><Shield size={12}/> {rule.group}</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`
                      px-2 py-1 rounded text-[10px] font-bold inline-flex items-center gap-1
                      ${rule.action === 'PROXY' ? 'bg-blue-100 text-blue-700' : 
                        rule.action === 'DIRECT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}
                    `}>
                      {rule.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-500 font-mono">{rule.priority}</td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge active={rule.enabled} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(rule)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => setDeleteTarget(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRules?.length === 0 && (
                 <tr>
                   <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                     No rules found matching your search.
                   </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Conflict Detection Card (Static for now) */}
        <SectionCard title="Conflict Detection" description="Overlapping or contradictory domain rules detected.">
          <div className="flex items-start p-4 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-sm">
            <AlertTriangle className="mr-3 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-semibold">Potential conflicts found</p>
              <ul className="mt-2 space-y-1 list-disc list-inside opacity-90 text-xs">
                <li><code>google.com</code> matches both suffix and exact types in high priority.</li>
                <li>Regex <code>.*</code> might override specific policies if priority is misconfigured.</li>
              </ul>
            </div>
          </div>
        </SectionCard>

        {/* Hit Tester Card */}
        <SectionCard title="Hit Tester" description="Verify which rule will be applied for a specific domain based on current priority.">
          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="e.g. static.google.com" 
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                value={testDomain}
                onChange={e => {
                   setTestDomain(e.target.value);
                   setSimulationRan(false); // Reset on type
                }}
                onKeyDown={e => e.key === 'Enter' && runSimulation()}
              />
              <button 
                onClick={runSimulation}
                disabled={!testDomain}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test
              </button>
            </div>
            
            <div className={`
              p-5 bg-slate-50 rounded-lg border border-slate-100 transition-all duration-300
              ${simulationRan ? 'opacity-100 translate-y-0' : 'opacity-50'}
            `}>
              {!simulationRan ? (
                <div className="text-center text-slate-400 text-xs py-2">
                  Enter a domain and click Test to see routing decision.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span>Simulation Chain</span>
                    <span>Result</span>
                  </div>
                  
                  <div className="flex flex-col gap-4 relative">
                     {/* Step 1: Input */}
                     <div className="flex items-center gap-3 relative z-10">
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm text-slate-500">
                          <Target size={14} />
                        </div>
                        <div className="flex-1 p-2 bg-white border border-slate-100 rounded-md shadow-sm">
                           <p className="text-[10px] text-slate-400 uppercase font-bold">Input</p>
                           <p className="text-sm font-mono text-slate-700">{testDomain}</p>
                        </div>
                     </div>

                     {/* Connector Line */}
                     <div className="absolute left-4 top-8 bottom-4 w-0.5 bg-slate-200 -z-0"></div>

                     {/* Step 2: Match */}
                     <div className="flex items-center gap-3 relative z-10">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center shadow-sm transition-colors
                          ${simulatedRule ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-300'}
                        `}>
                          <Filter size={14} />
                        </div>
                        <div className={`flex-1 p-2 border rounded-md shadow-sm transition-colors
                          ${simulatedRule ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-100 opacity-60'}
                        `}>
                           <p className="text-[10px] text-slate-400 uppercase font-bold">Matched Rule</p>
                           {simulatedRule ? (
                             <div className="flex flex-wrap gap-2 items-center mt-1">
                               <span className="text-xs font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">{simulatedRule.type}</span>
                               <span className="text-sm font-semibold text-slate-900">{simulatedRule.value}</span>
                               <span className="text-[10px] text-slate-400 ml-auto">Priority: {simulatedRule.priority}</span>
                             </div>
                           ) : (
                             <p className="text-sm text-slate-500 italic mt-1">No specific rule matched (Default)</p>
                           )}
                        </div>
                     </div>

                     {/* Step 3: Action */}
                     <div className="flex items-center gap-3 relative z-10">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center shadow-sm
                          ${simulatedRule 
                             ? (simulatedRule.action === 'BLOCK' ? 'bg-rose-100 border-rose-200 text-rose-600' : 'bg-emerald-100 border-emerald-200 text-emerald-600')
                             : 'bg-slate-100 border-slate-200 text-slate-400'}
                        `}>
                          {simulatedRule?.action === 'BLOCK' ? <Ban size={14} /> : <ArrowRight size={14} />}
                        </div>
                        <div className="flex-1 p-2 bg-white border border-slate-100 rounded-md shadow-sm flex items-center justify-between">
                           <div>
                             <p className="text-[10px] text-slate-400 uppercase font-bold">Final Action</p>
                             <p className={`text-sm font-bold mt-0.5 ${!simulatedRule ? 'text-slate-500' : ''}`}>
                               {simulatedRule ? simulatedRule.action : 'FINAL (Default)'}
                             </p>
                           </div>
                           {simulatedRule?.group && (
                             <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium flex items-center gap-1">
                               <Shield size={12} /> {simulatedRule.group}
                             </span>
                           )}
                        </div>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Components */}
      <RuleDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        initialData={editingRule} 
        onSave={handleSave}
      />
      <DeleteDialog 
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

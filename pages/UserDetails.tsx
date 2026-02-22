
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, ArrowUp, ArrowDown, Activity,
  Smartphone, Laptop, Clock, ShieldCheck, Mail, Calendar, AlertTriangle 
} from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';

// --- Formatter ---
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const UserDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading } = useQuery({ 
    queryKey: ['user', id], 
    queryFn: () => mockApi.getUser(id || '') 
  });

  if (isLoading) return <div className="h-96 relative"><LoadingOverlay /></div>;
  
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={32} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">User Not Found</h2>
        <p className="text-slate-500 mt-2 mb-6">The user you are looking for does not exist or has been removed.</p>
        <Link to="/users" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
          Return to Users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <Link to="/users" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 mb-4 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to Users Directory
        </Link>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 flex items-center justify-center text-2xl font-bold shadow-inner">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName || user.username} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                (user.displayName || user.username).charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                {user.displayName || user.email || user.username}
                <StatusBadge active={user.status === 'active'} activeLabel="Active" inactiveLabel={user.status} />
              </h1>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><Mail size={14} /> {user.email}</span>
                <span className="flex items-center gap-1.5"><Clock size={14} /> Last Online: {user.lastOnline}</span>
                <span className="flex items-center gap-1.5"><Calendar size={14} /> Created: {user.created}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
             <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
               Reset Traffic
             </button>
             <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-colors">
               Edit Profile
             </button>
          </div>
        </div>
      </div>

      {/* Traffic Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-32 bg-emerald-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-1 text-emerald-600 font-bold text-xs uppercase tracking-wider">
                <ArrowUp size={14} /> Upload
              </div>
              <div className="text-3xl font-bold text-slate-900">{formatBytes(user.traffic.upload)}</div>
            </div>
         </div>
         <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-1 text-blue-600 font-bold text-xs uppercase tracking-wider">
                <ArrowDown size={14} /> Download
              </div>
              <div className="text-3xl font-bold text-slate-900">{formatBytes(user.traffic.download)}</div>
            </div>
         </div>
         <div className="p-6 bg-slate-900 text-white rounded-xl shadow-lg flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1 text-slate-400 font-bold text-xs uppercase tracking-wider">
                <Activity size={14} /> Total Usage
              </div>
              <div className="text-3xl font-bold">{formatBytes(user.traffic.total)}</div>
              <p className="text-xs text-slate-400 mt-2">Combined bandwidth usage since creation.</p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Access Logs */}
        <div className="lg:col-span-2 space-y-6">
           <SectionCard title="Access Logs Overview" actions={
              <span className="text-xs font-mono bg-emerald-50 px-2 py-1 rounded text-emerald-700">All requests</span>
           }>
             <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-800">
               Metrics below are calculated from all uploaded requests (direct, proxy, block, and others).
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                   <p className="text-xs text-slate-500 mb-1">All Requests</p>
                   <p className="text-xl font-bold tabular-nums">{user.logs.totalRequests.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                   <p className="text-xs text-slate-500 mb-1">Upload</p>
                   <p className="text-xl font-bold tabular-nums text-emerald-700">{formatBytes(user.traffic.upload)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                   <p className="text-xs text-slate-500 mb-1">Download</p>
                   <p className="text-xl font-bold tabular-nums text-blue-700">{formatBytes(user.traffic.download)}</p>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                  <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center">
                    <Activity size={14} className="mr-1.5" /> Top Domains
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                     {user.logs.topAllowed.map((item, idx) => (
                       <div key={idx} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <span className="text-sm font-medium text-slate-700">{item.domain}</span>
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{item.count}</span>
                       </div>
                     ))}
                     {user.logs.topAllowed.length === 0 && <div className="p-6 text-center text-xs text-slate-400">No domain data yet</div>}
                  </div>
               </div>
               <div>
                  <h3 className="text-xs font-bold text-sky-700 uppercase tracking-wider mb-3 flex items-center">
                    <Activity size={14} className="mr-1.5" /> Top Direct Domains
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                     {user.logs.topDirect.map((item, idx) => (
                       <div key={idx} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <span className="text-sm font-medium text-slate-700">{item.domain}</span>
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{item.count}</span>
                       </div>
                     ))}
                     {user.logs.topDirect.length === 0 && <div className="p-6 text-center text-xs text-slate-400">No direct domain data yet</div>}
                  </div>
               </div>
             </div>
           </SectionCard>
        </div>

        {/* Right Column: Devices */}
        <div className="space-y-6">
           <SectionCard title={`Devices (${user.devices.length})`}>
              <div className="space-y-3">
                {user.devices.map(device => (
                  <div key={device.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-4 group hover:border-blue-200 transition-colors">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm">
                       {device.os.includes('Windows') || device.os.includes('Mac') ? <Laptop size={20} /> : <Smartphone size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-slate-800 truncate">{device.name}</p>
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">v{device.appVersion}</span>
                       </div>
                       <p className="text-xs text-slate-500 mt-0.5 truncate">{device.os} • {device.ip}</p>
                       <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                         <Activity size={10} /> Last seen: {device.lastSeen}
                         {device.location && (
                           <>
                             <span className="text-slate-300 mx-0.5">•</span>
                             <span className="text-slate-500">{device.location}</span>
                           </>
                         )}
                       </p>
                    </div>
                  </div>
                ))}
                {user.devices.length === 0 && (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <Smartphone size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No active devices</p>
                  </div>
                )}
              </div>
           </SectionCard>

           <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <div className="flex items-center gap-2 mb-2 text-amber-800 font-bold text-sm">
                <ShieldCheck size={16} /> Security Note
              </div>
              <p className="text-xs text-amber-700/80 leading-relaxed">
                This user has administrative privileges for network configuration. Ensure 2FA is enabled.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

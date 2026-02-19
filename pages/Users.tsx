
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Search, Plus, Filter, Smartphone, 
} from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';

// Helper to format bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: mockApi.getUsers });
  const [search, setSearch] = useState('');

  const filteredUsers = users?.filter(u => 
    (u.displayName || u.username).toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-slate-500">Monitor user activity, devices, and resource usage.</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20">
          <Plus size={16} className="mr-2" />
          Add User
        </button>
      </div>

      <SectionCard
        title="Users Directory"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
              <input 
                type="text" 
                placeholder="Search users..." 
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all w-full sm:w-64 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors">
              <Filter size={16} />
            </button>
          </div>
        }
      >
        <div className="relative overflow-x-auto -mx-6">
          {isLoading && <LoadingOverlay />}
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Total Usage</th>
                <th className="px-6 py-4">Active Devices</th>
                <th className="px-6 py-4">Last Online</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers?.map(user => (
                <tr 
                  key={user.id} 
                  className="hover:bg-slate-50/50 group cursor-pointer transition-colors" 
                  onClick={() => navigate(`/users/${user.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold mr-3">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.displayName || user.username} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          (user.displayName || user.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{user.displayName || user.email || user.username}</div>
                        <div className="text-xs text-slate-500">{user.email || user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge active={user.status === 'active'} activeLabel="Active" inactiveLabel={user.status} />
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-600">
                    {formatBytes(user.traffic.total)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-600">
                       <Smartphone size={14} />
                       <span>{user.devices.length}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {user.lastOnline}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); navigate(`/users/${user.id}`); }}
                      className="text-blue-600 hover:text-blue-800 font-medium text-xs bg-blue-50 px-3 py-1.5 rounded-md"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

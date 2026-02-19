
import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Activity,
  Globe, 
  Zap, 
  Shuffle, 
  Settings2, 
  Send, 
  Menu, 
  X,
  ShieldCheck,
  FileJson,
  Users,
  ChevronDown,
  LogOut,
  Bell
} from 'lucide-react';
import { useAppStore } from '../store';
import { useAuth } from '../auth-context';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/quality', label: 'Quality', icon: Activity },
  { path: '/domains', label: 'Domains', icon: Globe },
  { path: '/proxies', label: 'Proxies', icon: Zap },
  { path: '/routing', label: 'Routing', icon: Shuffle },
  { path: '/dns-hosts', label: 'DNS & Hosts', icon: Settings2 },
  { path: '/users', label: 'Users', icon: Users },
  { path: '/profile', label: 'Unified Profile', icon: FileJson },
  { path: '/publish', label: 'Publish', icon: Send },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSidebarOpen, toggleSidebar } = useAppStore();
  const location = useLocation();
  const auth = useAuth();
  const isAdmin = auth.isAdmin;
  const user = auth.session?.user as Record<string, unknown> | undefined;
  const displayName =
    (user?.name as string | undefined) ||
    (user?.preferred_username as string | undefined) ||
    (user?.nickname as string | undefined) ||
    ([user?.given_name, user?.family_name].filter(Boolean).join(' ').trim() || undefined) ||
    (user?.email as string | undefined) ||
    (user?.sub as string | undefined) ||
    'Kylith User';
  const email =
    (user?.email as string | undefined) ||
    (user?.upn as string | undefined) ||
    (user?.preferred_username as string | undefined) ||
    '';
  const roleFromList = Array.isArray(user?.roles)
    ? user?.roles.find((item): item is string => typeof item === 'string')
    : undefined;
  const role =
    (user?.role as string | undefined) ||
    roleFromList ||
    (user?.['https://kylith.com/claims/role'] as string | undefined) ||
    'Authenticated';
  const sub = (user?.sub as string | undefined) || '';
  const avatarUrl = (user?.picture as string | undefined) || (user?.avatar_url as string | undefined) || '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'KU';

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50">
      {isAdmin ? (
        <>
          {/* Sidebar */}
          <aside
            className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transition-transform duration-200 ease-in-out md:relative md:translate-x-0
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          >
            <div className="flex h-16 items-center px-6 border-b border-slate-100">
              <ShieldCheck className="h-6 w-6 text-blue-600 mr-2" />
              <span className="font-bold text-lg tracking-tight">BoxMaster</span>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                    flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                  `}
                  >
                    <Icon className={`h-4 w-4 mr-3 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-100 text-[10px] text-slate-400 font-mono text-center">
              BoxMaster Manager v2.0
            </div>
          </aside>
        </>
      ) : null}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 safe-pt z-20">
          {isAdmin ? (
            <button
              onClick={toggleSidebar}
              className="p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-md md:hidden"
              aria-label="Toggle menu"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          ) : (
            <div />
          )}
          <div className="flex-1 flex items-center justify-end gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              SYSTEM ONLINE
            </div>
            
            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
            </button>

            {/* User Profile Dropdown Area */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-100 md:border-none md:pl-0 cursor-pointer group relative">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-800 leading-none">{displayName}</p>
                <p className="text-[10px] text-slate-500 font-medium mt-1 truncate max-w-[220px]">
                  {email || role}
                </p>
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-md ring-2 ring-slate-100 group-hover:ring-blue-100 transition-all overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              
              {/* Dropdown Menu (Hover implementation for simplicity) */}
              <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 py-1 invisible opacity-0 translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-50">
                 <div className="px-4 py-3 border-b border-slate-50 sm:hidden">
                    <p className="text-sm font-semibold text-slate-800">{displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{email}</p>
                 </div>
                 <div className="px-4 py-2 border-b border-slate-50">
                   <p className="text-[11px] text-slate-500">Role</p>
                   <p className="text-xs text-slate-700 truncate">{role}</p>
                   {sub ? <p className="text-[11px] text-slate-400 truncate mt-1">sub: {sub}</p> : null}
                 </div>
                 <button className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                   Account Settings
                 </button>
                 <button className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                   API Keys
                 </button>
                 <div className="h-px bg-slate-100 my-1"></div>
                 <button
                   onClick={auth.logout}
                   className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors flex items-center"
                 >
                   <LogOut size={14} className="mr-2" /> Sign Out
                 </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 relative">
          <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Backdrop */}
      {isAdmin && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" 
          onClick={toggleSidebar}
        />
      )}
    </div>
  );
};

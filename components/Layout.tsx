
import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Globe, 
  Zap, 
  Shuffle, 
  Settings2, 
  Send, 
  Menu, 
  X,
  ShieldCheck
} from 'lucide-react';
import { useAppStore } from '../store';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/domains', label: 'Domains', icon: Globe },
  { path: '/proxies', label: 'Proxies', icon: Zap },
  { path: '/routing', label: 'Routing', icon: Shuffle },
  { path: '/dns-hosts', label: 'DNS & Hosts', icon: Settings2 },
  { path: '/publish', label: 'Publish', icon: Send },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSidebarOpen, toggleSidebar } = useAppStore();
  const location = useLocation();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transition-transform duration-200 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
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
          SING-BOX V1.8.0-RC4
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 safe-pt">
          <button 
            onClick={toggleSidebar} 
            className="p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-md md:hidden"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center px-3 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
              CORE RUNNING
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <span className="text-xs tabular-nums text-slate-500">Up: 12d 4h 23m</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 relative">
          <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" 
          onClick={toggleSidebar}
        />
      )}
    </div>
  );
};

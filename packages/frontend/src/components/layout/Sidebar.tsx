import { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import {
  LayoutDashboard,
  Megaphone,
  PenTool,
  Video,
  MessageCircle,
  BarChart3,
  Plug,
  Settings,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Radar,
  Brain,
  Flame,
  CheckSquare,
  Users,
  Sparkles,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { socket } from '../../lib/socket';
import api from '../../lib/api';

const navGroups = [
  [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Campaigns', icon: Megaphone, path: '/campaigns' },
    { name: 'Create', icon: PenTool, path: '/library' },
    { name: 'Scheduler', icon: Calendar, path: '/scheduler' },
  ],
  [
    { name: 'Viral Studio', icon: Video, path: '/viral' },
    { name: 'Engagement', icon: MessageCircle, path: '/engagement' },
    { name: 'Analytics', icon: BarChart3, path: '/analytics' },
  ],
  [
    { name: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { name: 'Intelligence', icon: Radar, path: '/intelligence' },
    { name: 'Brand Memory', icon: Brain, path: '/brand-memory' },
    { name: 'Brand Roast', icon: Flame, path: '/brand-roast' },
    { name: 'Social Accounts', icon: Users, path: '/social-accounts' },
    { name: 'Pack Marketplace', icon: Plug, path: '/connector-hub' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ]
];

export default function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar, isMobileSidebarOpen, setMobileSidebarOpen, toggleAssistant } = useUIStore();
  const location = useLocation();
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    fetchApprovalCount();

    const handleApprovalRequested = () => fetchApprovalCount();
    const handleApprovalExecuted = () => fetchApprovalCount();
    const handleApprovalRejected = () => fetchApprovalCount();

    socket.on('approval:requested', handleApprovalRequested);
    socket.on('approval:executed', handleApprovalExecuted);
    socket.on('approval:rejected', handleApprovalRejected);

    return () => {
      socket.off('approval:requested', handleApprovalRequested);
      socket.off('approval:executed', handleApprovalExecuted);
      socket.off('approval:rejected', handleApprovalRejected);
    };
  }, []);

  async function fetchApprovalCount() {
    try {
      const res = await api.get('/api/approvals/queue/count');
      setApprovalCount(res.data.count || 0);
    } catch (err) {
      // ignore
      console.warn('[vimo] best-effort operation failed:', err);
    }
  }

  return (    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900",
        // On mobile: slide in/out based on isMobileSidebarOpen
        "-translate-x-full lg:translate-x-0",
        isMobileSidebarOpen && "translate-x-0",
        // On desktop: use width based on collapse state
        isSidebarCollapsed ? 'w-[64px]' : 'w-[260px]'
      )}
    >
      {/* Top section: Logo */}
      <div className="flex h-20 items-center justify-center border-b border-slate-200 px-4 dark:border-slate-800 shrink-0">
        <img src="/VIMO_logo.png" alt="VIMO" className="h-10 w-auto object-contain" />
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 select-none custom-scrollbar">
        {/* Ask VIMO — the conversational agent is the product's front door */}
        <button
          onClick={() => {
            toggleAssistant();
            setMobileSidebarOpen(false);
          }}
          title="Ask VIMO (Ctrl+K)"
          className={cn(
            "mb-5 flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/20 transition-all hover:shadow-lg hover:shadow-teal-500/30 active:scale-[0.98]",
            isSidebarCollapsed && "justify-center px-0"
          )}
        >
          <Sparkles className="h-5 w-5 shrink-0" />
          {!isSidebarCollapsed && (
            <>
              <span className="flex-1 text-left">Ask VIMO</span>
              <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-bold">⌘K</kbd>
            </>
          )}
        </button>
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="mb-8">
            <ul className="space-y-1.5">
              {group.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <li key={item.path} className="relative">
                    <NavLink
                      to={item.path}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 shadow-sm"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 shrink-0 transition-transform duration-200",
                        isActive ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className={cn(
                        "transition-opacity duration-300 flex-1",
                        isSidebarCollapsed ? "opacity-0 w-0" : "opacity-100"
                      )}>
                        {item.name}
                      </span>
                      {item.name === 'Approvals' && approvalCount > 0 && (
                        <span className={cn(
                          "flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900",
                          isSidebarCollapsed ? 'absolute -top-1 -right-1' : ''
                        )}>
                          {approvalCount > 9 ? '9+' : approvalCount}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800">
        {/* Close button for mobile */}
        <button
          onClick={() => setMobileSidebarOpen(false)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
        >
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <span>Close Menu</span>
        </button>
        {/* Collapse toggle for desktop */}
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-5 w-5 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

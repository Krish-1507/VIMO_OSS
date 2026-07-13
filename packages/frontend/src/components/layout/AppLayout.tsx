import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import Sidebar from './Sidebar';
import Header from './Header';
import Toast from '../ui/Toast';
import HelpPanel from '../ui/HelpPanel';
import HelpButton from '../ui/HelpButton';
import VimoAssistant from '../assistant/VimoAssistant';

// eslint-disable-next-line react-hooks/rules-of-hooks

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isSidebarCollapsed, isMobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const location = useLocation();

  // Map path to help content pageId
  const getPageId = () => {
    const path = location.pathname.split('/')[1];
    return path || 'dashboard';
  };

  useEffect(() => {
    // Always apply dark mode
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="min-h-screen dark">
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors">
        {/* Mobile sidebar backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <Sidebar />
        <div
          className={`flex flex-col transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'lg:pl-16' : 'lg:pl-[260px]'
          }`}
        >
          <Header title="" />
          <HelpButton onClick={() => setIsHelpOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div key={location.pathname} className="page-content max-w-[1600px] mx-auto">
              {children}
            </div>
          </main>
        </div>
        <Toast />
        <VimoAssistant />
        <HelpPanel
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
          pageId={getPageId()}
        />
      </div>
    </div>
  );
}
Touch

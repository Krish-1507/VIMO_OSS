import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useOnboardingStore } from './stores/onboardingStore';
import { useDemoMode } from './lib/demoMode';
import DemoModeBar from './components/demo/DemoModeBar';
import AppLayout from './components/layout/AppLayout';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CampaignsPage from './pages/CampaignsPage';
import SchedulerPage from './pages/SchedulerPage';
import ViralPage from './pages/ViralPage';
import EngagementPage from './pages/EngagementPage';
import IntelligencePage from './pages/IntelligencePage';
import LibraryPage from './pages/LibraryPage';
import AnalyticsPage from './pages/AnalyticsPage';

import ConnectorHubPage from './connector-packs/pages/ConnectorHubPage';
import SocialAccountsPage from './social-accounts/pages/SocialAccountsPage';
// Legacy connector page kept for reference: /connectors-legacy
import SettingsPage from './pages/SettingsPage';
import BrandMemoryPage from './pages/BrandMemoryPage';
import BrandRoastPage from './pages/BrandRoastPage';
import ApprovalQueuePage from './pages/ApprovalQueuePage';
import SystemCheckPage from './pages/SystemCheckPage';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

function AppRoutes() {
  const { isSetupComplete, isAuthenticated, isLoading, checkAuthStatus } = useAuthStore();
  const demoActive = useDemoMode((s) => s.active);
  const [checked, setChecked] = useState(false);
  const [hasPassedCheck] = useState(!!localStorage.getItem('hasPassedSystemCheck'));
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (demoActive) {
      // Demo Mode: pretend the environment is ready and the user is signed in.
      try { localStorage.setItem('hasPassedSystemCheck', 'true'); } catch { /* ignore */ }
      useAuthStore.getState().setAuth('demo-session');
      useAuthStore.setState({ isSetupComplete: true, isLoading: false });
      useOnboardingStore.setState({ isComplete: true, isLoading: false, currentStep: 4 });
      setChecked(true);
      return;
    }
    checkAuthStatus().then(() => setChecked(true));
  }, [demoActive, checkAuthStatus]);

  // Validate system check with backend on mount
  useEffect(() => {
    if (demoActive || !hasPassedCheck) return;
    import('./lib/api').then(({ default: api }) => {
      api.get('/api/health').catch(() => {
        // Backend unreachable — reset system check flag
        localStorage.removeItem('hasPassedSystemCheck');
        window.location.reload();
      });
    });
  }, [hasPassedCheck, demoActive]);

  const publicPaths = ['/system-check', '/setup', '/login'];

  useEffect(() => {
    if (!checked || isLoading) return;
    if (demoActive) return; // Demo Mode bypasses all gates

    const isResetMode = location.pathname === '/setup' && location.search.includes('mode=reset');

    // 1. System Check always comes first
    if (!hasPassedCheck && !publicPaths.includes(location.pathname)) {
      navigate('/system-check', { replace: true });
      return;
    }

    // 2. Setup Page if not complete (but allow reset mode without full setup)
    if (!isSetupComplete && location.pathname !== '/setup' && location.pathname !== '/system-check') {
      navigate('/setup', { replace: true });
      return;
    }

    // 3. Login Page if not authenticated
    if (isSetupComplete && !isAuthenticated && location.pathname !== '/login' && location.pathname !== '/system-check' && !isResetMode) {
      navigate('/login', { replace: true });
      return;
    }

    // 4. Allow reset mode flow without requiring auth
    if (isResetMode) return;

    // 5. Redirect from public pages to dashboard if all good
    if (isSetupComplete && isAuthenticated) {
      const isOnPublicPage =
        location.pathname === '/login' || location.pathname === '/setup' || location.pathname === '/system-check';
      if (isOnPublicPage) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [checked, isLoading, isSetupComplete, isAuthenticated, navigate, location.pathname, hasPassedCheck, demoActive]);

  // Loading state with a more professional feel
  if (hasPassedCheck && (isLoading || !checked)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 transition-opacity duration-500 animate-in fade-in">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-500 dark:border-slate-800" />
          <p className="text-sm font-medium text-slate-500 animate-pulse">Initializing VIMO...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/system-check" element={<SystemCheckPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AppLayout>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ErrorBoundary>
                    <DashboardPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/campaigns"
                element={
                  <ErrorBoundary>
                    <CampaignsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/scheduler"
                element={
                  <ErrorBoundary>
                    <SchedulerPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/viral"
                element={
                  <ErrorBoundary>
                    <ViralPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/engagement"
                element={
                  <ErrorBoundary>
                    <EngagementPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/intelligence"
                element={
                  <ErrorBoundary>
                    <IntelligencePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/library"
                element={
                  <ErrorBoundary>
                    <LibraryPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ErrorBoundary>
                    <AnalyticsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/connectors"
                element={
                  <ErrorBoundary>
                    <Navigate to="/connector-hub" replace />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/social-accounts"
                element={
                  <ErrorBoundary>
                    <SocialAccountsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/connector-hub"
                element={
                  <ErrorBoundary>
                    <ConnectorHubPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/brand-memory"
                element={
                  <ErrorBoundary>
                    <BrandMemoryPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/brand-roast"
                element={
                  <ErrorBoundary>
                    <BrandRoastPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/approvals"
                element={
                  <ErrorBoundary>
                    <ApprovalQueuePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/settings"
                element={
                  <ErrorBoundary>
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AppLayout>
        }
      />
    </Routes>
  );
}

function OnboardingOverlay() {
  const { isComplete, isLoading } = useOnboardingStore();
  if (isLoading) return null;
  if (isComplete) return null;
  return <OnboardingWizard />;
}

function DemoBanner() {
  const demoActive = useDemoMode((s) => s.active);
  if (!demoActive) return null;
  return <DemoModeBar />;
}

function App() {
  return (
    <>
      <DemoBanner />
      <AppRoutes />
      <OnboardingOverlay />
    </>
  );
}

export default App;

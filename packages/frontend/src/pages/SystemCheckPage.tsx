import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, CheckCircle2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import TryDemoButton from '../components/demo/TryDemoButton';

// Health checks should go through Vite's /api proxy so we don't depend on a hardcoded backend port.

export default function SystemCheckPage() {
  const [searchParams] = useSearchParams();
  const isReset = searchParams.get('mode') === 'reset';
  const [mounted, setMounted] = useState(false);
  const [checks, setChecks] = useState({
    backend:    { status: 'pending', label: 'Backend server is running', error: '' },
    node:       { status: 'pending', label: 'Node.js version (v20+)', error: '' },
    db:         { status: 'pending', label: 'Database is ready', error: '' },
    encryption: { status: 'pending', label: 'Encryption is configured', error: '' },
  });
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [allPassed, setAllPassed] = useState(false);
  const navigate = useNavigate();
  // Track whether checks are running so Retry can't double-trigger
  const running = useRef(false);

  // Fade-in on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    runChecks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runChecks = async () => {
    if (running.current) return;
    running.current = true;
    await performCheck('backend');
    await delay(300);
    await performCheck('node');
    await delay(300);
    await performCheck('db');
    await delay(300);
    await performCheck('encryption');
    running.current = false;
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const performCheck = async (key: keyof typeof checks) => {
    setChecks(prev => ({ ...prev, [key]: { ...prev[key], status: 'pending', error: '' } }));
    try {
      const res = await api.get('/api/health');
      const data = res.data;

      if (key === 'backend') {
        setChecks(prev => ({ ...prev, backend: { ...prev.backend, status: 'pass' } }));
      } else if (key === 'node') {
        const major = parseInt((data.nodeVersion as string).replace('v', '').split('.')[0]);
        if (major >= 20) {
          setChecks(prev => ({ ...prev, node: { ...prev.node, status: 'pass' } }));
        } else {
          setChecks(prev => ({ ...prev, node: { ...prev.node, status: 'fail', error: `Your Node.js version (${data.nodeVersion}) is too old. VIMO requires Node.js 20+. Download the latest version at nodejs.org.` } }));
          running.current = false;
          return;
        }
      } else if (key === 'db') {
        if (data.dbStatus === 'ok') {
          setChecks(prev => ({ ...prev, db: { ...prev.db, status: 'pass' } }));
        } else {
          setChecks(prev => ({ ...prev, db: { ...prev.db, status: 'fail', error: 'Database could not be read. Try deleting the packages/backend/data folder and restarting.' } }));
          running.current = false;
          return;
        }
      } else if (key === 'encryption') {
        if (data.encryptionKeySet) {
          setChecks(prev => ({ ...prev, encryption: { ...prev.encryption, status: 'pass' } }));
          setAllPassed(true);
          // Fetch richer system status
          try {
            const sysRes = await api.get('/api/system/status');
            setSystemStatus(sysRes.data);
          } catch { /* optional - system status may not be available pre-auth */ }
          // Give the user 1.2 s to see the success state
          await delay(1200);
          localStorage.setItem('hasPassedSystemCheck', 'true');

          if (isReset) {
            navigate('/setup?mode=reset', { replace: true });
            return;
          }

          // Auto-setup session so user lands on dashboard with onboarding overlay
          try {
            const autoPin = String(Math.floor(1000 + Math.random() * 9000));
            await api.post('/api/auth/setup', { pin: autoPin });
            const verifyRes = await api.post('/api/auth/verify', { pin: autoPin });
            localStorage.setItem('session_token', verifyRes.data.token);
            useAuthStore.getState().setAuth(verifyRes.data.token);
            navigate('/dashboard', { replace: true });
          } catch {
            navigate('/setup', { replace: true });
          }
        } else {
          setChecks(prev => ({ ...prev, encryption: { ...prev.encryption, status: 'fail', error: 'Your encryption key is not set. Open the .env file and change ENCRYPTION_KEY to any random 32-character string, then restart the app.' } }));
        }
      }
    } catch {
      if (key === 'backend') {
        setChecks(prev => ({ ...prev, backend: { ...prev.backend, status: 'fail', error: 'The backend server did not respond. Make sure you started the app with npm run dev or by double-clicking the Start VIMO script.' } }));
      } else {
        setChecks(prev => ({ ...prev, [key]: { ...prev[key as keyof typeof checks], status: 'fail', error: 'System check failed. Backend connection lost.' } }));
      }
      running.current = false;
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 transition-opacity duration-300"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-800 shadow-xl">
        <div className="bg-teal-600 p-8 text-white">
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <Bot className="h-8 w-8" />
            </div>
          </div>
          <p className="mt-6 text-center text-teal-50">
            {isReset ? 'Verifying system access before PIN reset.' : "We're making sure your local environment is ready for VIMO."}
          </p>
        </div>
        <div className="p-8">

        {/* Check items */}
        <div className="mt-10 space-y-5">
          {(Object.entries(checks) as [keyof typeof checks, typeof checks[keyof typeof checks]][]).map(([key, check]) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${check.status === 'fail' ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>
                  {check.label}
                </span>
                {check.status === 'pending'  && <RefreshCw  className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
                {check.status === 'pass'     && <CheckCircle2 className="h-5 w-5 text-[var(--green)]" />}
                {check.status === 'fail'     && <AlertCircle  className="h-5 w-5 text-red-500" />}
              </div>

              {check.error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                  {check.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            onClick={() => {
              setChecks({
                backend:    { status: 'pending', label: 'Backend server is running', error: '' },
                node:       { status: 'pending', label: 'Node.js version (v20+)', error: '' },
                db:         { status: 'pending', label: 'Database is ready', error: '' },
                encryption: { status: 'pending', label: 'Encryption is configured', error: '' },
              });
              setAllPassed(false);
              setSystemStatus(null);
              runChecks();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-500 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <a
            href="https://github.com/yourusername/vimo/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Get help on GitHub
          </a>
        </div>

        {/* Demo Mode — zero setup, see VIMO instantly */}
        <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Just want to look around?
          </p>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
            Try the Demo — a fully working sample brand with posts, analytics, and a content plan. No install, no keys.
          </p>
          <div className="mt-3 flex justify-center">
            <TryDemoButton variant="solid" />
          </div>
        </div>

        {/* All passed message */}
        {allPassed && systemStatus && (
          <div className="mt-8 rounded-lg bg-green-500/10 p-4 text-center text-sm text-green-500">
            All systems operational. Welcome to VIMO!
          </div>
        )}
        </div>
      </div>

      {/* Footer help */}
      <div className="mt-8 text-center">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          How to edit .env?
        </button>
        {showHelp && (
          <div className="mt-4 max-w-lg rounded-lg bg-slate-800 p-4 text-left text-sm text-[var(--text-secondary)]">
            <p>1. Open the <code className="rounded bg-slate-700 px-1 py-0.5 text-xs">.env</code> file in the root of the project.</p>
            <p className="mt-2">2. Find the <code className="rounded bg-slate-700 px-1 py-0.5 text-xs">ENCRYPTION_KEY</code> line.</p>
            <p className="mt-2">3. Change it to any random 32-character string, for example:</p>
            <code className="mt-2 block rounded bg-slate-700 p-2 text-xs">
              ENCRYPTION_KEY=my-super-secret-32-char-key!
            </code>
            <p className="mt-2">4. Save the file and restart the app.</p>
          </div>
        )}
      </div>
    </div>
  );
}

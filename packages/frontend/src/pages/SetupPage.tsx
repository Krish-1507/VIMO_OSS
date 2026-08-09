import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import api from '../lib/api';
import TryDemoButton from '../components/demo/TryDemoButton';

export default function SetupPage() {
  const [searchParams] = useSearchParams();
  const isReset = searchParams.get('mode') === 'reset';
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [codeHint, setCodeHint] = useState('');
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const addNotification = useUIStore((s) => s.addNotification);

  // Ask the server to mint a one-time code. The code is also printed in the
  // terminal running VIMO and saved next to the database; showing it here is
  // the same trust boundary, since anyone who can reach this screen already
  // has the session the server hands out.
  const handleRequestCode = async () => {
    setError('');
    setIsRequestingCode(true);
    try {
      const res = await api.post('/api/auth/reset-pin/request', {});
      setCodeRequested(true);
      setIssuedCode(res.data?.code || '');
      setCodeHint(
        res.data?.message ||
          'A reset code was printed in the terminal window running VIMO.',
      );
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 429
          ? 'Too many reset requests. Wait a minute and try again.'
          : err?.response?.data?.message ||
              err?.response?.data?.error ||
              'Could not request a reset code. Is the backend server running?',
      );
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4-8 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    if (isReset && !/^\d{8}$/.test(resetCode.trim())) {
      setError('Enter the 8-digit reset code from the VIMO terminal window.');
      return;
    }
    try {
      if (isReset) {
        await api.post('/api/auth/reset-pin', { pin, code: resetCode.trim() });
        clearAuth();
        addNotification('success', 'PIN Reset', 'Your PIN has been reset. Please log in with your new PIN.');
        navigate('/login');
      } else {
        await api.post('/api/auth/setup', { pin });
        const verifyRes = await api.post('/api/auth/verify', { pin });
        setAuth(verifyRes.data.token);
        addNotification('success', 'Setup complete', 'Welcome to VIMO!');
        navigate('/dashboard');
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        setError('Too many attempts. Wait a minute and try again.');
        return;
      }
      const serverMsg = err?.response?.data?.message || err?.response?.data?.error;
      const detail = err?.response?.data?.hint ? ` (${err?.response?.data?.hint})` : '';
      setError(serverMsg ? `${serverMsg}${detail}` : 'Setup failed. Is the backend server running?');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 animate-in fade-in duration-700">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <img src="/VIMO_logo.png" alt="VIMO" className="h-14 w-auto object-contain" />
        </div>
        <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {isReset ? 'Reset your PIN to regain access.' : 'Set a PIN to protect your installation.'}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              New PIN
            </label>
            <input
              type="password"
              maxLength={8}
              pattern="[0-9]*"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="4-8 digits"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Confirm New PIN
            </label>
            <input
              type="password"
              maxLength={8}
              pattern="[0-9]*"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="Repeat PIN"
            />
          </div>
          {isReset && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Reset code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={8}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 tracking-widest text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  placeholder="8 digits"
                />
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={isRequestingCode}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {isRequestingCode ? 'Sending…' : codeRequested ? 'Resend' : 'Send code'}
                </button>
              </div>
              {issuedCode && (
                <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-center dark:border-teal-900 dark:bg-teal-900/20">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400">
                    Your one-time reset code
                  </p>
                  <p
                    data-testid="issued-reset-code"
                    className="font-mono text-2xl font-bold tracking-[0.3em] text-teal-700 dark:text-teal-300"
                  >
                    {issuedCode}
                  </p>
                  <p className="mt-1 text-[11px] text-teal-700/70 dark:text-teal-300/70">
                    Valid for 10 minutes. It can be used once.
                  </p>
                </div>
              )}
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {codeRequested
                  ? codeHint
                  : 'Press "Send code". VIMO prints a one-time code in the terminal window it is running in.'}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-500 px-4 py-2 font-medium text-white transition hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            {isReset ? 'Reset PIN' : 'Get Started'}
          </button>
          {isReset && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
              >
                Back to login
              </button>
            </div>
          )}
        </form>

        {!isReset && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            <p className="text-xs text-slate-400">Not ready to set a PIN?</p>
            <TryDemoButton variant="solid" />
          </div>
        )}
      </div>
    </div>
  );
}

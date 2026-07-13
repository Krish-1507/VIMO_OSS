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
  const [confirmReset, setConfirmReset] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const addNotification = useUIStore((s) => s.addNotification);

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
    if (isReset && confirmReset !== 'RESET') {
      setError('Type RESET to confirm.');
      return;
    }
    try {
      if (isReset) {
        await api.post('/api/auth/reset-pin', { pin });
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
                Type <span className="font-bold">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={confirmReset}
                onChange={(e) => setConfirmReset(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                placeholder='Type "RESET"'
              />
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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import TryDemoButton from '../components/demo/TryDemoButton';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4-8 digits.');
      return;
    }
    try {
      const res = await api.post('/api/auth/verify', { pin });
      setAuth(res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Incorrect PIN');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 animate-in fade-in duration-700">
      <div
        className={`w-full max-w-sm rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800 p-8 shadow-2xl transition-all duration-300 ${shake ? 'animate-shake' : ''}`}
      >
        <div className="flex flex-col items-center mb-6">
          <img src="/VIMO_logo.png" alt="VIMO" className="h-14 w-auto object-contain" />
        </div>
        <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Enter your secure PIN to access Vibe Marketing Operations.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              maxLength={8}
              pattern="[0-9]*"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-lg tracking-widest text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="••••"
              autoFocus
            />
          </div>
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-500 px-4 py-2 font-medium text-white transition hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            Unlock
          </button>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/setup?mode=reset')}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
            >
              Forgot PIN?
            </button>
            <TryDemoButton />
          </div>
          <div className="mt-2 flex items-center gap-2 justify-center">
            <span className="text-xs text-slate-400">No setup needed —</span>
            <TryDemoButton variant="solid" />
          </div>
        </form>
      </div>
    </div>
  );
}

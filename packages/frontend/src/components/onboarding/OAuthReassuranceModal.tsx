import { useState } from 'react';
import { X, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  platform: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function OAuthReassuranceModal({ platform, onConfirm, onCancel }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem('oauthReassuranceSeen', 'true');
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Connecting to {platform} safely
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            VIMO will open {platform}'s official login page. This is safe. Here is exactly what VIMO will and will not be able to do:
          </p>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">
                CAN
              </h4>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Post content on your behalf
                </li>
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Read your post performance data
                </li>
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  See your comment list
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                CANNOT
              </h4>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  See your {platform} password
                </li>
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  Access your private messages (unless you enable DM features)
                </li>
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  Share your data with anyone
                </li>
                <li className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  Charge you money
                </li>
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dontShowAgain"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
            />
            <label htmlFor="dontShowAgain" className="text-sm text-slate-600 dark:text-slate-400">
              I understand, do not show this again
            </label>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleConfirm} className="flex-1" variant="primary">
              Continue to {platform}
            </Button>
            <Button onClick={onCancel} variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

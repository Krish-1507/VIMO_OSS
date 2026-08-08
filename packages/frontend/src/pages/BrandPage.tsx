import { useNavigate } from 'react-router-dom';
import OnboardingBrandSetup from '../components/onboarding/OnboardingBrandSetup';
import { useUIStore } from '../stores/uiStore';

export default function BrandPage() {
  const navigate = useNavigate();
  const addNotification = useUIStore((s) => s.addNotification);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-4 sm:px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          Your brand
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          VIMO learns how your brand sounds so every post feels like you.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 lg:p-8 dark:bg-slate-900">
        <div className="max-w-2xl">
          <OnboardingBrandSetup
            onComplete={() => {
              addNotification('success', 'Brand saved', 'Your brand profile is ready.');
              navigate('/dashboard');
            }}
          />
        </div>
      </main>
    </div>
  );
}

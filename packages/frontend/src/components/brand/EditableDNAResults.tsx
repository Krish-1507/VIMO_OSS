import { Palette, Type, MessageSquareText, Tag, Wand2, Eye, Sparkles,
  ArrowRight, Check, Loader2 } from 'lucide-react';

interface DNAResult {
  brandName?: string;
  tagline?: string;
  businessOverview?: string;
  brandValues?: string[];
  brandAesthetic?: string;
  toneOfVoice?: string;
  targetAudience?: string;
  uniqueSellingPoints?: string[];
  colors?: { primary?: string; secondary?: string; accent?: string };
  fonts?: { headings?: string; body?: string };
  industry?: string;
  visualStyleKeywords?: string[];
}

interface Props {
  dna: DNAResult;
  website?: { logoUrl?: string; brandColor?: string };
  onSave: () => Promise<void>;
  saving?: boolean;
}

export default function EditableDNAResults({ dna, website, onSave, saving }: Props) {
  const brandValues = dna.brandValues ?? [];
  const uniqueSellingPoints = dna.uniqueSellingPoints ?? [];
  const visualStyleKeywords = dna.visualStyleKeywords ?? [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Brand Identity Header */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
        <div className="flex items-center gap-3 mb-2">
          {website?.logoUrl && (
            <img src={website.logoUrl} alt="Brand logo"
              className="h-10 w-10 rounded-lg object-contain border border-slate-200 dark:border-slate-700" />
          )}
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {dna.brandName || 'Your Brand'}
            </h3>
            {dna.tagline && (
              <p className="text-xs text-slate-500 italic">"{dna.tagline}"</p>
            )}
          </div>
        </div>
        {dna.businessOverview && (
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {dna.businessOverview}
          </p>
        )}
      </div>

      {/* DNA Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Brand Values */}
        <DNACard icon={Tag} label="Brand Values" color="text-purple-500">
          <div className="flex flex-wrap gap-1.5">
            {brandValues.length > 0 ? brandValues.map((v: string, i: number) => (
              <span key={i} className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-900/20 px-2.5 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
                {v}
              </span>
            )) : (
              <span className="text-xs text-slate-400">Not detected</span>
            )}
          </div>
        </DNACard>

        {/* Color Palette */}
        <DNACard icon={Palette} label="Color Palette" color="text-purple-500">
          <div className="flex gap-2 flex-wrap">
            {['primary', 'secondary', 'accent'].filter(c => dna.colors?.[c as keyof typeof dna.colors]).length > 0 ? (
              ['primary', 'secondary', 'accent'].filter(c => dna.colors?.[c as keyof typeof dna.colors]).map((c) => (
                <div key={c} className="flex flex-col items-center gap-0.5">
                  <div className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                    style={{ backgroundColor: dna.colors![c as keyof typeof dna.colors] }} />
                  <span className="text-[9px] font-mono text-slate-500">{dna.colors![c as keyof typeof dna.colors]}</span>
                </div>
              ))
            ) : (
              <span className="text-xs text-slate-400">Not detected</span>
            )}
          </div>
        </DNACard>

        {/* Typography */}
        <DNACard icon={Type} label="Typography" color="text-purple-500">
          <div className="space-y-1">
            {dna.fonts?.headings ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-14">Headings:</span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 font-mono">{dna.fonts.headings}</span>
              </div>
            ) : null}
            {dna.fonts?.body ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-14">Body:</span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 font-mono">{dna.fonts.body}</span>
              </div>
            ) : null}
            {!dna.fonts?.headings && !dna.fonts?.body && (
              <span className="text-xs text-slate-400">Not detected</span>
            )}
          </div>
        </DNACard>

        {/* Tone of Voice */}
        <DNACard icon={MessageSquareText} label="Tone of Voice" color="text-purple-500">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {dna.toneOfVoice || 'Not detected'}
          </p>
        </DNACard>

        {/* Brand Aesthetic */}
        <DNACard icon={Wand2} label="Brand Aesthetic" color="text-purple-500">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {dna.brandAesthetic || 'Not detected'}
          </p>
        </DNACard>

        {/* Target Audience */}
        <DNACard icon={Eye} label="Target Audience" color="text-purple-500">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {dna.targetAudience || 'Not detected'}
          </p>
        </DNACard>

        {/* Unique Selling Points */}
        <DNACard icon={Sparkles} label="Unique Selling Points" color="text-purple-500" className="sm:col-span-2">
          <ul className="space-y-1">
            {uniqueSellingPoints.length > 0 ? uniqueSellingPoints.map((usp: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-purple-500" />
                {usp}
              </li>
            )) : (
              <li className="text-xs text-slate-400">Not detected</li>
            )}
          </ul>
        </DNACard>
      </div>

      {/* Visual Style Keywords */}
      {visualStyleKeywords.length > 0 && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-white">
            <Tag className="h-3.5 w-3.5 text-purple-500" />
            Visual Style
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visualStyleKeywords.map((kw: string, i: number) => (
              <span key={i} className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
        ) : (
          <><Check className="h-4 w-4" /> Save as Brand Profile</>
        )}
      </button>

      <p className="text-[10px] text-center text-slate-400">
        You can review and edit any field after saving from the brand profile list.
      </p>
    </div>
  );
}

function DNACard({ icon: Icon, label, color, children, className }: {
  icon: any; label: string; color: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-1.5 ${className || ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-900 dark:text-white">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        {label}
      </div>
      {children}
    </div>
  );
}

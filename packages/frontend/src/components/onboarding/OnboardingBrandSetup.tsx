import { useState } from 'react';
import axios from 'axios';

const INDUSTRIES = ['Technology', 'E-commerce', 'Health & Wellness', 'Food & Beverage', 'Finance', 'Education', 'Creative/Agency', 'Other'];
const TONE_CHIPS = ['Professional', 'Casual', 'Bold', 'Playful', 'Authoritative', 'Friendly', 'Inspirational', 'Humorous'];

interface Props {
  onComplete: () => void;
}

export default function OnboardingBrandSetup({ onComplete }: Props) {
  const [mode, setMode] = useState<'choice' | 'url' | 'manual'>('choice');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dnaResult, setDnaResult] = useState<any>(null);

  // Manual form states
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [tones, setTones] = useState<string[]>([]);
  const [examples, setExamples] = useState<string[]>(['']);
  const [manualWebsite, setManualWebsite] = useState('');

  const toggleTone = (t: string) => {
    if (tones.includes(t)) {
      setTones((prev) => prev.filter((x) => x !== t));
    } else if (tones.length < 4) {
      setTones((prev) => [...prev, t]);
    }
  };

  const addExample = () => {
    if (examples.length < 5) {
      setExamples((prev) => [...prev, '']);
    }
  };

  const updateExample = (idx: number, value: string) => {
    const updated = [...examples];
    updated[idx] = value;
    setExamples(updated);
  };

  async function handleAnalyzeURL() {
    if (!url) return;
    setLoading(true);
    setError('');
    setDnaResult(null);
    try {
      const res = await axios.post('/api/brand-profiles/analyze-dna', { url });
      setDnaResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Analysis failed. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveFromURL() {
    if (!dnaResult?.dna) return;
    setLoading(true);
    try {
      await axios.post('/api/brand-profiles', {
        name: dnaResult.dna.brandName || 'New Brand',
        industry: dnaResult.dna.industry || '',
        audience: dnaResult.dna.targetAudience || '',
        website: url,
        toneKeywords: dnaResult.dna.toneOfVoice ? [dnaResult.dna.toneOfVoice] : [],
        examplePosts: [],
      });
      onComplete();
    } catch {
      setError('Failed to save brand profile.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveManual() {
    if (!name || !industry || !audience) return;
    setLoading(true);
    try {
      await axios.post('/api/brand-profiles', {
        name,
        industry,
        audience,
        website: manualWebsite || undefined,
        toneKeywords: tones,
        examplePosts: examples.filter(Boolean),
      });
      onComplete();
    } catch {
      alert('Failed to save brand profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {mode === 'choice' && (
        <>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Set up your brand
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Google Pomelli-style: VIMO learns your brand DNA to create on-brand content.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('url')}
              className="p-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all text-left group"
            >
              <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analyze Website</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Enter your website URL. VIMO automatically extracts your brand colors, fonts, tone, and values.
              </p>
            </button>
            <button
              onClick={() => setMode('manual')}
              className="p-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-all text-left group"
            >
              <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <svg className="h-4 w-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Start from Scratch</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                No website? No problem. Enter your brand details manually.
              </p>
            </button>
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Pomelli-style: Your brand DNA powers all content VIMO creates. Set it up once, generate anywhere.
            </p>
          </div>
        </>
      )}

      {mode === 'url' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Enter your website URL</h3>
            <button onClick={() => { setMode('choice'); setDnaResult(null); setError(''); }} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Back
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeURL()}
              placeholder="https://example.com"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
            <button
              onClick={handleAnalyzeURL}
              disabled={loading || !url}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>

          {loading && !dnaResult && (
            <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Extracting brand DNA from website...</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {dnaResult && !loading && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-purple-50/50 dark:bg-purple-900/10 space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Brand DNA Extracted
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  VIMO analyzed your website and identified your brand identity. Review the details below.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  {dnaResult.website?.logoUrl && (
                    <img src={dnaResult.website.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain border border-slate-200 dark:border-slate-600" />
                  )}
                  <div>
                    <p className="text-base font-bold text-slate-900 dark:text-white">{dnaResult.dna.brandName || 'Your Brand'}</p>
                    {dnaResult.dna.businessOverview && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{dnaResult.dna.businessOverview}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {dnaResult.dna.brandValues?.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] font-medium text-slate-500 uppercase mb-1">Values</p>
                      <div className="flex flex-wrap gap-1">
                        {dnaResult.dna.brandValues.map((v: string, i: number) => (
                          <span key={i} className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300">{v}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {dnaResult.dna.colors?.primary && (
                    <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] font-medium text-slate-500 uppercase mb-1">Colors</p>
                      <div className="flex gap-1.5">
                        {['primary', 'secondary', 'accent'].filter(c => dnaResult.dna.colors?.[c]).map((c) => (
                          <div key={c} className="flex flex-col items-center gap-0.5">
                            <div className="h-6 w-6 rounded border border-slate-200" style={{ backgroundColor: dnaResult.dna.colors[c] }} />
                            <span className="text-[8px] font-mono text-slate-400">{dnaResult.dna.colors[c]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {dnaResult.dna.toneOfVoice && (
                  <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Tone:</span> {dnaResult.dna.toneOfVoice}</p>
                )}
                {dnaResult.dna.targetAudience && (
                  <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-medium text-slate-700 dark:text-slate-300">Audience:</span> {dnaResult.dna.targetAudience}</p>
                )}
              </div>

              <button
                onClick={handleSaveFromURL}
                disabled={loading}
                className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {loading ? 'Saving...' : 'Save Brand & Continue'}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Brand Details</h3>
            <button onClick={() => { setMode('choice'); setError(''); }} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Back
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Brand Name *</label>
            <input
              type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="Your brand name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Industry *</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Target Audience *</label>
            <input
              type="text" value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="e.g. Startup founders aged 25-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Website (optional)</label>
            <input
              type="url" value={manualWebsite}
              onChange={(e) => setManualWebsite(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tone (select up to 4)</label>
            <div className="flex flex-wrap gap-1.5">
              {TONE_CHIPS.map((t) => (
                <button key={t} onClick={() => toggleTone(t)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    tones.includes(t)
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Example Posts</label>
            <div className="space-y-1.5">
              {examples.map((ex, i) => (
                <textarea key={i} rows={2} value={ex}
                  onChange={(e) => updateExample(i, e.target.value)}
                  placeholder={`Example post ${i + 1}`}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              ))}
              {examples.length < 5 && (
                <button onClick={addExample} className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">+ Add another</button>
              )}
            </div>
          </div>

          <button
            onClick={handleSaveManual}
            disabled={!name || !industry || !audience || loading}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Brand & Continue'}
          </button>
        </div>
      )}
    </div>
  );
}

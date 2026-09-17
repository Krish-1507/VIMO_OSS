import { useState, useEffect } from 'react';
import {
  Loader2,
  Download,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import api from '../../lib/api';
import { useBrandStore } from '../../stores/brandStore';

const POLLINATIONS_IMAGE_URL = 'https://image.pollinations.ai/prompt';

// Aspect ratio → platform so brand sizing matches where the visual will live.
const RATIO_PLATFORM: Record<string, string> = {
  '1:1': 'instagram',
  '9:16': 'tiktok',
  '16:9': 'youtube',
  '4:3': 'facebook',
  '3:2': 'pinterest',
};

const VISUAL_STYLES = [
  { id: 'authentic', label: 'Authentic (real, candid)' },
  { id: 'minimal', label: 'Minimal (clean design)' },
  { id: 'bold', label: 'Bold (punchy ads)' },
] as const;

const ASPECT_RATIOS: { key: string; label: string; width: number; height: number }[] = [
  { key: '1:1', label: 'Square (1:1)', width: 1024, height: 1024 },
  { key: '16:9', label: 'Landscape (16:9)', width: 1920, height: 1080 },
  { key: '9:16', label: 'Portrait (9:16)', width: 1080, height: 1920 },
  { key: '4:3', label: 'Classic (4:3)', width: 1024, height: 768 },
  { key: '3:2', label: 'Photo (3:2)', width: 1200, height: 800 },
];

export default function PollinationsImageStudio() {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandStyling, setBrandStyling] = useState(true);
  const [visualStyle, setVisualStyle] = useState<'authentic' | 'minimal' | 'bold'>('authentic');
  const [styledWith, setStyledWith] = useState<string | null>(null);
  const profiles = useBrandStore((s) => s.profiles);
  const selectedId = useBrandStore((s) => s.selectedId);
  const activeBrand = profiles.find((p) => p.id === selectedId) || profiles[0] || null;

  useEffect(() => {
    useBrandStore.getState().fetchProfiles();
  }, []);

  // Resolve the final prompt: raw idea, or brand-directed via the backend
  // (brand DNA + craft + anti-slop negatives). Always falls back to raw.
  async function resolvePrompt(): Promise<{ text: string; styled: string | null }> {
    const raw = prompt.trim();
    if (!brandStyling || !activeBrand) return { text: raw, styled: null };
    try {
      const res = await api.post('/api/media/enhance-prompt', {
        prompt: raw,
        brandProfileId: activeBrand.id,
        platform: RATIO_PLATFORM[aspectRatio] || 'instagram',
        style: visualStyle,
        kind: 'image',
      });
      if (res.data?.prompt) return { text: res.data.prompt, styled: activeBrand.name };
    } catch (err) {
      console.warn('[vimo] brand styling failed, using raw prompt:', err);
    }
    return { text: raw, styled: null };
  }

  function getImageUrl(promptText: string, ratio: string): string {
    const ratioDef = ASPECT_RATIOS.find((r) => r.key === ratio) || ASPECT_RATIOS[0];
    const encoded = encodeURIComponent(promptText.slice(0, 1500));
    const seed = Math.floor(Math.random() * 100000);
    return `${POLLINATIONS_IMAGE_URL}/${encoded}?width=${ratioDef.width}&height=${ratioDef.height}&seed=${seed}&nologo=true`;
  }

  async function handleGenerate() {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const { text, styled } = await resolvePrompt();
      setImageUrl(getImageUrl(text, aspectRatio));
      setStyledWith(styled);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `vimo-pollinations-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
  }

  async function handleRegenerate() {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const { text, styled } = await resolvePrompt();
      setImageUrl(getImageUrl(text, aspectRatio));
      setStyledWith(styled);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          <span>Powered by <strong>Pollinations.ai</strong> — free AI image generation, no API key needed</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Image Description</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic scene of a person using a smartphone with glowing social media icons floating around, cyberpunk style, neon purple and blue lighting..."
          rows={3}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {ASPECT_RATIOS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Style</label>
          <select
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value as 'authentic' | 'minimal' | 'bold')}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {VISUAL_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {activeBrand && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 dark:border-teal-900/40 dark:bg-teal-950/20">
          <input
            type="checkbox"
            checked={brandStyling}
            onChange={(e) => setBrandStyling(e.target.checked)}
            className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-xs text-teal-800 dark:text-teal-300">
            Style with my <strong>{activeBrand.name}</strong> brand DNA — colors, aesthetic, no AI-slop look
          </span>
        </label>
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {isGenerating ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Generate Image
          </span>
        )}
      </button>

      {styledWith && imageUrl && (
        <p className="flex items-center gap-1.5 text-[11px] text-teal-700 dark:text-teal-400">
          <Check className="h-3.5 w-3.5" />
          Styled with your {styledWith} brand DNA
        </p>
      )}

      {imageUrl && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <img
              src={imageUrl}
              alt={prompt}
              className="w-full object-contain"
              style={{ maxHeight: 480 }}
              onError={() => setImageUrl(null)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRegenerate}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </button>
            <button
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

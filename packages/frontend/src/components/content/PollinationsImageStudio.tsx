import { useState } from 'react';
import {
  Loader2,
  Download,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';

const POLLINATIONS_IMAGE_URL = 'https://image.pollinations.ai/prompt';

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

  function getImageUrl(promptText: string, ratio: string): string {
    const ratioDef = ASPECT_RATIOS.find((r) => r.key === ratio) || ASPECT_RATIOS[0];
    const encoded = encodeURIComponent(promptText.slice(0, 400));
    const seed = Math.floor(Math.random() * 100000);
    return `${POLLINATIONS_IMAGE_URL}/${encoded}?width=${ratioDef.width}&height=${ratioDef.height}&seed=${seed}&nologo=true`;
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    const url = getImageUrl(prompt.trim(), aspectRatio);
    setImageUrl(url);
    setIsGenerating(false);
  }

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `vimo-pollinations-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
  }

  function handleRegenerate() {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    const seed = Math.floor(Math.random() * 100000);
    const ratioDef = ASPECT_RATIOS.find((r) => r.key === aspectRatio) || ASPECT_RATIOS[0];
    const encoded = encodeURIComponent(prompt.trim().slice(0, 400));
    const url = `${POLLINATIONS_IMAGE_URL}/${encoded}?width=${ratioDef.width}&height=${ratioDef.height}&seed=${seed}&nologo=true`;
    setImageUrl(url);
    setIsGenerating(false);
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
      </div>

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

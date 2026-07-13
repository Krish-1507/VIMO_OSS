import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Loader2,
  Music,
  Clock,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  X,
  Upload,
  Film,
  Sparkles,
  Image as ImageIcon,
  Square,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { socket } from '../../lib/socket';
import { BACKEND_URL } from '../../config/backendPort';
import { useUIStore } from '../../stores/uiStore';

const API_BASE = import.meta.env.VITE_API_URL || BACKEND_URL;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface HiggsfieldJob {
  id: string;
  connectorId: string;
  brandProfileId: string;
  jobId: string;
  prompt: string;
  aspectRatio: string;
  duration: number;
  style: string;
  referenceImageUrl?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  localFilePath?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

interface HiggsfieldStyle {
  id: string;
  name: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  description?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function HiggsfieldStudio() {
  const addNotification = useUIStore((s) => s.addNotification);

  // Auth — use refs for latest values to avoid stale closures
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const brandIdRef = useRef('');
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const connectorIdRef = useRef<string | null>(null);

  // Form
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [duration, setDuration] = useState(6);
  const [selectedStyle, setSelectedStyle] = useState<string>('cinematic');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');

  // Styles
  const [styles, setStyles] = useState<HiggsfieldStyle[]>([]);
  const [isLoadingStyles, setIsLoadingStyles] = useState(false);

  // Jobs
  const [jobs, setJobs] = useState<HiggsfieldJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingRef, setUploadingRef] = useState(false);

  // Generate button ref for external focus
  const generateBtnRef = useRef<HTMLButtonElement>(null);

  // Keep refs in sync with state
  useEffect(() => { brandIdRef.current = selectedBrandId; }, [selectedBrandId]);
  useEffect(() => { connectorIdRef.current = connectorId; }, [connectorId]);

  // Listen for prefill events from the Reels Script integration
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.prompt) {
        setPrompt(e.detail.prompt);
        setTimeout(() => generateBtnRef.current?.focus(), 300);
      }
    };
    window.addEventListener('higgsfield:prefill' as any, handler as any);
    return () => window.removeEventListener('higgsfield:prefill' as any, handler as any);
  }, []);

  // Initialize: fetch brand profile → get brand ID → fetch connector, jobs, styles
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const brandId = await fetchBrandProfiles();
      if (cancelled || !brandId) return;
      const cId = await fetchConnectorId();
      if (cancelled) return;
      setSelectedBrandId(brandId);
      brandIdRef.current = brandId;
      setConnectorId(cId);
      connectorIdRef.current = cId;
      await Promise.all([
        fetchJobsForBrand(brandId),
        cId ? fetchStylesForConnector(cId) : Promise.resolve(),
      ]);
    })();
    return () => { cancelled = true; };
  }, []);

  // Socket listeners
  useEffect(() => {
    const handleJobStarted = () => {
      addNotification('info', 'Video Generation Started', 'Your video is being generated...');
      const bId = brandIdRef.current;
      if (bId) fetchJobsForBrand(bId);
    };

    const handleProgress = (data: { jobId: string; status: string; progressPercent?: number }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.jobId ? { ...j, status: data.status as HiggsfieldJob['status'] } : j,
        ),
      );
    };

    const handleComplete = (data: { jobId: string; localVideoPath?: string; thumbnailUrl?: string; error?: string }) => {
      if (data.error) {
        addNotification('error', 'Video Generation Failed', data.error);
      } else {
        addNotification('success', 'Your video is ready!', 'The AI-generated video has finished processing.');
      }
      const bId = brandIdRef.current;
      if (bId) fetchJobsForBrand(bId);
    };

    socket.on('higgsfield:job_started', handleJobStarted);
    socket.on('higgsfield:progress', handleProgress);
    socket.on('higgsfield:complete', handleComplete);

    return () => {
      socket.off('higgsfield:job_started', handleJobStarted);
      socket.off('higgsfield:progress', handleProgress);
      socket.off('higgsfield:complete', handleComplete);
    };
  }, [addNotification]);

  /* ── Data Fetching (all take explicit params, never read stale state) ── */

  const fetchBrandProfiles = async (): Promise<string> => {
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/brand-profiles`, {
        headers: { 'x-session-token': token },
      });
      const profiles = res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
      return profiles[0]?.id ?? '';
    } catch {
      return '';
    }
  };

  const fetchConnectorId = async (): Promise<string | null> => {
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/connectors`, {
        headers: { 'x-session-token': token },
      });
      const hf = (res.data as any[]).find(
        (c: any) => c.provider === 'higgsfield' && c.status === 'active',
      );
      return hf?.id ?? null;
    } catch {
      return null;
    }
  };

  const fetchStylesForConnector = async (cId: string) => {
    setIsLoadingStyles(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/higgsfield/styles`, {
        params: { connectorId: cId },
        headers: { 'x-session-token': token },
      });
      setStyles(Array.isArray(res.data) ? res.data : []);
    } catch {
      setStyles([]);
    } finally {
      setIsLoadingStyles(false);
    }
  };

  const fetchJobsForBrand = async (bId: string) => {
    if (!bId) return;
    setIsLoadingJobs(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/higgsfield/jobs`, {
        params: { brandProfileId: bId },
        headers: { 'x-session-token': token },
      });
      setJobs(Array.isArray(res.data) ? res.data : []);
    } catch {
      setJobs([]);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  /* ── Media Upload ── */

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addNotification('error', 'Invalid file', 'Please upload an image file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      addNotification('error', 'File too large', 'Maximum image size is 20MB.');
      return;
    }
    setUploadingRef(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${API_BASE}/api/media/upload`, formData, {
        headers: { 'x-session-token': token },
      });
      setReferenceImageUrl(res.data.url);
      addNotification('success', 'Image uploaded', 'Reference image attached to generation.');
    } catch {
      addNotification('error', 'Upload failed', 'Could not upload the reference image.');
    } finally {
      setUploadingRef(false);
    }
  };

  /* ── Generate ── */

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!connectorIdRef.current) {
      addNotification('error', 'Not Connected', 'Connect a Higgsfield AI connector in Connector Hub first.');
      return;
    }
    if (!brandIdRef.current) return;

    setIsGenerating(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.post(
        `${API_BASE}/api/higgsfield/generate`,
        {
          prompt: prompt.trim(),
          aspectRatio,
          duration,
          style: selectedStyle,
          referenceImageUrl: referenceImageUrl || undefined,
          connectorId: connectorIdRef.current,
          brandProfileId: brandIdRef.current,
        },
        { headers: { 'x-session-token': token } },
      );
      if (res.data?.jobId) {
        addNotification('info', 'Video Queued', `Job ${res.data.jobId.slice(0, 8)}... queued.`);
        fetchJobsForBrand(brandIdRef.current);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Generation request failed.';
      addNotification('error', 'Generation Failed', msg);
    } finally {
      setIsGenerating(false);
    }
  };

  /* ── Helpers ── */

  const estimatedCost = duration * 0.05;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <Clock className="h-3 w-3" /> Queued
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {status}
          </span>
        );
    }
  };

  /* ── Render ── */

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ─── Left Panel: Generation Form ─── */}
      <div className="w-full lg:w-[400px] shrink-0 space-y-5">
        {/* Prompt */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Video Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video you want to create. Be cinematic. Example: A founder walking through their office at golden hour, confident, looking directly at camera, with soft ambient lighting and shallow depth of field."
            rows={5}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
          />
        </div>

        {/* Style Selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Cinematic Style
          </label>
          {isLoadingStyles ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading styles...
            </div>
          ) : styles.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {styles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`relative overflow-hidden rounded-lg border p-2 text-left transition-all ${
                    selectedStyle === style.id
                      ? 'border-teal-500 ring-2 ring-teal-400/30 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  {(style.previewUrl || style.thumbnailUrl) && (
                    <img
                      src={style.previewUrl || style.thumbnailUrl}
                      alt={style.name}
                      className="mb-1.5 h-12 w-full rounded object-cover"
                    />
                  )}
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {style.name}
                  </div>
                  {style.description && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {style.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {['cinematic', 'documentary', 'social_media', 'anime', 'film_noir'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedStyle(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selectedStyle === s
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Aspect Ratio
          </label>
          <div className="flex gap-2">
            {([
              { value: '9:16' as const, label: '9:16', icon: Smartphone, desc: 'Reels / TikTok' },
              { value: '16:9' as const, label: '16:9', icon: Monitor, desc: 'Horizontal' },
              { value: '1:1' as const, label: '1:1', icon: Square, desc: 'Square' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAspectRatio(opt.value)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all ${
                  aspectRatio === opt.value
                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <opt.icon className="h-5 w-5" />
                <span className="font-medium">{opt.label}</span>
                <span className="text-[10px] opacity-70">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Duration Slider */}
        <div>
          <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
            <span>Duration</span>
            <span className="text-xs text-slate-400">{duration}s</span>
          </label>
          <input
            type="range"
            min={3}
            max={10}
            step={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-teal-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>3s</span>
            <span>10s</span>
          </div>
        </div>

        {/* Reference Image Upload */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Reference Image <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          {referenceImageUrl ? (
            <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 dark:border-teal-900 dark:bg-teal-950/30">
              <div className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-300">
                <ImageIcon className="h-4 w-4" />
                <span className="truncate max-w-[200px]">Reference image attached</span>
              </div>
              <button
                onClick={() => setReferenceImageUrl('')}
                className="rounded-full p-1 text-teal-600 hover:bg-teal-100 dark:text-teal-400 dark:hover:bg-teal-900/50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-4 text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-teal-500"
            >
              {uploadingRef ? (
                <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>Drop an image to animate it</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* Generate Button */}
        <div>
          <button
            ref={generateBtnRef}
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim() || !connectorId}
            className="w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4" /> Generate Video
              </span>
            )}
          </button>
          <p className="mt-1 text-center text-[10px] text-slate-400">
            Estimated cost: ${estimatedCost.toFixed(2)} (estimate only)
          </p>
          {!connectorId && (
            <p className="mt-1 text-center text-[10px] text-amber-600 dark:text-amber-400">
              Connect Higgsfield AI in Connector Hub to generate videos.
            </p>
          )}
        </div>
      </div>

      {/* ─── Right Panel: Generation Queue ─── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Generation Queue
          </h3>
          <button
            onClick={() => fetchJobsForBrand(brandIdRef.current)}
            className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            Refresh
          </button>
        </div>

        {isLoadingJobs ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 dark:border-slate-700">
            <Film className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
              No video generations yet
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Describe your video and click Generate to start.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.slice(0, 20).map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">
                    {job.prompt.length > 60 ? job.prompt.slice(0, 60) + '...' : job.prompt}
                  </p>
                  {getStatusBadge(job.status)}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-slate-400 flex items-center justify-center text-[8px] font-bold">
                      {job.aspectRatio === '9:16' ? 'V' : job.aspectRatio === '16:9' ? 'H' : 'S'}
                    </span>
                    {job.aspectRatio}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {job.duration}s
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Music className="h-3 w-3" /> {job.style}
                  </span>
                </div>

                {/* Video Player for completed jobs */}
                {job.status === 'completed' && job.localFilePath && (
                  <div className="mt-2 mb-3">
                    <video
                      src={`${API_BASE}/api/higgsfield/video/${job.id}`}
                      controls
                      className="w-full max-h-[200px] rounded-lg bg-black object-contain"
                      preload="metadata"
                    >
                      Your browser does not support the video element.
                    </video>

                    {/* Action buttons for completed videos */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const params = new URLSearchParams();
                          params.set('topic', job.prompt);
                          params.set('platform', 'instagram');
                          params.set('brandProfileId', job.brandProfileId);
                          window.location.href = `/content?${params.toString()}`;
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                      >
                        <Sparkles className="h-3 w-3" /> Use in Content Studio
                      </button>
                      <button
                        onClick={() => {
                          window.location.href = `/scheduler?mediaUrl=${API_BASE}/api/higgsfield/video/${job.id}&platform=instagram&topic=${encodeURIComponent(job.prompt)}`;
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-900/30"
                      >
                        <Calendar className="h-3 w-3" /> Schedule as Reel
                      </button>
                      <a
                        href={`${API_BASE}/api/higgsfield/video/${job.id}`}
                        download
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <Download className="h-3 w-3" /> Download
                      </a>
                    </div>
                  </div>
                )}

                {/* Error message for failed jobs */}
                {job.status === 'failed' && job.errorMessage && (
                  <div className="mt-2 rounded-lg bg-red-50 p-2 dark:bg-red-950/30">
                    <p className="text-[10px] text-red-600 dark:text-red-400">{job.errorMessage}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: prefilled trigger from Reels Script                       */
/* ------------------------------------------------------------------ */

export function prefillHiggsfieldPrompt(promptText: string) {
  window.dispatchEvent(
    new CustomEvent('higgsfield:prefill', { detail: { prompt: promptText } }),
  );
}

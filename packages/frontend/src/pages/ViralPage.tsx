import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, Sparkles, Download, Calendar, Film } from 'lucide-react';
import { socket } from '../lib/socket';
import { useUIStore } from '../stores/uiStore';
import { BACKEND_URL } from '../config/backendPort';
import { useBrandStore } from '../stores/brandStore';

const API_BASE = import.meta.env.VITE_API_URL || BACKEND_URL;
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm'];

interface ViralClip {
  clipNumber: number;
  filename: string;
  clipUrl: string;
  viralityScore: number;
  clipType: 'insight' | 'funny' | 'surprising' | 'emotional' | 'educational' | 'controversial';
  hookText: string;
  reason: string;
  startTime: number;
  endTime: number;
  brandProfileId: string;
}

interface ViralJob {
  id: string;
  videoPath: string;
  filename: string;
  status: string;
  transcript: string;
  moments: Array<{
    startTime: number;
    endTime: number;
    hookText: string;
    viralityScore: number;
    reason: string;
    clipType: ViralClip['clipType'];
  }>;
  clips: ViralClip[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  transcribing: 'Transcribing',
  detecting_moments: 'Detecting moments',
  extracting_clips: 'Extracting clips',
  completed: 'Done',
  failed: 'Failed',
};

const STATUS_PROGRESS: Record<string, number> = {
  queued: 5,
  transcribing: 20,
  detecting_moments: 45,
  extracting_clips: 75,
  completed: 100,
  failed: 100,
};

function formatRelativeTime(value: string): string {
  const date = new Date(value).getTime();
  const diffMinutes = Math.max(Math.round((Date.now() - date) / 60000), 0);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function formatDuration(start: number, end: number): string {
  const totalSeconds = Math.max(Math.round(end - start), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 50) return 'text-amber-500 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

export default function ViralPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const addNotification = useUIStore((state) => state.addNotification);

  const { profiles: brandProfiles, selectedId: selectedBrand, setSelectedId: setSelectedBrand, fetchProfiles: fetchBrandProfiles } = useBrandStore();
  const [jobs, setJobs] = useState<ViralJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progressByJob, setProgressByJob] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchBrandProfiles();
    void fetchJobs();

    if (!socket.connected) {
      socket.connect();
    }

    const onProgress = (event: { jobId: string; progress: number }) => {
      setProgressByJob((current) => ({
        ...current,
        [event.jobId]: event.progress,
      }));
      void fetchJobs();
    };

    const onComplete = (event: { jobId: string }) => {
      setProgressByJob((current) => ({
        ...current,
        [event.jobId]: 100,
      }));
      void fetchJobs();
    };

    socket.on('viral:progress', onProgress);
    socket.on('viral:complete', onComplete);

    const interval = window.setInterval(() => {
      void fetchJobs();
    }, 5000);

    return () => {
      socket.off('viral:progress', onProgress);
      socket.off('viral:complete', onComplete);
      window.clearInterval(interval);
    };
  }, []);

  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === 'completed' && job.clips.length > 0),
    [jobs]
  );

  async function fetchJobs() {
    try {
      const token = localStorage.getItem('session_token') || '';
      const response = await axios.get(`${API_BASE}/api/viral/jobs`, {
        headers: { 'x-session-token': token },
      });
      setJobs(response.data);
    } catch {
      // ignore background refresh failures
    }
  }

  async function uploadFile(file: File) {
    const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      addNotification('error', 'Unsupported file', 'Upload an .mp4, .mov, or .webm video.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      addNotification('error', 'File too large', 'The upload limit is 2GB per video.');
      return;
    }

    if (!selectedBrand) {
      addNotification('error', 'Select a brand', 'Choose a brand profile before uploading a video.');
      return;
    }

    const formData = new FormData();
    formData.append('video', file);
    formData.append('brandProfileId', selectedBrand);

    setUploading(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const response = await axios.post(`${API_BASE}/api/viral/upload`, formData, {
        headers: {
          'x-session-token': token,
        },
      });
      const jobId = response.data.jobId as string;
      setProgressByJob((current) => ({ ...current, [jobId]: 5 }));
      addNotification('success', 'Upload started', 'Viral Studio is transcribing and clipping your video.');
      await fetchJobs();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to upload the video.';
      addNotification('error', 'Upload failed', message);
    } finally {
      setUploading(false);
    }
  }

  function handleScheduleClip(job: ViralJob, clip: ViralClip) {
    const params = new URLSearchParams({
      prefill: 'viral',
      autogenerate: '1',
      brandProfileId: clip.brandProfileId || selectedBrand || '',
      platform: 'tiktok',
      topic: `Create a short-form caption for this clip hook: ${clip.hookText}`,
      additionalContext: `Clip type: ${clip.clipType}. Virality score: ${clip.viralityScore}. Reason: ${clip.reason}. Video source: ${job.filename}. Duration: ${formatDuration(clip.startTime, clip.endTime)}.`,
      mediaUrl: `${API_BASE}${clip.clipUrl}`,
    });
    navigate(`/content?${params.toString()}`);
  }

  function getJobProgress(job: ViralJob): number {
    return progressByJob[job.id] ?? STATUS_PROGRESS[job.status] ?? 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Viral Studio</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Turn long-form video into short-form clips built for TikTok, Reels, and Shorts.
          </p>
        </div>
        <div className="w-72">
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Profile</label>
          <select
            value={selectedBrand || ''}
            onChange={(event) => setSelectedBrand(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {brandProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void uploadFile(file);
          }
        }}
        className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white p-8 text-center transition ${
          isDragging
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
            : 'border-slate-300 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.webm"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void uploadFile(file);
            }
            event.target.value = '';
          }}
        />
        {uploading ? (
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-teal-500" />
        ) : (
          <Upload className="mb-4 h-12 w-12 text-teal-500" />
        )}
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Drop your video here or click to upload
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Supports `.mp4`, `.mov`, `.webm` up to 2GB.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <Film className="h-5 w-5 text-teal-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Active Jobs</h2>
        </div>
        <div className="space-y-3">
          {jobs.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No viral processing jobs yet.</p>
          )}
          {jobs.map((job) => {
            const progress = getJobProgress(job);
            return (
              <div
                key={job.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{job.filename}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {STATUS_LABELS[job.status] || job.status} • {formatRelativeTime(job.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      job.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : job.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}
                  >
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      job.status === 'failed' ? 'bg-red-500' : 'bg-teal-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {completedJobs.map((job) => (
        <section
          key={job.id}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{job.filename}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {job.clips.length} clips extracted • ready to download or schedule
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-teal-500" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {job.clips.map((clip) => (
              <div
                key={clip.filename}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Clip {clip.clipNumber}
                    </p>
                    <p className={`text-3xl font-bold ${getScoreColor(clip.viralityScore)}`}>
                      {clip.viralityScore}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {clip.clipType}
                  </span>
                </div>

                <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">{clip.hookText}</p>
                <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{clip.reason}</p>
                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                  {formatDuration(clip.startTime, clip.endTime)} vertical clip
                </p>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={`${API_BASE}${clip.clipUrl}`}
                    download={clip.filename}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="h-4 w-4" />
                    Extract this clip
                  </a>
                  <button
                    onClick={() => handleScheduleClip(job, clip)}
                    className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
                  >
                    <Calendar className="h-4 w-4" />
                    Schedule this clip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

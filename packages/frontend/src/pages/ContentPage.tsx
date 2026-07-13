import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import {
  Instagram,
  Linkedin,
  Twitter,
  Youtube,
  Facebook,
  PinIcon,
  MessageSquare,
  Globe,
  Loader2,
  Copy,
  Edit3,
  Calendar,
  RefreshCw,
  Send,
  Upload,
  Image,
  X,
  FileVideo,
  Music,
  Clock,
  Zap,
  AlertTriangle,
  Mic,
  LayoutDashboard,
  BookOpen,
  Film,
  PenTool,
  CheckCircle2,
} from 'lucide-react';
import InfoTooltip from '../components/ui/InfoTooltip';
import ExplainabilityTooltip from '../components/ui/ExplainabilityTooltip';
import FirstTimeCallout from '../components/ui/FirstTimeCallout';
import { BACKEND_URL } from '../config/backendPort';
import { useUIStore } from '../stores/uiStore';
import { useBrandStore } from '../stores/brandStore';
import HiggsfieldStudio, { prefillHiggsfieldPrompt } from '../components/content/HiggsfieldStudio';
import PollinationsImageStudio from '../components/content/PollinationsImageStudio';

const API_BASE = import.meta.env.VITE_API_URL || BACKEND_URL;

const platforms = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram, color: 'bg-pink-500' },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin, color: 'bg-teal-700' },
  { key: 'twitter', label: 'X', Icon: Twitter, color: 'bg-slate-900' },
  { key: 'tiktok', label: 'TikTok', Icon: () => <span className="text-sm font-bold">TT</span>, color: 'bg-coral-500' },
  { key: 'youtube', label: 'YouTube', Icon: Youtube, color: 'bg-red-600' },
  { key: 'facebook', label: 'Facebook', Icon: Facebook, color: 'bg-blue-600' },
  { key: 'pinterest', label: 'Pinterest', Icon: PinIcon, color: 'bg-red-700' },
  { key: 'reddit', label: 'Reddit', Icon: MessageSquare, color: 'bg-orange-500' },
  { key: 'bluesky', label: 'Bluesky', Icon: Globe, color: 'bg-blue-400' },
  { key: 'threads', label: 'Threads', Icon: MessageSquare, color: 'bg-slate-800' },
];

interface HashtagTiers {
  tier1: string[];
  tier2: string[];
  tier3: string[];
}

interface Explanation {
  summary: string;
  dataPoints: string[];
  confidence: number;
  method: string;
}

interface GeneratedPost {
  content: string;
  hashtags: string[];
  imageSuggestion: string;
  hashtagTiers?: HashtagTiers;
  contentType?: string;
  originalContentType?: string;
  adaptiveApplied?: boolean;
  adaptiveRuleIds?: string[];
  explanation?: Explanation;
}

interface VariantPost {
  content: string;
  hashtags: string[];
  tone: string;
}

export default function ContentPage() {
  const addNotification = useUIStore((s) => s.addNotification);
  const [searchParams] = useSearchParams();
  const prefillGenerateKeyRef = useRef<string | null>(null);
  const { profiles: brandProfiles, selectedId: selectedBrand, setSelectedId: setSelectedBrand, fetchProfiles: fetchBrandProfiles } = useBrandStore();
  const [activeTab, setActiveTab] = useState<'create' | 'repurpose' | 'abtest' | 'reels' | 'video'>('create');
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [topic, setTopic] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [generatedVariants, setGeneratedVariants] = useState<VariantPost[] | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingVariant, setSchedulingVariant] = useState<VariantPost | null>(null);
  const [schedulingExtraMeta, setSchedulingExtraMeta] = useState<Record<string, unknown>>({});
  const [attachedMediaUrl, setAttachedMediaUrl] = useState('');
  // AI Designer state
  const [showAiDesignerModal, setShowAiDesignerModal] = useState(false);
  const [aiDesignerPhase, setAiDesignerPhase] = useState<'permission' | 'form' | 'results'>('permission');
  const [aiDesignerTopic, setAiDesignerTopic] = useState('');
  const [aiDesignerVibe, setAiDesignerVibe] = useState<string>('Bold');
  const [aiDesignerPlatformKeys, setAiDesignerPlatformKeys] = useState<string[]>([]);
  const [aiDesignerIsConnecting, setAiDesignerIsConnecting] = useState(false);
  const [aiDesignerIsDesigning, setAiDesignerIsDesigning] = useState(false);
  const [aiDesignerDesigns, setAiDesignerDesigns] = useState<
    Array<{
      designId: string;
      title: string;
      imageUrl: string;
      editUrl: string;
      dimensions: { width: number; height: number };
      source: string;
      autofillData: Record<string, unknown>;
    }>
  >([]);
  const [aiDesignerResizeSteps, setAiDesignerResizeSteps] = useState<
    Array<{ platform: string; done: boolean }>
  >([]);
  const [aiDesignerBrandKits, setAiDesignerBrandKits] = useState<Array<{ brandKitId: string; name: string; verified: boolean }>>([]);
  const [aiDesignerSelectedBrandKit, setAiDesignerSelectedBrandKit] = useState<string | null>(null);
  const [aiDesignerRecent, setAiDesignerRecent] = useState<any[]>([]);
  const [aiDesignerShowRecent, setAiDesignerShowRecent] = useState(false);
  const [aiDesignerPermissions, setAiDesignerPermissions] = useState<Array<{ action: string; description: string }>>([]);
  const aiDesignerConnectionId = 'ai-designer-default';

  const loadAiDesignerContext = async () => {
    const token = localStorage.getItem('session_token') || '';
    try {
      const [perms, kits, recent] = await Promise.all([
        axios.get(`${API_BASE}/api/integrations/${aiDesignerConnectionId}/permissions`, { headers: { 'x-session-token': token } }).catch(() => null),
        axios.get(`${API_BASE}/api/integrations/${aiDesignerConnectionId}/brand-kits`, { headers: { 'x-session-token': token } }).catch(() => null),
        axios.get(`${API_BASE}/api/integrations/${aiDesignerConnectionId}/recent-designs`, { headers: { 'x-session-token': token } }).catch(() => null),
      ]);
      if (perms?.data?.permissions) setAiDesignerPermissions(perms.data.permissions);
      if (kits?.data?.kits) setAiDesignerBrandKits(kits.data.kits);
      if (recent?.data?.designs) setAiDesignerRecent(recent.data.designs);
    } catch {
      /* non-fatal — UI degrades gracefully */
    }
  };

  // Video generation provider selection
  const [videoProvider, setVideoProvider] = useState<'higgsfield' | 'pollinations'>('higgsfield');

  // Media upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedMediaName, setUploadedMediaName] = useState('');

  // Repurpose state
  const [sourcePlatform, setSourcePlatform] = useState('instagram');
  const [sourceContent, setSourceContent] = useState('');
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([]);
  const [repurposedPosts, setRepurposedPosts] = useState<Record<string, { content: string; hashtags: string[] }> | null>(null);

  // A/B Test state
  const [abVariantA, setAbVariantA] = useState('');
  const [abVariantB, setAbVariantB] = useState('');
  const [abDifferentiator, setAbDifferentiator] = useState('');

  // Suggest best time state
  const [suggestedTime, setSuggestedTime] = useState<{
    suggestedDateTime: string;
    confidence: string;
    reasoning: string;
    explanation?: Explanation;
  } | null>(null);
  const [isSuggestingTime, setIsSuggestingTime] = useState(false);

  // Regenerate hashtags state
  const [isRegeneratingHashtags, setIsRegeneratingHashtags] = useState(false);

  // Reels Script state
  const [reelsTopic, setReelsTopic] = useState('');
  const [reelsDuration, setReelsDuration] = useState<15 | 30 | 60 | 90>(30);
  const [reelsStyle, setReelsStyle] = useState<'talking_head' | 'slideshow' | 'tutorial' | 'trending_audio'>('talking_head');
  const [reelsScript, setReelsScript] = useState<{
    hook: string; hookDuration: number;
    scenes: Array<{ duration: number; visualDescription: string; spokenText: string; textOverlay?: string }>;
    cta: string; ctaDuration: number;
    caption: string; hashtags: string[];
    audioSuggestion: string; estimatedDuration: number;
  } | null>(null);
  const [isGeneratingReelsScript, setIsGeneratingReelsScript] = useState(false);

  useEffect(() => {
    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
    setScheduledAt(oneHourLater);
  }, []);

  useEffect(() => {
    fetchBrandProfiles();
  }, [fetchBrandProfiles]);

  useEffect(() => {
    if (searchParams.get('prefill') !== 'viral') {
      return;
    }

    const requestedBrand = searchParams.get('brandProfileId') || '';
    const resolvedBrand =
      requestedBrand && brandProfiles.some((profile) => profile.id === requestedBrand)
        ? requestedBrand
        : brandProfiles[0]?.id || selectedBrand;
    const mediaUrl = searchParams.get('mediaUrl') || '';
    const platform = searchParams.get('platform') || 'tiktok';
    const nextTopic = searchParams.get('topic') || '';
    const nextContext = searchParams.get('additionalContext') || '';

    setActiveTab('create');
    if (resolvedBrand) {
      setSelectedBrand(resolvedBrand);
    }
    setSelectedPlatform(platform);
    setTopic(nextTopic);
    setAdditionalContext(nextContext);
    setAttachedMediaUrl(mediaUrl);
    setScheduleEnabled(Boolean(mediaUrl));

    const shouldAutogenerate = searchParams.get('autogenerate') === '1';
    const prefillKey = [resolvedBrand, platform, nextTopic, nextContext, mediaUrl].join('|');
    if (shouldAutogenerate && resolvedBrand && nextTopic && prefillGenerateKeyRef.current !== prefillKey) {
      prefillGenerateKeyRef.current = prefillKey;
      void handleGenerate({
        brandProfileId: resolvedBrand,
        platform,
        topic: nextTopic,
        additionalContext: nextContext,
      });
    }
  }, [brandProfiles, searchParams, selectedBrand]);

  async function handleMediaUpload(file: File) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      alert('Unsupported file type. Please upload an image or video file.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      alert('File too large. Maximum size is 50MB.');
      return;
    }

    setUploadingMedia(true);
    setUploadedMediaName('');
    try {
      const token = localStorage.getItem('session_token') || '';
      const formData = new FormData();
      formData.append('file', file);

      const res = await axios.post(`${API_BASE}/api/media/upload`, formData, {
        headers: {
          'x-session-token': token,
        },
      });

      setAttachedMediaUrl(res.data.url);
      setUploadedMediaName(file.name);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to upload media.';
      alert(msg);
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleGenerate(overrides?: {
    brandProfileId?: string;
    platform?: string;
    topic?: string;
    additionalContext?: string;
  }) {
    const brandProfileId = overrides?.brandProfileId ?? selectedBrand;
    const platform = overrides?.platform ?? selectedPlatform;
    const topicValue = overrides?.topic ?? topic;
    const contextValue = overrides?.additionalContext ?? additionalContext;

    setIsGenerating(true);
    setGeneratedPost(null);
    setGeneratedVariants(null);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.post(
        `${API_BASE}/api/scheduled-posts/generate`,
        {
          brandProfileId,
          platform,
          topic: topicValue,
          additionalContext: contextValue,
        },
        { headers: { 'x-session-token': token } }
      );
      setGeneratedPost(res.data);
      setEditedContent(res.data.content);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateVariants() {
    setIsGenerating(true);
    setGeneratedPost(null);
    setGeneratedVariants(null);
    try {
      const res = await axios.post(
        `${API_BASE}/api/scheduled-posts/variants`,
        {
          brandProfileId: selectedBrand,
          platform: selectedPlatform,
          topic,
        },
        { headers: { 'x-session-token': localStorage.getItem('session_token') || '' } }
      );
      setGeneratedVariants([res.data]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRepurpose() {
    setIsGenerating(true);
    setRepurposedPosts(null);
    try {
      const res = await axios.post(
        `${API_BASE}/api/scheduled-posts/repurpose`,
        {
          brandProfileId: selectedBrand,
          sourceContent,
          sourcePlatform,
          targetPlatforms,
        },
        { headers: { 'x-session-token': localStorage.getItem('session_token') || '' } }
      );
      setRepurposedPosts(res.data);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateAB() {
    setIsGenerating(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/scheduled-posts/variants`,
        {
          brandProfileId: selectedBrand,
          platform: selectedPlatform,
          topic,
        },
        { headers: { 'x-session-token': localStorage.getItem('session_token') || '' } }
      );
      setAbVariantA(res.data.variantA || '');
      setAbVariantB(res.data.variantB || '');
      setAbDifferentiator(res.data.differentiator || '');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRegenerateHashtags() {
    if (!generatedPost || !topic) return;
    setIsRegeneratingHashtags(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.post(
        `${API_BASE}/api/scheduled-posts/regenerate-hashtags`,
        {
          topic,
          brandProfileId: selectedBrand,
          platform: selectedPlatform,
        },
        { headers: { 'x-session-token': token } }
      );
      const newTiers = res.data;
      setGeneratedPost({
        ...generatedPost,
        hashtags: newTiers.allHashtags || [],
        hashtagTiers: { tier1: newTiers.tier1, tier2: newTiers.tier2, tier3: newTiers.tier3 },
      });
    } catch {
      // Silent fail
    } finally {
      setIsRegeneratingHashtags(false);
    }
  }

  async function handleSchedule(postContent: string, hashtags: string[], extraMetadata?: Record<string, unknown>) {
    const token = localStorage.getItem('session_token') || '';
    await axios.post(
      `${API_BASE}/api/scheduled-posts`,
      {
        brandProfileId: selectedBrand,
        platform: selectedPlatform,
        content: postContent,
        hashtags,
        ...extraMetadata,
        mediaUrls: attachedMediaUrl ? [attachedMediaUrl] : undefined,
        scheduledAt: new Date(scheduledAt).toISOString(),
      },
      { headers: { 'x-session-token': token } }
    );
    setShowScheduleModal(false);
    setSchedulingVariant(null);
    setSchedulingExtraMeta({});
  }

  function toggleTargetPlatform(key: string) {
    setTargetPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  async function handleSuggestTime() {
    setIsSuggestingTime(true);
    setSuggestedTime(null);
    try {
      const token = localStorage.getItem('session_token') || '';
      // Get connectors to find the Instagram connector ID
      let connectorId = '';
      try {
        const connRes = await axios.get(`${API_BASE}/api/connectors`, {
          headers: { 'x-session-token': token },
        });
        const instagramConn = (connRes.data as any[]).find(
          (c: any) => c.provider === 'instagram' && c.status === 'active'
        );
        if (instagramConn) {
          connectorId = instagramConn.id;
        }
      } catch {
        // If we can't find a connector, proceed without one
      }

      const res = await axios.post(
        `${API_BASE}/api/scheduled-posts/suggest-time`,
        {
          platform: selectedPlatform,
          brandProfileId: selectedBrand,
          connectorId: connectorId || 'unknown',
        },
        { headers: { 'x-session-token': token } }
      );
      setSuggestedTime(res.data);
    } catch {
      // Silent fail - user can still pick a time manually
    } finally {
      setIsSuggestingTime(false);
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] gap-4">
      {/* Left Panel */}
      <div className={`w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${activeTab === 'video' ? 'lg:w-full' : 'lg:w-1/3'}`}>
        {/* Tabs */}
        <div className="mb-4 flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {(['create', 'repurpose', 'reels', 'abtest', 'video'] as const).map((tab) => (
            <button
              key={tab}
              id={tab === 'video' ? 'tab-ai-video' : undefined}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                activeTab === tab
                  ? 'border-b-2 border-teal-500 text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              {tab === 'create' ? 'Create Post' : tab === 'repurpose' ? 'Repurpose' : tab === 'reels' ? 'Reels Script' : tab === 'abtest' ? 'A/B Test' : 'AI Video'}
            </button>
          ))}
        </div>

        {/* Tab 1: Create Post */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Profile</label>
              <select
                value={selectedBrand || ''}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {brandProfiles.map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Platform</label>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPlatform(p.key)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${
                      selectedPlatform === p.key ? 'ring-2 ring-teal-400 ring-offset-2' : ''
                    } ${p.color}`}
                    title={p.label}
                  >
                    <p.Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Post about</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is this post about? Be specific."
                rows={4}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Media Upload Section */}
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/50">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Upload Media (optional)
                <span className="ml-1 text-xs text-slate-400">Upload an image or video to attach to this post</span>
              </label>

              {attachedMediaUrl ? (
                <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 dark:border-teal-900 dark:bg-teal-950/30">
                  <div className="flex items-center gap-2">
                    {uploadedMediaName.endsWith('.mp4') || uploadedMediaName.endsWith('.mov') || uploadedMediaName.endsWith('.webm') ? (
                      <FileVideo className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    ) : (
                      <Image className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    )}
                    <span className="text-xs font-medium text-teal-700 dark:text-teal-300">{uploadedMediaName || 'Media attached'}</span>
                  </div>
                  <button
                    onClick={() => {
                      setAttachedMediaUrl('');
                      setUploadedMediaName('');
                    }}
                    className="rounded-full p-1 text-teal-600 hover:bg-teal-100 dark:text-teal-400 dark:hover:bg-teal-900/50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-teal-500"
                >
                  {uploadingMedia ? (
                    <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span>{uploadingMedia ? 'Uploading...' : 'Click to upload an image or video (max 50MB)'}</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleMediaUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Additional context
                <InfoTooltip content="Add any extra details the AI should know about this post — links, product names, prices, or specific facts you want included." />
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Any links, product names, or specifics to include?"
                rows={2}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Instagram image warning */}
            {selectedPlatform === 'instagram' && !attachedMediaUrl && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-950/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Instagram posts need an image. Upload one above or VIMO will generate an image prompt for you to create one.
                  </p>
                </div>
              </div>
            )}

            {attachedMediaUrl && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-900 dark:bg-teal-950/30">
                <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Attached media ready</p>
                <p className="mt-1 text-xs text-teal-600 dark:text-teal-400">
                  This post will schedule with the selected media attached.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Schedule to calendar</span>
            </div>

            {scheduleEnabled && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Scheduled Date/Time</label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <button
                    onClick={handleSuggestTime}
                    disabled={isSuggestingTime || !selectedBrand}
                    className="shrink-0 rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/50"
                  >
                    {isSuggestingTime ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Suggest best time'
                    )}
                  </button>
                </div>

                {/* Suggested time card */}
                {suggestedTime && (
                  <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-900 dark:bg-teal-950/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-teal-800 dark:text-teal-300">
                          Best time to post on {selectedPlatform === 'instagram' ? 'Instagram' : selectedPlatform}:
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-teal-900 dark:text-teal-200">
                          {new Date(suggestedTime.suggestedDateTime).toLocaleString(undefined, {
                            weekday: 'long',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                        {/* simplified suggested time display */}
                      </div>
                      <button
                        onClick={() => {
                          const d = new Date(suggestedTime.suggestedDateTime);
                          // Format for datetime-local input
                          const year = d.getFullYear();
                          const month = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          const hours = String(d.getHours()).padStart(2, '0');
                          const minutes = String(d.getMinutes()).padStart(2, '0');
                          setScheduledAt(`${year}-${month}-${day}T${hours}:${minutes}`);
                        }}
                        className="shrink-0 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700"
                      >
                        Use this time
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 relative">
              <button
                id="btn-generate-post"
                onClick={() => {
                  void handleGenerate();
                }}
                disabled={isGenerating || !topic || !selectedBrand}
                className="flex-1 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Generate'}
              </button>

              <button
                onClick={() => {
                  setAiDesignerTopic(topic);
                  setAiDesignerPlatformKeys([selectedPlatform]);
                  setShowAiDesignerModal(true);
                  setAiDesignerPhase('permission');
                  setAiDesignerDesigns([]);
                  setAiDesignerSelectedBrandKit(null);
                  void loadAiDesignerContext();
                }}
                disabled={!selectedBrand}
                className="rounded-md bg-gradient-to-r from-purple-600 to-teal-500 px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
              >
                Create with AI Designer
              </button>

              <button
                onClick={handleGenerateVariants}
                disabled={isGenerating || !topic || !selectedBrand}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Generate 3 variants
              </button>

              <FirstTimeCallout
                targetSelector="#btn-generate-post"
                message="Tell the AI what to write about and click here."
                storageKey="callout_content_studio_generate"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Repurpose */}
        {activeTab === 'repurpose' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Source Platform</label>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSourcePlatform(p.key)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${
                      sourcePlatform === p.key ? 'ring-2 ring-teal-400 ring-offset-2' : ''
                    } ${p.color}`}
                    title={p.label}
                  >
                    <p.Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Source Content</label>
              <textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="Paste your existing content here..."
                rows={5}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Target Platforms</label>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <label
                    key={p.key}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                      targetPlatforms.includes(p.key)
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={targetPlatforms.includes(p.key)}
                      onChange={() => toggleTargetPlatform(p.key)}
                      className="hidden"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleRepurpose}
              disabled={isGenerating || !sourceContent || targetPlatforms.length === 0}
              className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Repurpose for all selected'}
            </button>
          </div>
        )}

        {/* Tab 3: Reels Script */}
        {activeTab === 'reels' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Profile</label>
              <select
                value={selectedBrand || ''}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {brandProfiles.map((bp) => (
                  <option key={bp.id} value={bp.id}>{bp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">What is this Reel about?</label>
              <textarea
                value={reelsTopic}
                onChange={(e) => setReelsTopic(e.target.value)}
                placeholder="e.g., 3 mistakes killing your engagement"
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Duration</label>
              <div className="flex gap-2">
                {([15, 30, 60, 90] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setReelsDuration(d)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${reelsDuration === d ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Style</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'talking_head' as const, label: 'Talking Head', icon: Mic },
                  { key: 'slideshow' as const, label: 'Slideshow', icon: LayoutDashboard },
                  { key: 'tutorial' as const, label: 'Tutorial', icon: BookOpen },
                  { key: 'trending_audio' as const, label: 'Trending Audio', icon: Music },
                ]).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setReelsStyle(s.key)}
                    className={`rounded-lg border p-3 text-left text-sm ${reelsStyle === s.key ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}
                  >
                    <s.icon className="mr-1.5 inline h-4 w-4" />{s.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={async () => {
                if (!reelsTopic.trim() || !selectedBrand) return;
                setIsGeneratingReelsScript(true);
                setReelsScript(null);
                try {
                  const token = localStorage.getItem('session_token') || '';
                  const res = await axios.post(`${API_BASE}/api/content/reels-script`, {
                    brandProfileId: selectedBrand,
                    topic: reelsTopic,
                    targetDuration: reelsDuration,
                    reelsStyle,
                  }, { headers: { 'x-session-token': token } });
                  setReelsScript(res.data);
                } finally {
                  setIsGeneratingReelsScript(false);
                }
              }}
              disabled={isGeneratingReelsScript || !reelsTopic.trim() || !selectedBrand}
              className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {isGeneratingReelsScript ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Generate Reel Script'}
            </button>
          </div>
        )}

        {/* Tab 5: AI Video */}
        {activeTab === 'video' && (
          <div className="space-y-4">
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Profile</label>
              <select
                value={selectedBrand || ''}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {brandProfiles.map((bp) => (
                  <option key={bp.id} value={bp.id}>{bp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Generation Tool</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVideoProvider('higgsfield')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    videoProvider === 'higgsfield'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Higgsfield AI
                </button>
                <button
                  onClick={() => setVideoProvider('pollinations')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    videoProvider === 'pollinations'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Image className="h-4 w-4" />
                  Pollinations Image
                </button>
              </div>
            </div>

            {videoProvider === 'higgsfield' ? <HiggsfieldStudio /> : <PollinationsImageStudio />}
          </div>
        )}

        {/* Tab 4: A/B Test */}
        {activeTab === 'abtest' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Profile</label>
              <select
                value={selectedBrand || ''}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {brandProfiles.map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Platform</label>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPlatform(p.key)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${
                      selectedPlatform === p.key ? 'ring-2 ring-teal-400 ring-offset-2' : ''
                    } ${p.color}`}
                    title={p.label}
                  >
                    <p.Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Topic</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is this post about?"
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <button
              onClick={handleGenerateAB}
              disabled={isGenerating || !topic || !selectedBrand}
              className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Generate A/B variants'}
            </button>
          </div>
        )}
      </div>

      {/* Right Panel — hidden when AI Video tab is active */}
      {activeTab !== 'video' && (
      <div className="w-full lg:w-2/3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Generated Content</h2>

        {isGenerating && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          </div>
        )}

        {/* Reels Script Result */}
        {reelsScript && activeTab === 'reels' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Reel Script</h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {reelsScript.estimatedDuration}s
              </span>
            </div>
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
              <div className="mb-1 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Hook (first {reelsScript.hookDuration}s)</span>
              </div>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100">{reelsScript.hook}</p>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Scenes</h4>
              {reelsScript.scenes.map((scene, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{i + 1}</span>
                    <span className="text-xs text-slate-400"><Clock className="mr-1 inline h-3 w-3" />{scene.duration}s</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1"><strong>Visual:</strong> {scene.visualDescription}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-1"><strong>Speak:</strong> {scene.spokenText}</p>
                  {scene.textOverlay && <p className="text-xs text-teal-600 dark:text-teal-400"><strong>Text on screen:</strong> {scene.textOverlay}</p>}
                </div>
              ))}
            </div>
            <div className="rounded-xl border-2 border-teal-200 bg-teal-50 p-4 dark:border-teal-900/30 dark:bg-teal-950/20">
              <div className="mb-1 flex items-center gap-2">
                <Send className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">Call to Action ({reelsScript.ctaDuration}s)</span>
              </div>
              <p className="text-lg font-bold text-teal-900 dark:text-teal-100">{reelsScript.cta}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Caption</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">{reelsScript.caption}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {reelsScript.hashtags.map((tag, i) => (
                  <span key={i} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700 dark:bg-teal-900 dark:text-teal-300">#{tag}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <Music className="h-4 w-4 text-purple-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Audio Suggestion</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{reelsScript.audioSuggestion}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSchedulingVariant({ content: reelsScript.caption, hashtags: reelsScript.hashtags, tone: '' });
                  setShowScheduleModal(true);
                }}
                className="flex-1 rounded-md border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
              >
                Schedule this Reel
              </button>
              <button
                onClick={() => {
                  const videoPrompt = `Cinematic ${reelsStyle.replace('_', ' ')} style video: ${reelsScript.hook}. ${reelsScript.scenes[0]?.visualDescription || ''}. Cinematic lighting, shallow depth of field, professional production quality.`;
                  prefillHiggsfieldPrompt(videoPrompt);
                  setActiveTab('video');
                  setTimeout(() => {
                    document.getElementById('tab-ai-video')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                }}
                className="flex items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-medium text-white hover:from-teal-700 hover:to-emerald-700"
              >
                <Film className="h-4 w-4" />
                Generate Video from Script
              </button>
            </div>
          </div>
        )}

        {/* AI Designer results (variation grid) */}
        {aiDesignerDesigns.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Designs from Canva
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {aiDesignerDesigns.map((d) => (
                <div
                  key={d.designId}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow hover:border-teal-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                >
                  <img
                    src={d.imageUrl}
                    alt={d.title}
                    className="h-28 w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                  />
                  <div className="p-2">
                    <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">{d.title}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {d.dimensions.width} x {d.dimensions.height}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => {
                          setAttachedMediaUrl(d.imageUrl);
                          addNotification('success', 'Design Selected', `"${d.title}" attached to your post.`);
                        }}
                        className="flex-1 rounded bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                      >
                        Attach
                      </button>
                      <a
                        href={d.editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                        Edit
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single post result */}
        {generatedPost && !generatedVariants && !repurposedPosts && !abVariantA && (
          <PostPreviewCard
            post={generatedPost}
            platform={selectedPlatform}
            onCopy={() => copyToClipboard(generatedPost.content)}
            onEdit={() => {
              setEditingContent(!editingContent);
              if (!editingContent) setEditedContent(generatedPost.content);
            }}
            onSchedule={() => {
              const extraMeta: Record<string, unknown> = {};
              if (generatedPost.hashtagTiers) extraMeta.hashtagTiers = generatedPost.hashtagTiers;
              if (generatedPost.contentType) extraMeta.contentType = generatedPost.contentType;
              setSchedulingExtraMeta(extraMeta);
              setSchedulingVariant({ content: generatedPost.content, hashtags: generatedPost.hashtags, tone: '' });
              setShowScheduleModal(true);
            }}
            onRegenerate={handleGenerate}
            onRegenerateHashtags={handleRegenerateHashtags}
            isRegeneratingHashtags={isRegeneratingHashtags}
            editing={editingContent}
            editedContent={editedContent}
            onEditedContentChange={setEditedContent}
          />
        )}

        {/* Variants result */}
        {generatedVariants && generatedVariants.map((variant, idx) => (
          <div key={idx} className="mb-4">
            <PostPreviewCard
              post={{ content: variant.content, hashtags: variant.hashtags, imageSuggestion: '' }}
              platform={selectedPlatform}
              onCopy={() => copyToClipboard(variant.content)}
              onEdit={() => {}}
              onSchedule={() => {
                setSchedulingVariant(variant);
                setShowScheduleModal(true);
              }}
              onRegenerate={handleGenerateVariants}
              editing={false}
              editedContent={variant.content}
              onEditedContentChange={() => {}}
            />
          </div>
        ))}

        {/* Repurpose result */}
        {repurposedPosts &&
          Object.entries(repurposedPosts).map(([platform, post]) => (
            <div key={platform} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold capitalize text-slate-700 dark:text-slate-300">{platform}</h3>
              <PostPreviewCard
                post={{ content: post.content, hashtags: post.hashtags, imageSuggestion: '' }}
                platform={platform}
                onCopy={() => copyToClipboard(post.content)}
                onEdit={() => {}}
                onSchedule={() => {
                  setSelectedPlatform(platform);
                  handleSchedule(post.content, post.hashtags);
                }}
                onRegenerate={() => {}}
                editing={false}
                editedContent={post.content}
                onEditedContentChange={() => {}}
              />
            </div>
          ))}

        {/* A/B Test result */}
        {abVariantA && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Variant A</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{abVariantA}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Variant B</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{abVariantB}</p>
              </div>
            </div>
            <p className="text-sm italic text-slate-500 dark:text-slate-400">{abDifferentiator}</p>
          </div>
        )}
      </div>
      )}

      {/* AI Designer — Permission prompt (gating) */}
      {showAiDesignerModal && aiDesignerPhase === 'permission' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-teal-500 text-white">
                <PenTool className="h-4 w-4" />
              </span>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Allow AI Designer to use Canva
              </h3>
            </div>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              VIMO needs your permission to act on your behalf in Canva. You can revoke this any time from Apps & Platforms.
            </p>
            <ul className="mb-5 space-y-2">
              {(aiDesignerPermissions.length ? aiDesignerPermissions : [
                { action: 'create_design_from_prompt', description: 'Create designs in your Canva account' },
                { action: 'resize_design', description: 'Auto-resize designs per platform' },
                { action: 'export_design', description: 'Export designs to images' },
                { action: 'list_brand_kits', description: 'Apply your brand colors & fonts' },
              ]).map((p) => (
                <li key={p.action} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                  <span>{p.description}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setAiDesignerPhase('form');
                }}
                className="flex-1 rounded-md bg-gradient-to-r from-purple-600 to-teal-500 px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Allow &amp; continue
              </button>
              <button
                onClick={() => {
                  setShowAiDesignerModal(false);
                  setAiDesignerPhase('permission');
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Designer Modal (form view) */}
      {showAiDesignerModal && aiDesignerPhase === 'form' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Create with AI Designer (Canva)
              </h3>
              <button
                onClick={() => setAiDesignerShowRecent((v) => !v)}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Recent designs ({aiDesignerRecent.length})
              </button>
            </div>

            {aiDesignerShowRecent && (
              <div className="mb-4 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                {aiDesignerRecent.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-slate-500">No recent designs yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {aiDesignerRecent.slice(0, 9).map((d: any, i: number) => (
                      <a
                        key={d.designId || i}
                        href={d.editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="overflow-hidden rounded border border-slate-200 hover:border-teal-400 dark:border-slate-700"
                      >
                        <img src={d.imageUrl} alt={d.title} className="h-16 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Tell VIMO what you want to post about - then pick a vibe.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  What do you want to post about?
                </label>
                <textarea
                  value={aiDesignerTopic}
                  onChange={(e) => setAiDesignerTopic(e.target.value)}
                  placeholder="e.g., 5 tips to grow your Instagram in 2026"
                  rows={4}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pick a vibe
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Bold', 'Minimal', 'Playful', 'Corporate', 'Festive'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAiDesignerVibe(v)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        aiDesignerVibe === v
                          ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pick platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {platforms
                    .filter((p) => ['instagram', 'twitter', 'linkedin'].includes(p.key))
                    .map((p) => (
                      <label
                        key={p.key}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                          aiDesignerPlatformKeys.includes(p.key)
                            ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={aiDesignerPlatformKeys.includes(p.key)}
                          onChange={(e) => {
                            setAiDesignerPlatformKeys((prev) =>
                              e.target.checked ? Array.from(new Set([...prev, p.key])) : prev.filter((x) => x !== p.key)
                            );
                          }}
                          className="hidden"
                        />
                        {p.label}
                      </label>
                    ))}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Auto-resize will match each platform.
                </div>
              </div>

              {aiDesignerBrandKits.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Brand kit
                  </label>
                  <select
                    value={aiDesignerSelectedBrandKit || ''}
                    onChange={(e) => setAiDesignerSelectedBrandKit(e.target.value || null)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">No brand kit (default style)</option>
                    {aiDesignerBrandKits.map((k) => (
                      <option key={k.brandKitId} value={k.brandKitId}>
                        {k.name}{k.verified ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!aiDesignerTopic.trim()) return;
                    if (aiDesignerPlatformKeys.length === 0) return;

                    // Show live "Resizing for X, Y, Z..." checklist as we go.
                    setAiDesignerResizeSteps(aiDesignerPlatformKeys.map((p) => ({ platform: p, done: false })));
                    setAiDesignerIsConnecting(true);
                    setAiDesignerIsDesigning(true);
                    try {
                      const token = localStorage.getItem('session_token') || '';

                      const connectionId = 'ai-designer-default';
                      // Connect this brand's AI Designer via the real integration endpoint
                      await axios.post(
                        `${API_BASE}/api/integrations/connect`,
                        {
                          connectionId,
                          catalogId: 'canva_ai_designer',
                          displayName: 'AI Designer',
                          connectorId: 'canva_ai_designer_connector',
                          serverUrl: 'internal',
                        },
                        { headers: { 'x-session-token': token } }
                      );

                      const res = await axios.post(
                        `${API_BASE}/api/integrations/${connectionId}/invoke`,
                        {
                          connectorId: 'canva_ai_designer_connector',
                          action: 'create_design_from_prompt',
                          input: {
                            prompt: aiDesignerTopic,
                            style: aiDesignerVibe,
                            platforms: aiDesignerPlatformKeys,
                            brand_kit_id: aiDesignerSelectedBrandKit,
                          },
                        },
                        { headers: { 'x-session-token': token } }
                      );

                      const data = res.data?.data ?? {};
                      const designs = data.designs ?? [];
                      setAiDesignerDesigns(designs);
                      // Reflect the real per-platform resize checklist returned by the engine.
                      if (Array.isArray(data.platformResize)) {
                        setAiDesignerResizeSteps(data.platformResize.map((r: any) => ({ platform: r.platform, done: true })));
                      } else {
                        setAiDesignerResizeSteps(aiDesignerPlatformKeys.map((p) => ({ platform: p, done: true })));
                      }

                      // If designs were generated, show success notification and switch to results view
                      if (designs.length > 0) {
                        addNotification('success', 'AI Designer', `Generated ${designs.length} design options for your post.`);
                        setAiDesignerPhase('results');
                      }
                    } catch (err: any) {
                      const msg =
                        err?.response?.data?.error ||
                        err?.response?.data?.details ||
                        err?.message ||
                        'Failed to generate designs. Please try again.';
                      addNotification('error', 'AI Designer', msg);
                    } finally {
                      setAiDesignerIsConnecting(false);
                      setAiDesignerIsDesigning(false);
                    }
                  }}
                  disabled={aiDesignerIsConnecting || aiDesignerIsDesigning || !aiDesignerTopic.trim() || aiDesignerPlatformKeys.length === 0}
                  className="flex-1 rounded-md bg-gradient-to-r from-purple-600 to-teal-500 px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
                >
                  {aiDesignerIsDesigning ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Designing...
                    </span>
                  ) : (
                    'Generate'
                  )}
                </button>

                <button
                  onClick={() => {
                    setShowAiDesignerModal(false);
                    setAiDesignerTopic('');
                    setAiDesignerVibe('Bold');
                    setAiDesignerPlatformKeys([]);
                    setAiDesignerDesigns([]);
                    setAiDesignerPhase('form');
                  }}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>

              {/* Live multi-platform resize checklist */}
              {aiDesignerResizeSteps.length > 0 && (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {aiDesignerIsDesigning ? 'Resizing for…' : 'Auto-resized for'}
                  </div>
                  <ul className="space-y-1">
                    {aiDesignerResizeSteps.map((s) => (
                      <li key={s.platform} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        {s.done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />
                        ) : (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        )}
                        <span className="capitalize">{s.platform}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Designer Results View (shown inside modal after generation) */}
      {showAiDesignerModal && aiDesignerPhase === 'results' && aiDesignerDesigns.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Your Designs from Canva
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select a design to attach to your post, or open it in Canva to edit further.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAiDesignerModal(false);
                  setAiDesignerDesigns([]);
                  setAiDesignerPhase('form');
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Auto-resize checkmarks summary */}
            {aiDesignerResizeSteps.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 dark:border-teal-800 dark:bg-teal-950/40">
                <span className="text-xs font-medium text-teal-700 dark:text-teal-300">Auto-resized:</span>
                {aiDesignerResizeSteps.map((s) => (
                  <span key={s.platform} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-teal-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-teal-700">
                    <CheckCircle2 className="h-3 w-3 text-teal-500" />
                    <span className="capitalize">{s.platform}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {aiDesignerDesigns.map((d) => (
                <div
                  key={d.designId}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="relative">
                    <img
                      src={d.imageUrl}
                      alt={d.title}
                      className="h-48 w-full object-cover"
                    />
                    {d.source === 'ai' && (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        AI fallback
                      </span>
                    )}
                    {d.source === 'canva' && (
                      <span className="absolute right-2 top-2 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Canva
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{d.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {d.dimensions.width} x {d.dimensions.height}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => {
                          setAttachedMediaUrl(d.imageUrl);
                          setShowAiDesignerModal(false);
                          setAiDesignerPhase('form');
                          addNotification('success', 'Design Selected', `"${d.title}" attached to your post.`);
                        }}
                        className="flex-1 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                      >
                        Select for Post
                      </button>
                      <a
                        href={d.editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                        Edit in Canva
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setShowAiDesignerModal(false);
                  setAiDesignerDesigns([]);
                  setAiDesignerPhase('form');
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Schedule Post</h3>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mb-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
            <div className="flex gap-2">
              <button
                onClick={() => schedulingVariant && handleSchedule(editingContent ? editedContent : (generatedPost?.content || schedulingVariant.content), schedulingVariant.hashtags, schedulingExtraMeta)}
                className="flex-1 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                <Send className="mr-2 inline h-4 w-4" />
                Schedule
              </button>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  setSchedulingVariant(null);
                  setSchedulingExtraMeta({});
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostPreviewCard({
  post,
  platform,
  onCopy,
  onEdit,
  onSchedule,
  onRegenerate,
  onRegenerateHashtags,
  isRegeneratingHashtags,
  editing,
  editedContent,
  onEditedContentChange,
}: {
  post: GeneratedPost;
  platform: string;
  onCopy: () => void;
  onEdit: () => void;
  onSchedule: () => void;
  onRegenerate: () => void;
  onRegenerateHashtags?: () => void;
  isRegeneratingHashtags?: boolean;
  editing: boolean;
  editedContent: string;
  onEditedContentChange: (val: string) => void;
}) {
  const p = platforms.find((x) => x.key === platform);
  const Icon = p?.Icon || Globe;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${p?.color || 'bg-slate-500'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-300">{platform}</span>
        {post.contentType && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
            {post.contentType === 'educational' ? 'Teach something' : post.contentType === 'promotional' ? 'Sell something' : post.contentType === 'entertaining' ? 'Entertain' : post.contentType === 'engaging' ? 'Start a conversation' : post.contentType}
          </span>
        )}
      </div>

      {/* "Adapted for your brand" chip — shows when an adaptive plan rule influenced this output */}
      {post.adaptiveApplied && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            data-testid="adaptive-chip"
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-bold text-teal-700 ring-1 ring-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:ring-teal-800"
            title={
              post.adaptiveRuleIds && post.adaptiveRuleIds.length > 0
                ? `Influenced by adaptive rule${post.adaptiveRuleIds.length > 1 ? 's' : ''}: ${post.adaptiveRuleIds.join(', ')}`
                : 'Adjusted for this brand based on performance history'
            }
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Adapted for your brand
          </span>
          {post.originalContentType && post.originalContentType !== post.contentType && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              Content type changed: <strong className="text-slate-700 dark:text-slate-200">{post.originalContentType}</strong>
              <span className="text-slate-400">→</span>
              <strong className="text-teal-700 dark:text-teal-300">{post.contentType}</strong>
              <ExplainabilityTooltip
                explanation={{
                  summary: `VIMO switched this post from "${post.originalContentType}" to "${post.contentType}" based on your performance history. Check the Brand Memory page to see which rule caused the change.`,
                  dataPoints: post.adaptiveRuleIds && post.adaptiveRuleIds.length > 0
                    ? [`Influenced by rule${post.adaptiveRuleIds.length > 1 ? 's' : ''}: ${post.adaptiveRuleIds.join(', ')}`]
                    : ['Adjusted for this brand based on performance history'],
                  confidence: 70,
                  method: 'adaptive plan',
                }}
              >
                <span className="text-slate-400">ⓘ</span>
              </ExplainabilityTooltip>
            </span>
          )}
        </div>
      )}

      {editing ? (
        <textarea
          value={editedContent}
          onChange={(e) => onEditedContentChange(e.target.value)}
          className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          rows={4}
        />
      ) : (
        <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">{post.content}</p>
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {post.hashtags.map((tag, idx) => (
            <span key={idx} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700 dark:bg-teal-900 dark:text-teal-300">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {post.imageSuggestion && (
        <div className="mb-3">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Suggested visual:</p>
          <p className="text-sm italic text-slate-500 dark:text-slate-400">{post.imageSuggestion}</p>
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem('session_token') || '';
                const res = await axios.get(`${API_BASE}/api/connectors/canva/design-url?postContent=${encodeURIComponent(post.content)}&platform=${platform}`, {
                  headers: { 'x-session-token': token },
                });
                window.open(res.data.canvaUrl, '_blank');
              } catch {
                window.open('https://www.canva.com/create/instagram-post/', '_blank');
              }
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#7D2AE8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#6B24D0] transition-colors"
          >
            Create this in Canva
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Edit3 className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={onSchedule}
          className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Calendar className="h-3 w-3" />
          Schedule
        </button>
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </button>
        {/* Regenerate hashtags button */}
        {onRegenerateHashtags && (
          <button
            onClick={onRegenerateHashtags}
            disabled={isRegeneratingHashtags}
            className="flex items-center gap-1 rounded-md border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRegeneratingHashtags ? 'animate-spin' : ''}`} />
            {isRegeneratingHashtags ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';
import {
  Megaphone,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Loader2,
  Inbox,
  Rocket,
  TrendingUp,
  Globe,
  Award,
  Calendar,
  Tag,
  Target,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { socket } from '../lib/socket';
import { SkeletonList } from '../components/ui/SkeletonCard';
import InfoTooltip from '../components/ui/InfoTooltip';
import FirstTimeCallout from '../components/ui/FirstTimeCallout';
import api from '../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Campaign {
  id: string;
  name: string;
  goal: string;
  status: string;
  brandProfileId: string;
  channels: string[];
  startDate: string;
  endDate: string;
  strategy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CampaignDetail extends Campaign {
  posts: { id: string; platform: string; content: string; scheduledAt: string; status: string }[];
  logs: { id: string; agentType: string; action: string; output: string; status: string; createdAt: string }[];
}

interface AgentAction {
  step: string;
  status: string;
  summary: string;
  timestamp: string;
  campaignId: string;
}

interface BrandProfile {
  id: string;
  name: string;
}

interface GoalTemplate {
  key: string;
  label: string;
  description: string;
  icon: typeof Rocket;
  questions: Array<{ field: string; label: string; placeholder: string }>;
}

const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    key: 'product_launch',
    label: 'Launch a product or service',
    description: 'Build hype and drive sales for a new launch',
    icon: Rocket,
    questions: [
      { field: 'productName', label: 'What is the product name?', placeholder: 'e.g. CloudSync Pro' },
      { field: 'problemSolved', label: 'What problem does it solve?', placeholder: 'e.g. Keeps your files in sync across all devices' },
      { field: 'price', label: 'What is the price?', placeholder: 'e.g. $29/month or Free trial' },
      { field: 'launchDate', label: 'When does it launch?', placeholder: 'e.g. July 15, 2026' },
      { field: 'targetAudience', label: 'Who is it for?', placeholder: 'e.g. Small business owners who need reliable file syncing' },
    ],
  },
  {
    key: 'grow_followers',
    label: 'Grow my Instagram following',
    description: 'Attract engaged followers who love your content',
    icon: TrendingUp,
    questions: [
      { field: 'niche', label: 'What is your niche?', placeholder: 'e.g. Handmade silver jewellery for women 25-45' },
      { field: 'idealFollower', label: 'Who is your ideal follower?', placeholder: 'e.g. Women who appreciate artisan craftsmanship' },
      { field: 'valueProposition', label: 'What value will you give them?', placeholder: 'e.g. Styling tips, behind-the-scenes, exclusive drops' },
    ],
  },
  {
    key: 'drive_website_traffic',
    label: 'Get more people to my website',
    description: 'Send targeted visitors to your site or store',
    icon: Globe,
    questions: [
      { field: 'targetPage', label: 'What is the main page you want people to visit?', placeholder: 'e.g. www.mysite.com/shop' },
      { field: 'pageContent', label: 'What will they find there?', placeholder: 'e.g. Our full collection of handmade jewellery' },
      { field: 'desiredAction', label: 'What do you want them to do?', placeholder: 'e.g. Browse and make a purchase' },
    ],
  },
  {
    key: 'build_brand_authority',
    label: 'Build my reputation as an expert',
    description: 'Establish thought leadership and credibility',
    icon: Award,
    questions: [
      { field: 'expertise', label: 'What are you an expert in?', placeholder: 'e.g. Sustainable fashion and ethical sourcing' },
      { field: 'knownBy', label: 'Who do you want to be known by?', placeholder: 'e.g. Conscious consumers and industry peers' },
    ],
  },
  {
    key: 'promote_event',
    label: 'Promote an event or launch',
    description: 'Drive registrations and buzz for your event',
    icon: Calendar,
    questions: [
      { field: 'eventName', label: 'What is the event?', placeholder: 'e.g. Summer Collection Launch Party' },
      { field: 'eventDate', label: 'When is it?', placeholder: 'e.g. July 20, 2026 at 6PM' },
      { field: 'registrationMethod', label: 'How do people register?', placeholder: 'e.g. Link in bio, RSVP form on website' },
      { field: 'attendeeValue', label: 'What will they get from attending?', placeholder: 'e.g. Early access, exclusive discounts, networking' },
    ],
  },
  {
    key: 'seasonal_sale',
    label: 'Run a sale or promotion',
    description: 'Create urgency and drive purchases',
    icon: Tag,
    questions: [
      { field: 'offerDescription', label: 'What is the offer?', placeholder: 'e.g. End of season clearance' },
      { field: 'discountDetails', label: 'What is the discount or deal?', placeholder: 'e.g. 30% off everything, BOGO on select items' },
      { field: 'endDate', label: 'When does it end?', placeholder: 'e.g. Sunday midnight' },
      { field: 'howToGetIt', label: 'How do people get it?', placeholder: 'e.g. Use code SUMMER30 at checkout' },
    ],
  },
];

interface PreviewData {
  goalType: string;
  funnelPlan: Record<number, string>;
  refinedGoal: string;
  keyMessages: string[];
  successMetrics: string[];
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  bluesky: 'Bluesky',
  threads: 'Threads',
};

const PHASE_LABELS: Record<string, string> = {
  awareness: 'Awareness',
  education: 'Education',
  social_proof: 'Social Proof',
  conversion: 'Conversion',
  engaging: 'Engaging',
  urgency: 'Urgency',
  community: 'Community',
  entertaining: 'Entertaining',
  educational: 'Educational',
  teaser: 'Teaser',
  value_preview: 'Value Preview',
  direct_cta: 'Direct CTA',
  opinion: 'Opinion',
  case_study: 'Case Study',
  thought_leadership: 'Thought Leadership',
  announce: 'Announcement',
  build_anticipation: 'Build Anticipation',
  last_chance: 'Last Chance',
  launch: 'Launch',
  tease: 'Tease',
};

const PHASE_COLORS: Record<string, string> = {
  awareness: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  education: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  social_proof: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  conversion: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  engaging: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  urgency: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  community: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  entertaining: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  launch: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  tease: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  announce: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  build_anticipation: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  last_chance: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  opinion: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  case_study: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  thought_leadership: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  teaser: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  value_preview: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  direct_cta: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  educational: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
};

function getPhaseColor(phase: string): string {
  return PHASE_COLORS[phase] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CampaignsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const addNotification = useUIStore((s) => s.addNotification);
  // Keyboard shortcut: N to open new campaign
  const handleNewCampaign = useCallback(() => {
    resetNewCampaign();
    setShowNewPanel(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleNewCampaign();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNewCampaign]);

  // New campaign form state
  const [campaignName, setCampaignName] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({});
  const [brandProfileId, setBrandProfileId] = useState('');
  const [channels, setChannels] = useState<string[]>(['instagram', 'twitter']);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [requiresHumanApproval, setRequiresHumanApproval] = useState(true);
  const [autoTime, setAutoTime] = useState(true);

  // Preview state
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns();
    fetchBrandProfiles();

    if (searchParams.get('new') === 'true') {
      setShowNewPanel(true);
      setStep(1);
      setSearchParams({}, { replace: true });
    }

    socket.on('agent:action', (data: AgentAction) => {
      if (selectedCampaign?.id === data.campaignId) {
        fetchCampaignDetail(data.campaignId);
      }
    });

    return () => {
      socket.off('agent:action');
    };
  }, [selectedCampaign?.id]);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      const res = await api.get('/api/campaigns');
      setCampaigns(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function fetchBrandProfiles() {
    try {
      const res = await api.get('/api/brand-profiles');
      setBrandProfiles(res.data);
      if (res.data.length > 0) {
        setBrandProfileId(res.data[0].id);
      }
    } catch {
      // ignore
    }
  }

  async function fetchCampaignDetail(id: string) {
    try {
      const res = await api.get(`/api/campaigns/${id}`);
      setSelectedCampaign(res.data);
    } catch {
      // ignore
    }
  }

  function resetNewCampaign() {
    setCampaignName('');
    setSelectedGoal(null);
    setGoalAnswers({});
    setChannels(['instagram', 'twitter']);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setRequiresHumanApproval(true);
    setAutoTime(true);
    setPreviewData(null);
    setPreviewError(null);
    setStep(1);
  }

  async function fetchPreview() {
    if (!selectedGoal || !brandProfileId) return;
    const goalTemplate = GOAL_TEMPLATES.find((t) => t.key === selectedGoal);
    if (!goalTemplate) return;

    // Build goal string from answers
    const answerParts = goalTemplate.questions.map((q) => {
      const answer = goalAnswers[q.field];
      return answer ? `${q.label}: ${answer}` : '';
    }).filter(Boolean);

    const goalString = answerParts.length > 0
      ? `${goalTemplate.label} — ${answerParts.join('. ')}`
      : goalTemplate.label;

    const durationDays = daysBetween(startDate, endDate);

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await api.post('/api/campaigns/preview', {
        goal: goalString,
        brandProfileId,
        goalAnswers,
        durationDays,
      });
      setPreviewData(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate preview';
      setPreviewError(msg);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedGoal || !brandProfileId || !previewData) return;

    const goalTemplate = GOAL_TEMPLATES.find((t) => t.key === selectedGoal);
    if (!goalTemplate) return;

    const answerParts = goalTemplate.questions.map((q) => {
      const answer = goalAnswers[q.field];
      return answer ? `${q.label}: ${answer}` : '';
    }).filter(Boolean);

    const goalString = answerParts.length > 0
      ? `${goalTemplate.label} — ${answerParts.join('. ')}`
      : goalTemplate.label;

    setCreating(true);
    try {
      const res = await api.post('/api/campaigns', {
        name: campaignName,
        goal: goalString,
        brandProfileId,
        channels,
        startDate,
        endDate,
      });
      setShowNewPanel(false);
      resetNewCampaign();
      fetchCampaigns();
      fetchCampaignDetail(res.data.id);
      addNotification('success', 'Campaign started', 'VIMO is building your content calendar.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign';
      alert(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleApprove() {
    if (!selectedCampaign) return;
    try {
      await api.post(`/api/campaigns/${selectedCampaign.id}/approve`, {});
      fetchCampaignDetail(selectedCampaign.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve campaign';
      alert(message);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure?')) return;
    try {
      await api.delete(`/api/campaigns/${id}`);
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
      fetchCampaigns();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete campaign';
      alert(message);
    }
  }

  const selectedGoalTemplate = GOAL_TEMPLATES.find((t) => t.key === selectedGoal);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left List */}
      <div className="flex w-full lg:w-80 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 max-h-[50vh] lg:max-h-none">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Campaigns</h2>
          <button
            id="btn-new-campaign"
            onClick={() => {
              resetNewCampaign();
              setShowNewPanel(true);
            }}
            className="rounded-full bg-teal-600 p-1.5 text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
          </button>
          <FirstTimeCallout
            targetSelector="#btn-new-campaign"
            message="Start here — click to create your first AI campaign."
            storageKey="callout_new_campaign"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-2">
            {loading ? (
              <SkeletonList count={5} />
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Inbox className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs text-slate-500">No campaigns found.</p>
                <button
                  onClick={() => {
                    resetNewCampaign();
                    setShowNewPanel(true);
                  }}
                  className="mt-2 text-xs text-teal-500 font-medium hover:underline"
                >
                  Create your first campaign
                </button>
              </div>
            ) : (
              campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => fetchCampaignDetail(c.id)}
                  className={`flex w-full items-center rounded-md border p-3 text-left transition ${
                    selectedCampaign?.id === c.id
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatDate(c.startDate)}</span>
                      <ChevronRight className="h-3 w-3" />
                      <span>{formatDate(c.endDate)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      {c.channels.slice(0, 3).map((ch) => (
                        <span
                          key={ch}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {ch}
                        </span>
                      ))}
                      {c.channels.length > 3 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">+{c.channels.length - 3}</span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Detail Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 dark:bg-slate-900/50">
        {selectedCampaign ? (
          <CampaignDetailView
            campaign={selectedCampaign}
            onDelete={handleDelete}
            onApprove={handleApprove}
          />            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <Megaphone className="mb-4 h-12 w-12 text-teal-300" />
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">You have not run a campaign yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">A campaign is the fastest way to grow.</p>
                <button
                  onClick={() => {
                    resetNewCampaign();
                    setShowNewPanel(true);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700"
                >
                  <Plus className="h-4 w-4" /> Create your first campaign
                </button>
              </div>
        )}
      </div>

      {/* New Campaign Panel */}
      {showNewPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/20 backdrop-blur-sm">
          <div className="h-full w-full max-w-lg bg-white p-8 shadow-2xl animate-in slide-in-from-right duration-300 dark:bg-slate-900 overflow-y-auto">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">New Campaign</h2>
              <button
                onClick={() => setShowNewPanel(false)}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Steps indicator */}
            <div className="mb-8 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    s <= step ? 'bg-teal-500' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Goal Selector */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">What do you want to achieve?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Choose a goal and VIMO will build a tailored marketing funnel for you.
                </p>
                <div className="space-y-3">
                  {GOAL_TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    return (
                      <button
                        key={template.key}
                        onClick={() => {
                          setSelectedGoal(template.key);
                          setGoalAnswers({});
                          setStep(2);
                        }}
                        className={`w-full rounded-xl border p-4 text-left transition hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 ${
                          selectedGoal === template.key
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{template.label}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{template.description}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Goal Details (Dynamic) */}
            {step === 2 && selectedGoalTemplate && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Tell us a bit more</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Help VIMO understand your <strong>{selectedGoalTemplate.label.toLowerCase()}</strong> goal.
                </p>
                <div className="space-y-4">
                  {selectedGoalTemplate.questions.map((q) => (
                    <div key={q.field}>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {q.label}
                      </label>
                      <input
                        type="text"
                        placeholder={q.placeholder}
                        value={goalAnswers[q.field] || ''}
                        onChange={(e) => setGoalAnswers((prev) => ({ ...prev, [q.field]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 rounded-lg bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Campaign Plan Preview */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Your campaign plan</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Here's what VIMO will do for your campaign. Review and confirm.
                </p>

                {previewLoading && (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <Loader2 className="mb-3 h-8 w-8 animate-spin text-teal-500" />
                    <p className="text-sm">Building your campaign strategy...</p>
                    <p className="text-xs text-slate-400 mt-1">This may take a moment</p>
                  </div>
                )}

                {previewError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
                    <p className="text-sm text-red-700 dark:text-red-400">{previewError}</p>
                    <button
                      onClick={fetchPreview}
                      className="mt-2 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!previewLoading && !previewError && !previewData && (
                  <button
                    onClick={fetchPreview}
                    className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-8 text-sm font-medium text-slate-500 hover:border-teal-400 hover:bg-teal-50/50 hover:text-teal-600 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-teal-500"
                  >
                    <Sparkles className="mx-auto mb-2 h-5 w-5" />
                    Click to generate your campaign plan
                  </button>
                )}

                {previewData && (
                  <div className="space-y-4">
                    {/* Refined Goal */}
                    <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/30 dark:bg-teal-900/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                          Your Goal
                        </h4>
                      </div>
                      <p className="text-sm font-medium text-teal-900 dark:text-teal-100">{previewData.refinedGoal}</p>
                    </div>

                    {/* Funnel Timeline */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                        Marketing Funnel
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(previewData.funnelPlan).map(([week, phase]) => (
                          <div key={week} className="flex items-center gap-3">
                            <div className="w-16 shrink-0 text-xs font-bold text-slate-500">
                              Week {week}
                            </div>
                            <div className="flex-1 h-8 rounded-lg flex items-center px-3">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${getPhaseColor(phase)}`}>
                                {PHASE_LABELS[phase] || phase}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Key Messages */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        Key Messages
                      </h4>
                      <ul className="space-y-1.5">
                        {previewData.keyMessages.map((msg, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" />
                            {msg}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Success Metrics */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        Success Metrics
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {previewData.successMetrics.map((metric, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                          >
                            {metric}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 rounded-lg bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  >
                    <ChevronLeft className="mr-1 inline h-4 w-4" />
                    Back
                  </button>
                  {previewData ? (
                    <>
                      <button
                        onClick={() => {
                          setPreviewData(null);
                          fetchPreview();
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-3 font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => setStep(4)}
                        className="flex-1 rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700"
                      >
                        Looks good — continue
                      </button>
                    </>
                  ) : (
                    <button
                      disabled
                      className="flex-1 rounded-lg bg-slate-200 py-3 font-bold text-slate-400 cursor-not-allowed dark:bg-slate-700"
                    >
                      Generate plan first
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Channel Selector and Date Range */}
            {step === 4 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Pick your channels & dates</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(PLATFORM_LABELS).map((platform) => (
                    <button
                      key={platform}
                      onClick={() => {
                        setChannels((prev) =>
                          prev.includes(platform)
                            ? prev.filter((c) => c !== platform)
                            : [...prev, platform]
                        );
                      }}
                      className={`rounded-lg border p-2.5 text-sm font-medium transition ${
                        channels.includes(platform)
                          ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      {PLATFORM_LABELS[platform]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 rounded-lg bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Back
                  </button>
                  <button
                    disabled={channels.length === 0}
                    onClick={() => setStep(5)}
                    className="flex-1 rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Name + Approval + Launch */}
            {step === 5 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Finalize your campaign</h3>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Campaign name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Summer Product Launch"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Require my approval before posting
                      <InfoTooltip content="When this is on, VIMO will show you all generated posts before anything goes live." />
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Pause before any content goes live.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={requiresHumanApproval}
                    onChange={(e) => setRequiresHumanApproval(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-teal-600"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Post at the best times</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">AI picks best times based on brand history.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoTime}
                    onChange={(e) => setAutoTime(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-teal-600"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Summary</h4>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {campaignName || 'Unnamed campaign'} running for {daysBetween(startDate, endDate)} days across {channels.length} channels.
                  </p>
                  {previewData && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(previewData.funnelPlan).map(([week, phase]) => (
                        <span key={week} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getPhaseColor(phase)}`}>
                          W{week}: {PHASE_LABELS[phase] || phase}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(4)}
                    className="flex-1 rounded-lg bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating || !campaignName || !previewData}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Launch Campaign
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Campaign Detail View — Section 4                                   */
/* ------------------------------------------------------------------ */

function CampaignDetailView({
  campaign,
  onDelete,
  onApprove,
}: {
  campaign: CampaignDetail;
  onDelete: (id: string) => void;
  onApprove: () => void;
}) {
  const totalPosts = campaign.posts.length;
  const publishedPosts = campaign.posts.filter((p) => p.status === 'published').length;
  const remainingPosts = totalPosts - publishedPosts;
  const durationDays = daysBetween(campaign.startDate, campaign.endDate);
  const elapsedDays = Math.max(0, Math.ceil((Date.now() - new Date(campaign.startDate).getTime()) / (1000 * 60 * 60 * 24)));
  const progressPercent = durationDays > 0 ? Math.min(100, Math.round((elapsedDays / durationDays) * 100)) : 0;
  const daysRemaining = Math.max(0, durationDays - elapsedDays);

  // Parse strategy for structured data
  let strategyData: {
    keyMessages?: string[];
    kpis?: string[];
    objective?: string;
    targetAudience?: string;
  } | null = null;
  try {
    if (campaign.strategy) {
      strategyData = JSON.parse(campaign.strategy);
    }
  } catch {
    // strategy may be unparseable text, that's fine
  }

  // Determine current week and phase from strategy
  const totalWeeks = Math.max(1, Math.ceil(durationDays / 7));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)));

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{campaign.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{campaign.goal}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status} large />
          <button
            onClick={() => onDelete(campaign.id)}
            className="rounded-md border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-slate-800 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Approval Banner */}
      {campaign.status === 'awaiting_approval' && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/30 dark:bg-teal-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-teal-500 p-2 text-white">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-teal-900 dark:text-teal-100">Ready for review</h3>
                <p className="text-sm text-teal-700 dark:text-teal-300">
                  The AI has finished generating the strategy and posts.
                </p>
              </div>
            </div>
            <button
              onClick={onApprove}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-bold text-white hover:bg-teal-700"
            >
              <Check className="h-4 w-4" />
              Approve & Schedule
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {campaign.status === 'active' || campaign.status === 'completed' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Campaign is <strong>{progressPercent}%</strong> through its timeline.
              {' '}{publishedPosts} posts published, {remainingPosts} remaining.
              {campaign.status !== 'completed' && ` Ends in ${daysRemaining} days.`}
            </p>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                campaign.status === 'completed' ? 'bg-green-500' : 'bg-teal-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{formatDate(campaign.startDate)}</span>
            <span>{formatDate(campaign.endDate)}</span>
          </div>
        </div>
      ) : null}

      {/* Goal Tracking Panel */}
      {strategyData && (strategyData.kpis || strategyData.objective) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-3 font-bold text-slate-900 dark:text-slate-100">
            <Target className="mr-2 inline h-4 w-4 text-teal-500" />
            Goal Tracking
          </h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{strategyData.objective}</p>
          {strategyData.kpis && (
            <div className="space-y-3">
              {strategyData.kpis.map((kpi, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{kpi}</span>
                    <span className="text-xs text-slate-400">— / Target</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-teal-300 dark:bg-teal-600"
                      style={{ width: '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {strategyData.keyMessages && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Key Messages</h4>
              <div className="flex flex-wrap gap-2">
                {strategyData.keyMessages.map((msg, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                  >
                    {msg}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Phase Indicator */}
      {campaign.status === 'active' || campaign.status === 'completed' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-3 font-bold text-slate-900 dark:text-slate-100">
            <BarChart3 className="mr-2 inline h-4 w-4 text-teal-500" />
            Current Phase
          </h3>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/50">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              You are in <strong>Week {currentWeek}</strong> of {totalWeeks}.
              {campaign.status === 'completed'
                ? ' This campaign has finished its full marketing funnel.'
                : ` This week's posts are part of the campaign's progression from awareness to conversion.`}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Strategy + Content */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-slate-100">Campaign Strategy</h3>
            {campaign.strategy ? (
              <div className="prose prose-sm dark:prose-invert">
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm dark:bg-slate-900/50">
                  {campaign.strategy}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Loader2 className="mb-2 h-6 w-6 animate-spin" />
                <p className="text-sm">Strategy is being generated...</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-slate-100">Scheduled Content</h3>
            <div className="space-y-4">
              {campaign.posts.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">No posts generated yet.</p>
              ) : (
                campaign.posts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-4 rounded-lg border border-slate-100 p-4 dark:border-slate-700/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {post.platform[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {post.platform}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDate(post.scheduledAt)} @ {formatTime(post.scheduledAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{post.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar: Activity + Plain English Summary */}
        <div className="space-y-4 sm:space-y-6">
          {/* Plain-English Summary */}
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-6 shadow-sm dark:border-teal-900/30 dark:bg-teal-900/10">
            <h3 className="mb-2 font-bold text-teal-900 dark:text-teal-100">
              <Sparkles className="mr-2 inline h-4 w-4" />
              Campaign Summary
            </h3>
            {campaign.status === 'active' && (
              <p className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed">
                Your campaign is {progressPercent}% through its timeline.
                {publishedPosts > 0
                  ? ` ${publishedPosts} posts have been published so far.`
                  : ' Posts are being prepared.'}
                {daysRemaining > 0
                  ? ` ${daysRemaining} days remaining to reach your goals.`
                  : ' The campaign has completed its timeline.'}
                {' '}Keep an eye on your engagement metrics to see how each phase of the funnel is performing.
              </p>
            )}
            {campaign.status === 'completed' && (
              <p className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed">
                This campaign has completed. {publishedPosts} posts were published across {campaign.channels.length} channels.
                Review the results above to inform your next campaign strategy.
              </p>
            )}
            {campaign.status === 'awaiting_approval' && (
              <p className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed">
                Your campaign plan is ready for review. Approve it to start scheduling posts.
              </p>
            )}
            {!['active', 'completed', 'awaiting_approval'].includes(campaign.status) && (
              <p className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed">
                Campaign status: {campaign.status}. The AI agent will process your campaign when it starts.
              </p>
            )}
          </div>

          {/* Agent Activity */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-slate-100">Agent Activity</h3>
            <div className="space-y-4">
              {campaign.logs.length === 0 ? (
                <p className="text-center text-xs text-slate-500">Waiting for agent to start...</p>
              ) : (
                campaign.logs.map((log) => (
                  <div key={log.id} className="relative pl-6 pb-4 last:pb-0">
                    <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-teal-500" />
                    <div className="absolute left-[3px] top-4 h-full w-[2px] bg-slate-100 dark:bg-slate-700" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {log.agentType}
                      </span>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTime(log.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  const base = `inline-flex items-center rounded-full font-medium ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px]'} capitalize`;
  switch (status) {
    case 'active':
      return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`}>Active</span>;
    case 'awaiting_approval':
      return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`}>Review</span>;
    case 'completed':
      return <span className={`${base} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400`}>Completed</span>;
    default:
      return <span className={`${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`}>{status}</span>;
  }
}

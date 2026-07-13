import { useState, useEffect } from 'react';
import {
  CheckSquare,
  Shield,
  ShieldCheck,
  Zap,
  Check,
  Edit3,
  Sparkles,
  Instagram,
  Linkedin,
  Twitter,
  Music2,
  MessageCircle,
  Send,
  Megaphone,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { socket } from '../lib/socket';
import api from '../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ApprovalRequestItem {
  id: string;
  requestType: 'publish_post' | 'send_reply' | 'start_campaign' | 'execute_director_action';
  payload: Record<string, unknown>;
  brandProfileId: string;
  requestedBy: string;
  urgency: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  humanReadableSummary: string;
}

interface ApprovalSettings {
  mode: string;
  rules: {
    maxAutoPostsPerDay: number;
    requireApprovalForFirstPostOfDay: boolean;
    requireApprovalForPromoContent: boolean;
    autoApproveEngagementRepliesAboveConfidence: number;
    blockedHours: number[];
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-4 w-4" />,
  linkedin: <Linkedin className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  tiktok: <Music2 className="h-4 w-4" />,
};

function getSectionTitle(type: string, count: number): string {
  switch (type) {
    case 'publish_post': return `Posts ready to publish (${count})`;
    case 'send_reply': return `Comment replies (${count})`;
    case 'start_campaign': return `Campaign actions (${count})`;
    case 'execute_director_action': return `Director actions (${count})`;
    default: return `${type} (${count})`;
  }
}

function getTimeDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApprovalQueuePage() {
  const [queue, setQueue] = useState<ApprovalRequestItem[]>([]);
  const [settings, setSettings] = useState<ApprovalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    fetchData();

    const handleApprovalRequested = () => {
      fetchData();
    };
    const handleApprovalExecuted = () => {
      fetchData();
    };
    const handleApprovalRejected = () => {
      fetchData();
    };

    socket.on('approval:requested', handleApprovalRequested);
    socket.on('approval:executed', handleApprovalExecuted);
    socket.on('approval:rejected', handleApprovalRejected);

    return () => {
      socket.off('approval:requested', handleApprovalRequested);
      socket.off('approval:executed', handleApprovalExecuted);
      socket.off('approval:rejected', handleApprovalRejected);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [queueRes, settingsRes] = await Promise.all([
        api.get('/api/approvals/queue'),
        api.get('/api/settings/approval-mode'),
      ]);
      setQueue(queueRes.data.queue || []);
      setSettings(settingsRes.data);
    } catch (err) {
      console.error('Failed to fetch approval data', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (mode: string) => {
    if (mode === 'autonomous') {
      setPendingMode(mode);
      setShowConfirmation(true);
    } else {
      applyMode(mode);
    }
  };

  const applyMode = async (mode: string) => {
    try {
      await api.post('/api/settings/approval-mode', { mode });
      setSettings((prev) => prev ? { ...prev, mode } : null);
      setShowConfirmation(false);
      setPendingMode(null);
    } catch (err) {
      console.error('Failed to update approval mode', err);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/api/approvals/${id}/approve`);
      fetchData();
    } catch (err) {
      console.error('Failed to approve request', err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.post(`/api/approvals/${id}/reject`, { reason: 'Rejected by user' });
      fetchData();
    } catch (err) {
      console.error('Failed to reject request', err);
    }
  };

  const handleApproveAll = async () => {
    try {
      await api.post('/api/approvals/approve-all', { requestType: 'publish_post' });
      fetchData();
    } catch (err) {
      console.error('Failed to approve all', err);
    }
  };

  const handleEdit = (item: ApprovalRequestItem) => {
    setEditingItemId(item.id);
    setEditText((item.payload as any)?.replyText || (item.payload as any)?.content || '');
  };

  const handleSaveEdit = async (itemId: string) => {
    // For now, just approve after edit
    await handleApprove(itemId);
    setEditingItemId(null);
  };

  const handleRuleChange = async (key: string, value: any) => {
    if (!settings) return;
    const newRules = { ...settings.rules, [key]: value };
    try {
      await api.post('/api/settings/approval-mode', { rules: newRules });
      setSettings({ ...settings, rules: newRules });
    } catch (err) {
      console.error('Failed to update rules', err);
    }
  };

  // Group queue by requestType
  const grouped = queue.reduce<Record<string, ApprovalRequestItem[]>>((acc, item) => {
    if (!acc[item.requestType]) acc[item.requestType] = [];
    acc[item.requestType].push(item);
    return acc;
  }, {});

  const currentMode = settings?.mode || 'assisted';

  return (
    <div className="space-y-6 p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
      {/* Header with current mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2 dark:bg-indigo-900/20">
            <CheckSquare className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Approvals</h1>
            <p className="text-sm text-slate-500">Manage what VIMO can do autonomously</p>
          </div>
        </div>
        <div className={`rounded-full px-4 py-2 text-sm font-bold ${
          currentMode === 'safe' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
          currentMode === 'autonomous' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' :
          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}>
          {currentMode === 'safe' ? '🔒 Safe Mode' : currentMode === 'autonomous' ? '⚡ Autonomous' : '🛡️ Assisted'}
        </div>
      </div>

      {/* Mode Switcher Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ModeCard
          icon={<Shield className="h-8 w-8" />}
          title="Safe"
          description="Nothing posts without your explicit approval. Maximum control."
          isActive={currentMode === 'safe'}
          color="red"
          onClick={() => handleModeChange('safe')}
        />
        <ModeCard
          icon={<ShieldCheck className="h-8 w-8" />}
          title="Assisted"
          description="VIMO prepares everything. You approve with one click. Recommended."
          isActive={currentMode === 'assisted'}
          color="amber"
          onClick={() => handleModeChange('assisted')}
        />
        <ModeCard
          icon={<Zap className="h-8 w-8" />}
          title="Autonomous"
          description="VIMO posts automatically. You are notified after. Maximum speed."
          isActive={currentMode === 'autonomous'}
          color="teal"
          onClick={() => handleModeChange('autonomous')}
        />
      </div>

      {/* Approval Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Approval Queue {queue.length > 0 && <span className="text-sm font-normal text-slate-500">({queue.length} items)</span>}
          </h2>
          {grouped['publish_post']?.length > 0 && (
            <button
              onClick={handleApproveAll}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Approve all posts
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckSquare className="h-12 w-12 text-slate-200 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">All Clear</h3>
            <p className="text-sm text-slate-500">No pending approval requests. Switch to a less restrictive mode to see more automation.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="space-y-3">
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                {getSectionTitle(type, items.length)}
              </h3>
              <div className="space-y-3">
                {items.map((item) => (
                  <ApprovalItemCard
                    key={item.id}
                    item={item}
                    onApprove={() => handleApprove(item.id)}
                    onReject={() => handleReject(item.id)}
                    onEdit={() => handleEdit(item)}
                    isEditing={editingItemId === item.id}
                    editText={editText}
                    onEditTextChange={setEditText}
                    onSaveEdit={() => handleSaveEdit(item.id)}
                    onCancelEdit={() => setEditingItemId(null)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Approval Rules Panel */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setShowRules(!showRules)}
          className="flex items-center justify-between w-full p-4"
        >
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Approval Rules</h2>
          {showRules ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {showRules && settings && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 dark:text-slate-400">Maximum auto-posts per day</label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.rules.maxAutoPostsPerDay}
                onChange={(e) => handleRuleChange('maxAutoPostsPerDay', parseInt(e.target.value) || 5)}
                className="w-20 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-center dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 dark:text-slate-400">Require approval for first post of each day</label>
              <button
                onClick={() => handleRuleChange('requireApprovalForFirstPostOfDay', !settings.rules.requireApprovalForFirstPostOfDay)}
                className={`w-12 h-6 rounded-full transition-colors ${settings.rules.requireApprovalForFirstPostOfDay ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <div className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.rules.requireApprovalForFirstPostOfDay ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-600 dark:text-slate-400">Require approval for promotional content</label>
              <button
                onClick={() => handleRuleChange('requireApprovalForPromoContent', !settings.rules.requireApprovalForPromoContent)}
                className={`w-12 h-6 rounded-full transition-colors ${settings.rules.requireApprovalForPromoContent ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <div className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.rules.requireApprovalForPromoContent ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-600 dark:text-slate-400">
                Auto-approve engagement replies with confidence above: {settings.rules.autoApproveEngagementRepliesAboveConfidence}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.rules.autoApproveEngagementRepliesAboveConfidence}
                onChange={(e) => handleRuleChange('autoApproveEngagementRepliesAboveConfidence', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-600 dark:text-slate-400">Blocked hours for auto-posting</label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                  <button
                    key={hour}
                    onClick={() => {
                      const newBlocked = settings.rules.blockedHours.includes(hour)
                        ? settings.rules.blockedHours.filter((h) => h !== hour)
                        : [...settings.rules.blockedHours, hour].sort();
                      handleRuleChange('blockedHours', newBlocked);
                    }}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${
                      settings.rules.blockedHours.includes(hour)
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {hour.toString().padStart(2, '0')}:00
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Autonomous Mode Confirmation Dialog */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-amber-50 p-2 dark:bg-amber-900/20">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Switch to Autonomous?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Switching to Autonomous mode means VIMO will publish content to your social accounts without asking. 
              You can always pause it or switch back. Are you sure?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowConfirmation(false); setPendingMode(null); }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => pendingMode && applyMode(pendingMode)}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700"
              >
                Switch to Autonomous
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mode Card Component                                                */
/* ------------------------------------------------------------------ */

function ModeCard({
  icon,
  title,
  description,
  isActive,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isActive: boolean;
  color: string;
  onClick: () => void;
}) {
  const activeBorder = color === 'red' ? 'border-red-500 ring-2 ring-red-500/20' :
    color === 'amber' ? 'border-amber-500 ring-2 ring-amber-500/20' :
    'border-teal-500 ring-2 ring-teal-500/20';

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-md ${
        isActive
          ? `${activeBorder} bg-white dark:bg-slate-800`
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
      }`}
    >
      <div className={`rounded-xl p-3 inline-block mb-3 ${
        color === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
        color === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
        'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400'
      }`}>
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Approval Item Card Component                                       */
/* ------------------------------------------------------------------ */

function ApprovalItemCard({
  item,
  onApprove,
  onReject,
  onEdit,
  isEditing,
  editText,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
}: {
  item: ApprovalRequestItem;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const payload = item.payload as any;
  const platform = payload?.platform || '';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3 mb-3">
        {item.requestType === 'publish_post' && (
          <div className="rounded-lg bg-teal-50 p-2 dark:bg-teal-900/20">
            {platformIcons[platform] || <Send className="h-4 w-4 text-teal-500" />}
          </div>
        )}
        {item.requestType === 'send_reply' && (
          <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
            <MessageCircle className="h-4 w-4 text-blue-500" />
          </div>
        )}
        {item.requestType === 'start_campaign' && (
          <div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-900/20">
            <Megaphone className="h-4 w-4 text-violet-500" />
          </div>
        )}
        {item.requestType === 'execute_director_action' && (
          <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-900/20">
            <Sparkles className="h-4 w-4 text-indigo-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {item.requestType === 'publish_post' && (
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                {payload?.content || 'No content'}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="capitalize">{platform || 'social'}</span>
                {payload?.scheduledAt && (
                  <>
                    <span>·</span>
                    <span><Clock className="h-3 w-3 inline mr-1" />{getTimeDisplay(payload.scheduledAt)}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {item.requestType === 'send_reply' && (
            <div>
              <p className="text-xs text-slate-400 mb-1">To: {payload?.authorName || 'user'}</p>
              {!isEditing ? (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 italic">{payload?.replyText || 'No reply text'}</p>
                </div>
              ) : (
                <textarea
                  value={editText}
                  onChange={(e) => onEditTextChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  rows={3}
                />
              )}
            </div>
          )}
          {item.requestType === 'start_campaign' && (
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {payload?.campaignName || 'Start Campaign'}
              </p>
            </div>
          )}
          {item.requestType === 'execute_director_action' && (
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {payload?.actionTitle || 'Director Action'}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.requestType === 'send_reply' && !isEditing && (
            <button onClick={onEdit} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Edit">
              <Edit3 className="h-4 w-4" />
            </button>
          )}
          {isEditing ? (
            <>
              <button onClick={onSaveEdit} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">Save</button>
              <button onClick={onCancelEdit} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={onApprove} className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700 transition-colors" title="Approve">
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button onClick={onReject} className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700 transition-colors" title="Reject">
                <ThumbsDown className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../config/backendPort';
import { useUIStore } from '../stores/uiStore';
import { useBrandStore } from '../stores/brandStore';
import {
  MessageCircle,
  RefreshCw,
  Send,
  User,
  CheckCircle2,
  Clock,
  EyeOff,
  SkipForward,
  Edit3,
  ShoppingCart,
  BarChart3,
  AlertCircle,
} from 'lucide-react';

interface EngagementItem {
  id: string;
  brandProfileId: string;
  platform: string;
  authorName: string;
  authorHandle: string | null;
  content: string;
  type: string;
  status: string;
  replyStatus: string | null;
  postId: string | null;
  receivedAt: string | null;
  replyContent: string | null;
  confidenceScore: number | null;
  metadataJson: string | null;
  createdAt: string;
}

interface EngagementStats {
  repliedToday: number;
  pending: number;
  purchaseEnquiries: number;
  autoReplied: number;
}

const API_BASE = import.meta.env.VITE_API_URL || BACKEND_URL;

function getIntentInfo(metadataJson: string | null): { intent: string; label: string; color: string } | null {
  if (!metadataJson) return null;
  try {
    const meta = JSON.parse(metadataJson);
    if (!meta.intent) return null;
    switch (meta.intent) {
      case 'purchase_intent':
        return { intent: meta.intent, label: 'Potential sale', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
      case 'complaint':
        return { intent: meta.intent, label: 'Complaint', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
      case 'question':
        return { intent: meta.intent, label: 'Question', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
      case 'compliment':
        return { intent: meta.intent, label: 'Compliment', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
      case 'spam':
        return { intent: meta.intent, label: 'Spam', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
      default:
        return { intent: meta.intent, label: meta.intent, color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
    }
  } catch {
    return null;
  }
}

function getSentimentBadge(metadataJson: string | null): { label: string; color: string } | null {
  if (!metadataJson) return null;
  try {
    const meta = JSON.parse(metadataJson);
    if (!meta.sentiment) return null;
    switch (meta.sentiment) {
      case 'positive':
        return { label: 'Positive', color: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
      case 'negative':
        return { label: 'Negative', color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
      case 'spam':
        return { label: 'Spam', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
      default:
        return { label: 'Neutral', color: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
    }
  } catch {
    return null;
  }
}

export default function EngagementPage() {
  const { profiles: brandProfiles, selectedId: selectedBrandId, setSelectedId: setSelectedBrandId, fetchProfiles: fetchBrandProfiles } = useBrandStore();
  const [items, setItems] = useState<EngagementItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingReply, setIsGeneratingReply] = useState<string | null>(null);
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const addNotification = useUIStore((s) => s.addNotification);

  // Keyboard shortcut: S to sync


  useEffect(() => {
    fetchBrandProfiles();
  }, [fetchBrandProfiles]);

  useEffect(() => {
    if (selectedBrandId) {
      fetchQueue();
      fetchStats();
    }
  }, [selectedBrandId]);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/engagement/queue`, {
        params: { brandProfileId: selectedBrandId },
        headers: { 'x-session-token': token },
      });
      setItems(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBrandId]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/engagement/stats`, {
        headers: { 'x-session-token': token },
      });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/sync`, {}, {
        headers: { 'x-session-token': token },
      });
      fetchQueue();
      fetchStats();
      addNotification('success', 'Sync complete', 'Comments refreshed from Instagram.');
    } catch (err) {
      console.error(err);
      addNotification('error', 'Sync failed', 'Could not fetch comments. Check your Instagram connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateReply = async (id: string) => {
    setIsGeneratingReply(id);
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/${id}/generate-reply`, {}, {
        headers: { 'x-session-token': token },
      });
      fetchQueue();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingReply(null);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/${id}/approve`, {}, {
        headers: { 'x-session-token': token },
      });
      fetchQueue();
      fetchStats();
      addNotification('success', 'Reply posted', 'Reply sent to Instagram.');
    } catch (err) {
      console.error(err);
      addNotification('error', 'Reply failed', 'Could not send reply. Please try again.');
    }
  };

  const handleEditAndReply = async (id: string) => {
    if (!editText.trim()) return;
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/${id}/edit-reply`, { replyText: editText }, {
        headers: { 'x-session-token': token },
      });
      setEditingItemId(null);
      setEditText('');
      fetchQueue();
    } catch (err) {
      console.error(err);
    }
  };

  const handleHide = async (id: string) => {
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/${id}/hide`, {}, {
        headers: { 'x-session-token': token },
      });
      fetchQueue();
      fetchStats();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSkip = async (id: string) => {
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/${id}/skip`, {}, {
        headers: { 'x-session-token': token },
      });
      fetchQueue();
      fetchStats();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUseTemplateReply = async (id: string) => {
    const templateReply = "Thanks for your interest! We'd love to help — send us a DM with your requirements and we'll get back to you with pricing and availability.";
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.post(`${API_BASE}/api/engagement/${id}/edit-reply`, { replyText: templateReply }, {
        headers: { 'x-session-token': token },
      });
      fetchQueue();
    } catch (err) {
      console.error(err);
    }
  };

  // Keyboard shortcut: S to sync
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleSync();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Separate high-priority items
  const highPriorityItems = items.filter(
    (item) => item.replyStatus === 'high_priority_review'
  );
  const regularItems = items.filter(
    (item) => item.replyStatus !== 'high_priority_review'
  );

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 py-4 dark:border-slate-700 dark:bg-slate-900 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Engagement Queue</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage interactions across all platforms</p>
          {/* Stats row */}
          {stats && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Replied today: <strong className="text-slate-700 dark:text-slate-300">{stats.repliedToday}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-blue-500" />
                Pending: <strong className="text-slate-700 dark:text-slate-300">{stats.pending}</strong>
              </span>
              <span className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3 text-amber-500" />
                Purchase enquiries: <strong className="text-slate-700 dark:text-slate-300">{stats.purchaseEnquiries}</strong>
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3 text-purple-500" />
                Auto-replied: <strong className="text-slate-700 dark:text-slate-300">{stats.autoReplied}</strong>
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedBrandId || ''}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {brandProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => { fetchQueue(); fetchStats(); }}
            className="flex items-center space-x-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center space-x-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none disabled:opacity-50"
          >
            {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>Sync now</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* 🔥 High Priority Section */}
          {highPriorityItems.length > 0 && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-5 dark:border-amber-700 dark:bg-amber-900/10">
              <h2 className="flex items-center gap-2 text-lg font-bold text-amber-800 dark:text-amber-300 mb-4">
                <AlertCircle className="h-5 w-5" />
                Needs your attention
              </h2>
              <div className="space-y-3">
                {highPriorityItems.map((item) => {
                  const intentInfo = getIntentInfo(item.metadataJson);
                  const sentiment = getSentimentBadge(item.metadataJson);
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-800 dark:bg-slate-800"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <ShoppingCart className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{item.authorName}</span>
                              <span className="text-xs text-slate-500">{item.authorHandle}</span>
                              {intentInfo && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${intentInfo.color}`}>
                                  {intentInfo.label}
                                </span>
                              )}
                              {sentiment && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${sentiment.color}`}>
                                  {sentiment.label}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">"{item.content}"</p>
                          </div>
                        </div>
                      </div>

                      {item.replyContent && (
                        <div className="mt-3 ml-12">
                          <p className="text-xs text-slate-500 mb-1">AI Suggested Reply:</p>
                          <p className="text-sm text-slate-800 dark:text-slate-200 italic bg-slate-50 dark:bg-slate-900/50 rounded p-2">
                            "{item.replyContent}"
                          </p>
                        </div>
                      )}

                      {/* Template reply for purchase intent */}
                      {item.replyStatus === 'high_priority_review' && (
                        <div className="mt-3 ml-12">
                          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1 font-medium">
                            Suggested reply for purchase enquiry:
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 italic bg-amber-50 dark:bg-amber-900/10 rounded p-2 border border-amber-200 dark:border-amber-800">
                            "Thanks for your interest! We'd love to help — send us a DM with your requirements and we'll get back to you with pricing and availability."
                          </p>
                          <button
                            onClick={() => handleUseTemplateReply(item.id)}
                            className="mt-2 text-xs bg-amber-600 text-white px-3 py-1 rounded-md hover:bg-amber-700 font-medium"
                          >
                            Use this reply
                          </button>
                        </div>
                      )}

                      <div className="mt-3 ml-12 flex gap-2 flex-wrap">
                        {item.replyContent && (
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="flex items-center gap-1 bg-teal-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-teal-700"
                          >
                            <Send className="h-3 w-3" /> Reply
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingItemId(item.id); setEditText(item.replyContent || ''); }}
                          className="flex items-center gap-1 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
                        >
                          <Edit3 className="h-3 w-3" /> Edit & Reply
                        </button>
                        <button
                          onClick={() => handleHide(item.id)}
                          className="flex items-center gap-1 border border-red-200 text-red-600 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                        >
                          <EyeOff className="h-3 w-3" /> Hide comment
                        </button>
                        <button
                          onClick={() => handleSkip(item.id)}
                          className="flex items-center gap-1 text-slate-400 px-3 py-1.5 rounded-md text-xs font-medium hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300"
                        >
                          <SkipForward className="h-3 w-3" /> Skip
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regular Queue */}
          {isLoading && items.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-teal-500" />
            </div>
          ) : regularItems.length === 0 && highPriorityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
              <MessageCircle className="h-12 w-12 text-teal-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">Nothing needs your attention right now</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 text-center max-w-md">VIMO is watching your comments and will alert you when someone needs a reply.</p>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync comments
              </button>
            </div>
          ) : (
            regularItems.map((item) => {
              const intentInfo = getIntentInfo(item.metadataJson);
              const sentiment = getSentimentBadge(item.metadataJson);
              const isReplied = item.status === 'replied';

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border bg-white p-6 shadow-sm transition-all dark:bg-slate-800 ${
                    isReplied
                      ? 'border-green-100 dark:border-green-900/30 opacity-75'
                      : 'border-slate-200 dark:border-slate-700 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                        <User className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{item.authorName}</span>
                          <span className="text-sm text-slate-500">{item.authorHandle}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 capitalize">
                            {item.platform}
                          </span>
                          {sentiment && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${sentiment.color}`}>
                              {sentiment.label}
                            </span>
                          )}
                          {intentInfo && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${intentInfo.color}`}>
                              {intentInfo.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-slate-700 dark:text-slate-300">{item.content}</p>
                        <div className="mt-3 flex items-center text-xs text-slate-400 space-x-4">
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          {item.replyStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              item.replyStatus === 'pending_review' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              item.replyStatus === 'auto_replied' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              item.replyStatus === 'spam_detected' ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' :
                              item.replyStatus === 'skipped' ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-500' :
                              'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                            }`}>
                              {item.replyStatus.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isReplied && (
                      <div className="flex items-center text-green-500 font-medium text-sm">
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Replied
                      </div>
                    )}
                  </div>

                  {/* Reply Detail Panel */}
                  {item.replyContent ? (
                    <div className="mt-6 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suggested Reply</span>
                        {item.confidenceScore != null && (
                          <div className="flex items-center">
                            <span className="text-xs text-slate-500 mr-2">Confidence:</span>
                            <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${item.confidenceScore > 80 ? 'bg-green-500' : 'bg-yellow-500'}`}
                                style={{ width: `${item.confidenceScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold ml-2 text-slate-700 dark:text-slate-300">{item.confidenceScore}%</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-200 italic">"{item.replyContent}"</p>

                      {!isReplied && editingItemId === item.id ? (
                        <div className="mt-3">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            placeholder="Edit reply text..."
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={() => { setEditingItemId(null); setEditText(''); }}
                              className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleEditAndReply(item.id)}
                              className="flex items-center gap-1 bg-teal-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-teal-700"
                            >
                              <Send className="h-3 w-3" /> Send edited reply
                            </button>
                          </div>
                        </div>
                      ) : !isReplied ? (
                        <div className="mt-4 flex justify-end space-x-2 flex-wrap">
                          <button
                            onClick={() => handleGenerateReply(item.id)}
                            className="text-xs text-slate-500 hover:text-teal-500 font-medium px-2 py-1"
                          >
                            Regenerate
                          </button>
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="flex items-center space-x-1 bg-teal-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-teal-700"
                          >
                            <Send className="h-3 w-3" />
                            <span>Reply</span>
                          </button>
                          <button
                            onClick={() => { setEditingItemId(item.id); setEditText(item.replyContent || ''); }}
                            className="flex items-center space-x-1 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit & Reply</span>
                          </button>
                          <button
                            onClick={() => handleHide(item.id)}
                            className="flex items-center space-x-1 border border-red-200 text-red-600 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                          >
                            <EyeOff className="h-3 w-3" />
                            <span>Hide comment</span>
                          </button>
                          <button
                            onClick={() => handleSkip(item.id)}
                            className="flex items-center space-x-1 text-slate-400 px-3 py-1.5 rounded-md text-xs font-medium hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300"
                          >
                            <SkipForward className="h-3 w-3" />
                            <span>Skip</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : !isReplied ? (
                    <div className="mt-6 flex justify-end space-x-2">
                      <button
                        onClick={() => handleGenerateReply(item.id)}
                        disabled={isGeneratingReply === item.id}
                        className="flex items-center space-x-2 border border-teal-500 text-teal-600 dark:text-teal-400 px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50"
                      >
                        {isGeneratingReply === item.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageCircle className="h-4 w-4" />
                        )}
                        <span>{isGeneratingReply === item.id ? 'Thinking...' : 'Generate AI Reply'}</span>
                      </button>
                      <button
                        onClick={() => handleHide(item.id)}
                        className="flex items-center space-x-1 border border-slate-300 text-slate-500 px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
                      >
                        <EyeOff className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleSkip(item.id)}
                        className="flex items-center space-x-1 text-slate-400 px-3 py-2 rounded-md text-sm font-medium hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

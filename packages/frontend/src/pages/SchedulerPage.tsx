import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Instagram,
  Linkedin,
  Twitter,
  Youtube,
  Facebook,
  PinIcon,
  MessageSquare,
  Globe,
  Plus,
  Calendar as CalendarIcon,
  X,
  Clock,
  Save,
  Trash2,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns';
import InfoTooltip from '../components/ui/InfoTooltip';
import { BACKEND_URL } from '../config/backendPort';

const API_BASE = import.meta.env.VITE_API_URL || BACKEND_URL;

interface ScheduledPost {
  id: string;
  platform: string;
  content: string;
  scheduledAt: string;
  status: string;
  mediaUrls?: string[];
  metadata?: Record<string, any>;
  brandProfileId?: string;
}

const platformColors: Record<string, string> = {
  instagram: 'bg-pink-500',
  linkedin: 'bg-teal-700',
  twitter: 'bg-slate-900',
  tiktok: 'bg-rose-400',
  youtube: 'bg-red-600',
  facebook: 'bg-blue-600',
  pinterest: 'bg-red-700',
  reddit: 'bg-orange-500',
  bluesky: 'bg-blue-400',
  threads: 'bg-slate-800',
};

const platformIcons: Record<string, React.ElementType> = {
  instagram: Instagram,
  linkedin: Linkedin,
  twitter: Twitter,
  tiktok: Globe,
  youtube: Youtube,
  facebook: Facebook,
  pinterest: PinIcon,
  reddit: MessageSquare,
  bluesky: Globe,
  threads: MessageSquare,
};

const PLATFORMS = ['instagram', 'linkedin', 'twitter', 'tiktok', 'youtube', 'facebook', 'pinterest', 'reddit', 'bluesky', 'threads'];

export default function SchedulerPage() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, [currentDate]);

  async function fetchPosts() {
    setLoading(true);
    try {
      const start = startOfMonth(currentDate).toISOString();
      const end = endOfMonth(currentDate).toISOString();
      const token = localStorage.getItem('session_token') || '';
      const res = await axios.get(`${API_BASE}/api/scheduled-posts`, {
        params: { startDate: start, endDate: end },
        headers: { 'x-session-token': token },
      });
      setPosts(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(postId: string) {
    try {
      const token = localStorage.getItem('session_token') || '';
      await axios.delete(`${API_BASE}/api/scheduled-posts/${postId}`, {
        headers: { 'x-session-token': token },
      });
      fetchPosts();
    } catch {
      // ignore
    }
  }

  function openEditModal(post: ScheduledPost) {
    setEditingPost(post);
    setEditContent(post.content);
    setEditPlatform(post.platform);
    setEditScheduledAt(post.scheduledAt);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditingPost(null);
  }

  async function handleSaveEdit() {
    if (!editingPost) return;
    setEditSaving(true);
    try {
      const token = localStorage.getItem('session_token') || '';
      const payload: Record<string, any> = {
        content: editContent,
        platform: editPlatform,
      };
      if (editScheduledAt !== editingPost.scheduledAt) {
        payload.scheduledAt = editScheduledAt;
      }
      await axios.put(`${API_BASE}/api/scheduled-posts/${editingPost.id}`, payload, {
        headers: { 'x-session-token': token },
      });
      closeEditModal();
      fetchPosts();
    } catch {
      alert('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCancelEdit() {
    if (!editingPost) return;
    if (!window.confirm('Cancel this scheduled post?')) return;
    await handleCancel(editingPost.id);
    closeEditModal();
  }

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function getPostsForDay(date: Date): ScheduledPost[] {
    return posts.filter((p) => isSameDay(new Date(p.scheduledAt), date));
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Scheduler</h1>
        <button
          onClick={() => navigate('/content')}
          className="flex items-center gap-2 rounded-md bg-teal-600 px-3 sm:px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Post</span>
        </button>
      </div>

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          className="flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <button
          onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          className="flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar grid */}
        <div className="flex-1">
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((wd) => (
              <div key={wd} className="py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {wd}
              </div>
            ))}
            {days.map((d, idx) => {
              const dayPosts = getPostsForDay(d);
              const isCurrentMonth = isSameMonth(d, currentDate);
              const isSelected = selectedDay && isSameDay(d, selectedDay);

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(d)}
                  className={`min-h-[80px] rounded-md border p-1 text-left transition ${
                    isCurrentMonth
                      ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                      : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                  } ${isSelected ? 'ring-2 ring-teal-500' : ''}`}
                >
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{format(d, 'd')}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {dayPosts.map((post) => (
                      <span
                        key={post.id}
                        className={`inline-block h-2 w-2 rounded-full ${platformColors[post.platform] || 'bg-slate-400'}`}
                        title={post.platform}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        <div className="w-full lg:w-80 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {selectedDay ? format(selectedDay, 'MMMM d, yyyy') : 'Select a date'}
            </h3>
            <InfoTooltip content={`All times are in your local timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}). VIMO will post at exactly this time.`} />
          </div>
          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {selectedDay &&
            getPostsForDay(selectedDay).map((post) => {
              const Icon = platformIcons[post.platform] || Globe;
              const statusColor =
                post.status === 'published'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : post.status === 'failed'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
              return (
                <div
                  key={post.id}
                  className="mb-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 cursor-pointer hover:border-teal-300 dark:hover:border-teal-600 transition"
                  onClick={() => openEditModal(post)}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className={`h-4 w-4 text-slate-600 dark:text-slate-400`} />
                    <span className="text-xs font-medium capitalize text-slate-600 dark:text-slate-400">
                      {post.platform}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                      {post.status}
                    </span>
                  </div>
                  <p className="mb-1 text-sm text-slate-700 dark:text-slate-300">{post.content.slice(0, 80)}...</p>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {format(new Date(post.scheduledAt), 'h:mm a')}
                    </p>
                  </div>
                </div>
              );
            })}
          {selectedDay && getPostsForDay(selectedDay).length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarIcon className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-xs text-slate-500">No posts scheduled for this day.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Post Modal */}
      {showEditModal && editingPost && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 sm:pt-16 overflow-y-auto" onClick={closeEditModal}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit Scheduled Post</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  editingPost.status === 'published'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : editingPost.status === 'failed'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                }`}>
                  {editingPost.status}
                </span>
              </div>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Post Content</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">{editContent.length} characters</p>
              </div>

              {/* Platform */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Platform</label>
                <select
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Scheduled Date/Time */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  value={editScheduledAt ? format(new Date(editScheduledAt), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setEditScheduledAt(new Date(val).toISOString());
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>

              {/* Metadata display */}
              {editingPost.metadata && Object.keys(editingPost.metadata).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Metadata</label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                    {editingPost.metadata.topic && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium">Topic:</span> {editingPost.metadata.topic}
                      </p>
                    )}
                    {editingPost.metadata.imageSuggestion && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="font-medium">Image:</span> {editingPost.metadata.imageSuggestion}
                      </p>
                    )}
                    {editingPost.metadata.hashtags && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="font-medium">Hashtags:</span> {(editingPost.metadata.hashtags as string[]).join(', ')}
                      </p>
                    )}
                    {editingPost.metadata.hashtagTiers && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="font-medium">Hashtag Tiers:</span> Available
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Post info */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div><span className="font-medium">Post ID:</span> {editingPost.id.slice(0, 8)}...</div>
                  <div><span className="font-medium">Created:</span> {format(new Date(editingPost.scheduledAt), 'MMM d, h:mm a')}</div>
                  {editingPost.brandProfileId && (
                    <div className="col-span-2"><span className="font-medium">Brand Profile:</span> {editingPost.brandProfileId.slice(0, 8)}...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4">
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900"
              >
                <Trash2 className="h-4 w-4" />
                Cancel Post
              </button>
              <div className="flex gap-2">
                <button
                  onClick={closeEditModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving || !editContent.trim()}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {editSaving ? (
                    <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="h-4 w-4" /> Save Changes</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

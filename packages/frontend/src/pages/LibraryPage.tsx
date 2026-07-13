import { useState, useEffect, useRef } from 'react';
import {
  Library,
  Instagram,
  Twitter,
  Linkedin,
  Globe,
  Film,
  FileText,
  Search,
  Filter,
  X,
  Clock,
  Sparkles,
  Trash2,
  RefreshCw,
  ChevronDown,
  Eye,
  Calendar,
  Smartphone,
  Image as ImageIcon,
  Loader2,
  Save,
  Wand2,
  Video,
  MessageSquare,
  ImagePlus,
  Square,
  Monitor,
  Send,
  Brush,
  Download,
} from 'lucide-react';
import api from '../lib/api';
import { useBrandStore } from '../stores/brandStore';

interface LibraryItem {
  id: string;
  brandProfileId: string;
  type: string;
  platform: string | null;
  title: string | null;
  content: string;
  mediaUrl: string | null;
  mediaUrls: string[];
  metadata: Record<string, any>;
  status: string;
  source: string;
  websiteContext: any;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

type CreativeMode = 'text-to-image' | 'edit-image' | 'image-to-video' | 'text-to-video' | 'social-post';

const platformConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  instagram: { icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/20', label: 'Instagram' },
  twitter: { icon: Twitter, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/20', label: 'Twitter' },
  linkedin: { icon: Linkedin, color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'LinkedIn' },
  tiktok: { icon: Film, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', label: 'TikTok' },
  facebook: { icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'Facebook' },
};

const MODES: { key: CreativeMode; icon: any; label: string; color: string }[] = [
  { key: 'text-to-image', icon: ImagePlus, label: 'Text to Image', color: 'from-violet-500 to-purple-600' },
  { key: 'edit-image', icon: Brush, label: 'Edit Image', color: 'from-amber-500 to-orange-600' },
  { key: 'image-to-video', icon: Video, label: 'Image to Video', color: 'from-emerald-500 to-teal-600' },
  { key: 'text-to-video', icon: Film, label: 'Text to Video', color: 'from-rose-500 to-pink-600' },
  { key: 'social-post', icon: MessageSquare, label: 'Social Post', color: 'from-sky-500 to-blue-600' },
];

const ASPECT_RATIOS = [
  { key: '1:1', label: '1:1', icon: Square, desc: 'Square' },
  { key: '16:9', label: '16:9', icon: Monitor, desc: 'Landscape' },
  { key: '9:16', label: '9:16', icon: Smartphone, desc: 'Portrait' },
  { key: '4:3', label: '4:3', icon: Square, desc: 'Classic' },
  { key: '3:2', label: '3:2', icon: Monitor, desc: 'Photo' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function LibraryPage() {
  const { profiles: brandProfiles } = useBrandStore();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [showBottomBar, setShowBottomBar] = useState(true);

  const [mode, setMode] = useState<CreativeMode>('text-to-image');
  const [promptText, setPromptText] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemUrl, setEditItemUrl] = useState<string | null>(null);

  const [editingImage, setEditingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchItems(); }, [selectedBrand, selectedType, selectedPlatform]);

  async function fetchItems() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBrand) params.set('brandProfileId', selectedBrand);
      if (selectedType) params.set('type', selectedType);
      if (selectedPlatform) params.set('platform', selectedPlatform);
      const res = await api.get(`/api/content-library?${params.toString()}`);
      setItems(res.data);
    } catch { }
    finally { setLoading(false); }
  }

  const filteredItems = searchQuery
    ? items.filter(item =>
        (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  async function handleGenerate() {
    if (!promptText.trim() || generating) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      if (mode === 'edit-image' && editItemId) {
        const res = await api.post(`/api/content-library/${editItemId}/edit-image`, {
          editPrompt: promptText.trim(),
        });
        const updated = res.data;
        setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
        if (previewItem?.id === updated.id) {
          setPreviewItem(prev => prev ? { ...prev, ...updated } : null);
        }
        setEditItemId(null);
        setEditItemUrl(null);
      } else if (mode === 'image-to-video' || mode === 'text-to-video') {
        const res = await api.post('/api/content-library/generate', {
          brandProfileId: selectedBrand || brandProfiles[0]?.id,
          type: 'video',
          platform: 'tiktok',
          prompt: promptText.trim(),
          aspectRatio: aspectRatio || '9:16',
          mediaUrl: editItemUrl || undefined,
        });
        setItems(prev => [res.data, ...prev]);
      } else if (mode === 'social-post') {
        const res = await api.post('/api/content-library/generate', {
          brandProfileId: selectedBrand || brandProfiles[0]?.id,
          type: 'social_post',
          platform: 'instagram',
          prompt: promptText.trim(),
        });
        setItems(prev => [res.data, ...prev]);
      } else {
        const res = await api.post('/api/content-library/generate', {
          brandProfileId: selectedBrand || brandProfiles[0]?.id,
          type: 'image',
          prompt: promptText.trim(),
          aspectRatio: aspectRatio || '1:1',
        });
        setItems(prev => [res.data, ...prev]);
      }
      setPromptText('');
      setTimeout(() => gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Generation failed. Please try again.';
      setGenerationError(msg);
    } finally {
      setGenerating(false);
    }
  }

  function handleEditClick(item: LibraryItem) {
    setMode('edit-image');
    setEditItemId(item.id);
    setEditItemUrl(item.mediaUrl);
    setPromptText('');
    setGenerationError(null);
    setShowBottomBar(true);
    promptInputRef.current?.focus();
  }

  function handleImageToVideo(item: LibraryItem) {
    setMode('image-to-video');
    setEditItemUrl(item.mediaUrl);
    setPromptText('');
    setGenerationError(null);
    setShowBottomBar(true);
    promptInputRef.current?.focus();
  }

  function getModePlaceholder(): string {
    switch (mode) {
      case 'text-to-image': return 'Describe the image you want to create...';
      case 'edit-image': return 'Tell AI how to edit this image...';
      case 'image-to-video': return 'Describe the animation or motion for this image...';
      case 'text-to-video': return 'Describe the video you want to create...';
      case 'social-post': return 'What do you want to post about?';
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] relative overflow-hidden bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Main scrollable content area */}
      <div ref={gridRef} className="flex-1 overflow-y-auto pb-48">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Library className="h-6 w-6 text-teal-600" />
                Studio
              </h1>
              <p className="text-sm text-slate-500 mt-1">Create, edit, and manage your creative assets</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchItems} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition" title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition flex items-center gap-2 ${
                  showFilters ? 'border-teal-500 text-teal-600 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
                }`}
              >
                <Filter className="h-4 w-4" />
                Filters
                <ChevronDown className={`h-3 w-3 transition ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              {(selectedBrand || selectedType || selectedPlatform || searchQuery) && (
                <button
                  onClick={() => { setSelectedBrand(''); setSelectedType(''); setSelectedPlatform(''); setSearchQuery(''); }}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">All Brands</option>
                  {brandProfiles.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">All Types</option>
                  <option value="social_post">Social Posts</option>
                  <option value="image">Images</option>
                  <option value="video">Videos</option>
                  <option value="ad_copy">Ad Copy</option>
                  <option value="email">Emails</option>
                </select>
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">All Platforms</option>
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="tiktok">TikTok</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>
            )}
          </div>

          {/* Content Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1,2,3,4,5,6,7,8].map((i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse dark:border-slate-700 dark:bg-slate-800">
                  <div className="h-4 bg-slate-200 rounded w-1/3 mb-3 dark:bg-slate-700" />
                  <div className="h-32 bg-slate-200 rounded mb-3 dark:bg-slate-700" />
                  <div className="h-3 bg-slate-200 rounded w-full mb-2 dark:bg-slate-700" />
                  <div className="h-3 bg-slate-200 rounded w-2/3 dark:bg-slate-700" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-400 to-purple-500 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400">No content yet</h3>
              <p className="text-sm text-slate-400 mt-1 mb-4">Describe what you want to create below and let AI do the work.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => {
                const platform = item.platform ? platformConfig[item.platform] : null;
                const Icon = platform?.icon || FileText;
                const color = platform?.color || 'text-slate-500';
                const bg = platform?.bg || 'bg-slate-50 dark:bg-slate-800';
                const isImage = item.type === 'image' || item.mediaUrl?.match(/\.(png|jpg|jpeg|gif|webp)/i);

                return (
                  <div
                    key={item.id}
                    className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-teal-300 cursor-pointer transition-all duration-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-600"
                  >
                    {item.mediaUrl && (
                      <div className="relative aspect-square bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <img
                          src={item.mediaUrl}
                          alt={item.title || 'Content'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        {isImage && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEditClick(item); }}
                              className="rounded-full bg-white/90 p-2 text-slate-800 hover:bg-white shadow-lg hover:scale-110 transition-all"
                              title="Edit with AI"
                            >
                              <Brush className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleImageToVideo(item); }}
                              className="rounded-full bg-white/90 p-2 text-slate-800 hover:bg-white shadow-lg hover:scale-110 transition-all"
                              title="Animate this image"
                            >
                              <Video className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-3" onClick={() => setPreviewItem(item)}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className={`p-1 rounded-md ${bg}`}>
                            <Icon className={`h-3 w-3 ${color}`} />
                          </div>
                          <span className="text-[10px] font-medium text-slate-500 capitalize">{platform?.label || item.type.replace('_', ' ')}</span>
                        </div>
                        {item.source === 'ai_generated' && (
                          <Sparkles className="h-3 w-3 text-purple-400" />
                        )}
                      </div>

                      {item.title && (
                        <h3 className="text-xs font-semibold text-slate-800 mb-1 line-clamp-1 dark:text-slate-200">{item.title}</h3>
                      )}

                      {!item.mediaUrl && (
                        <p className="text-[11px] text-slate-600 line-clamp-3 mb-2 leading-relaxed dark:text-slate-400">{item.content}</p>
                      )}

                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDate(item.generatedAt)}
                        </div>
                        <Eye className="h-3 w-3 text-teal-500 opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Higgsfield-style floating prompt bar */}
      <div className={`fixed inset-x-0 bottom-0 z-40 flex flex-col items-center justify-end pb-6 sm:pb-8 px-3 pointer-events-none transition-all duration-500 ${showBottomBar ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
        {/* Edit/Animate indicator above card */}
        {mode === 'edit-image' && editItemUrl && (
          <div className="pointer-events-auto mb-2.5 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-600/5 dark:from-amber-400/10 dark:to-amber-500/5 border border-amber-500/20 dark:border-amber-400/20 backdrop-blur-sm px-4 py-2 shadow-lg">
            <Brush className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Editing image — describe changes</span>
            <button onClick={() => { setEditItemId(null); setEditItemUrl(null); setMode('text-to-image'); }} className="shrink-0 rounded-full p-0.5 text-amber-400 hover:text-amber-600 hover:bg-amber-500/10 transition ml-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {mode === 'image-to-video' && editItemUrl && (
          <div className="pointer-events-auto mb-2.5 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-600/5 dark:from-emerald-400/10 dark:to-teal-500/5 border border-emerald-500/20 dark:border-emerald-400/20 backdrop-blur-sm px-4 py-2 shadow-lg">
            <Video className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Animating image — describe motion</span>
            <button onClick={() => { setEditItemId(null); setEditItemUrl(null); setMode('text-to-image'); }} className="shrink-0 rounded-full p-0.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-500/10 transition ml-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main card — Higgsfield-inspired design */}
        <div className="pointer-events-auto w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.2)] backdrop-blur-sm transition-all duration-200 focus-within:border-teal-400/60 dark:focus-within:border-teal-500/60 focus-within:shadow-[0_8px_32px_rgba(13,148,136,0.12),0_0_0_2px_rgba(13,148,136,0.12)] dark:focus-within:shadow-[0_8px_32px_rgba(13,148,136,0.2),0_0_0_2px_rgba(13,148,136,0.15)]">
          {/* Mode pills — inline at top of card */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-1.5 overflow-x-auto hide-scrollbar">
            {MODES.map((m) => {
              const isActive = mode === m.key;
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); setEditItemId(null); setEditItemUrl(null); setGenerationError(null); }}
                  className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold tracking-tight transition-all whitespace-nowrap ${
                    isActive
                      ? `bg-gradient-to-r ${m.color} text-white shadow-sm shadow-black/10 scale-105`
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Error message */}
          {generationError && (
            <div className="px-4 pt-0 pb-1">
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
                <span className="shrink-0">⚠</span>
                <span>{generationError}</span>
                <button onClick={() => setGenerationError(null)} className="shrink-0 ml-auto p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-800/30 transition">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Text input row */}
          <div className="flex items-end gap-3 px-4 py-2">
            <div className="flex-1">
              <textarea
                ref={promptInputRef}
                value={promptText}
                onChange={(e) => { setPromptText(e.target.value); setGenerationError(null); }}
                placeholder={getModePlaceholder()}
                rows={1}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                className="w-full border-0 bg-transparent px-1 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none dark:text-slate-100 dark:placeholder-slate-500 leading-relaxed"
              />
            </div>

            <div className="shrink-0 pb-0.5">
              <button
                onClick={handleGenerate}
                disabled={generating || !promptText.trim()}
                className="flex items-center justify-center rounded-xl w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/15 hover:from-teal-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all active:scale-90"
                title="Generate"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Footer toolbar — brand, aspect ratio, char count */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100/80 dark:border-slate-700/30">
            <div className="flex items-center gap-2">
              <select
                value={selectedBrand || ''}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="appearance-none rounded-lg bg-slate-100/60 dark:bg-slate-700/40 border-0 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-600/40 transition-colors"
              >
                <option value="">Brand</option>
                {brandProfiles.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {(mode === 'text-to-image' || mode === 'image-to-video' || mode === 'text-to-video') && (
                <div className="flex gap-0.5">
                  {ASPECT_RATIOS.slice(0, 3).map((r) => {
                    const RI = r.icon;
                    const isActive = aspectRatio === r.key;
                    return (
                      <button
                        key={r.key}
                        onClick={() => setAspectRatio(r.key)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all ${
                          isActive
                            ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/30'
                        }`}
                        title={r.desc}
                      >
                        <RI className="h-3 w-3" />
                        {r.key}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 tabular-nums">
              {promptText.length || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Preview / Edit Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 sm:pt-12 overflow-y-auto" onClick={() => setPreviewItem(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Eye className="h-5 w-5 text-teal-600" />
                {previewItem.type === 'image' ? 'Image Preview' : 'Post Preview'}
              </h2>
              <button onClick={() => setPreviewItem(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick actions toolbar */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {previewItem.type === 'image' && previewItem.mediaUrl && (
                <>
                  <button
                    onClick={() => handleEditClick(previewItem)}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-700 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 transition"
                  >
                    <Brush className="h-3.5 w-3.5" />
                    Edit with AI
                  </button>
                  <button
                    onClick={() => handleImageToVideo(previewItem)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 transition"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Animate
                  </button>
                </>
              )}
              {previewItem.mediaUrl && (
                <a
                  href={previewItem.mediaUrl}
                  download
                  className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              )}
            </div>

            {/* Platform tabs */}
            <div className="flex gap-2 mb-6">
              {['instagram', 'twitter', 'linkedin', 'tiktok'].map((p) => {
                const cfg = platformConfig[p];
                const PFIcon = cfg.icon;
                const isActive = previewItem.platform === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPreviewItem({ ...previewItem, platform: p })}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      isActive ? `${cfg.bg} ${cfg.color}` : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    <PFIcon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Content display */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              <div className="mx-auto max-w-sm">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {previewItem.title ? previewItem.title[0].toUpperCase() : 'V'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      {previewItem.title || 'VIMO Brand'}
                    </p>
                    <p className="text-[11px] text-slate-400">Sponsored</p>
                  </div>
                  <Smartphone className="h-4 w-4 text-slate-300" />
                </div>

                {previewItem.mediaUrl && (
                  <div className="bg-slate-100 dark:bg-slate-800 relative group">
                    <img
                      src={previewItem.mediaUrl}
                      alt="Post visual"
                      className="w-full aspect-square object-cover"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = 'none';
                        el.parentElement!.classList.add('hidden');
                      }}
                    />
                    <button
                      onClick={() => {
                        setEditingImage(!editingImage);
                        setImagePrompt(previewItem.metadata?.prompt || '');
                        setNewImageUrl(previewItem.mediaUrl || '');
                      }}
                      className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition hover:bg-black/80"
                      title="Edit image"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* AI Image Edit panel in preview */}
                {editingImage && (
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-purple-500" />
                      AI Edit Image
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Image URL</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newImageUrl}
                            onChange={(e) => setNewImageUrl(e.target.value)}
                            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-700"
                            placeholder="https://..."
                          />
                          <button
                            onClick={async () => {
                              if (!newImageUrl) return;
                              try {
                                await api.put(`/api/content-library/${previewItem.id}`, { mediaUrl: newImageUrl, mediaUrls: [newImageUrl] });
                                setPreviewItem({ ...previewItem, mediaUrl: newImageUrl, mediaUrls: [newImageUrl] });
                                await fetchItems();
                              } catch { alert('Failed to update image'); }
                            }}
                            className="rounded-md bg-teal-600 px-2 py-1.5 text-xs text-white hover:bg-teal-700"
                          >
                            <Save className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Tell AI to edit this image</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={imagePrompt}
                            onChange={(e) => setImagePrompt(e.target.value)}
                            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-700"
                            placeholder="e.g. 'make background sunset', 'add neon glow'..."
                          />
                          <button
                            onClick={async () => {
                              if (!imagePrompt) return;
                              setRegenerating(true);
                              try {
                                const res = await api.post(`/api/content-library/${previewItem.id}/edit-image`, {
                                  editPrompt: imagePrompt,
                                });
                                const updated = res.data;
                                setPreviewItem(prev => prev ? { ...prev, ...updated } : null);
                                setNewImageUrl(updated.mediaUrl || '');
                                await fetchItems();
                              } catch { alert('Failed to edit image'); }
                              finally { setRegenerating(false); }
                            }}
                            disabled={regenerating || !imagePrompt}
                            className="rounded-md bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-1.5 text-xs text-white hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                            Apply Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="px-4 py-3">
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line dark:text-slate-200">
                    {previewItem.content}
                  </p>
                  <div className="flex items-center gap-1 mt-3 text-[10px] text-slate-400 uppercase tracking-wide">
                    <Calendar className="h-3 w-3" />
                    {formatDate(previewItem.generatedAt)} at {formatTime(previewItem.generatedAt)}
                    <span className="mx-1">·</span>
                    <Globe className="h-3 w-3" />
                    {previewItem.platform || 'Web'}
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {['Like', 'Comment', 'Share'].map((action) => (
                      <button key={action} className="text-xs text-slate-400 hover:text-slate-600 transition flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700" />
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Edit history */}
            {previewItem.metadata?.editHistory?.length > 0 && (
              <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Edit History ({previewItem.metadata.editHistory.length})
                </h4>
                <div className="space-y-1.5">
                  {previewItem.metadata.editHistory.map((edit: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="truncate max-w-[250px]">{edit.editPrompt}</span>
                      <span className="text-slate-400 shrink-0 ml-2">{new Date(edit.editedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            {previewItem.metadata && Object.keys(previewItem.metadata).length > 0 && !previewItem.metadata.editHistory && (
              <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Details</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {previewItem.metadata.prompt && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Prompt:</span>
                      <p className="text-slate-700 dark:text-slate-300 text-[11px]">{previewItem.metadata.prompt}</p>
                    </div>
                  )}
                  {previewItem.metadata.aspectRatio && (
                    <div>
                      <span className="text-slate-400">Aspect Ratio:</span>
                      <p className="text-slate-700 dark:text-slate-300">{previewItem.metadata.aspectRatio}</p>
                    </div>
                  )}
                  {previewItem.metadata.provider && (
                    <div>
                      <span className="text-slate-400">Provider:</span>
                      <p className="text-slate-700 dark:text-slate-300 capitalize">{previewItem.metadata.provider}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400">Source:</span>
                    <p className="text-slate-700 dark:text-slate-300 capitalize">{previewItem.source.replace('_', ' ')}</p>
                  </div>
                  {previewItem.metadata.topic && (
                    <div>
                      <span className="text-slate-400">Topic:</span>
                      <p className="text-slate-700 dark:text-slate-300">{previewItem.metadata.topic}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/api/content-library/${previewItem.id}`);
                    setItems(items.filter(i => i.id !== previewItem.id));
                    setPreviewItem(null);
                  } catch { alert('Failed to delete'); }
                }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button onClick={() => setPreviewItem(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import api from '../../lib/api';
import { socket } from '../../lib/socket';
import MarkdownLite from './MarkdownLite';
import {
  Sparkles,
  Send,
  X,
  Loader2,
  ArrowUpRight,
  Square,
  Copy,
  Check,
  Trash2,
  Wrench,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToolRun {
  name: string;
  args?: unknown;
  status: 'running' | 'ok' | 'fail';
  summary?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolRuns?: ToolRun[];
  quickReplies?: string[];
  navigationTarget?: string;
  isError?: boolean;
  streaming?: boolean;
}

/** Live frame emitted by the backend over Socket.IO. */
interface AssistantEvent {
  sessionId: string;
  type: 'delta' | 'tool_start' | 'tool_result' | 'done' | 'error';
  text?: string;
  toolName?: string;
  args?: unknown;
  ok?: boolean;
  summary?: string;
  navigationTarget?: string;
  quickReplies?: string[];
  stopped?: boolean;
  message?: string;
}

const QUICK_STARTS = [
  { emoji: '🚀', label: 'Start autopilot', prompt: 'Start autopilot to grow my Instagram for the next 14 days' },
  { emoji: '✍️', label: 'Write & schedule a post', prompt: 'Write a post about industry trends and schedule it for tomorrow at 9am' },
  { emoji: '📊', label: 'Analyze performance', prompt: 'How did my content perform recently, and what should I change?' },
  { emoji: '🔥', label: 'Roast my brand', prompt: 'Roast my brand and tell me what to fix first' },
];

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function ToolRunRow({ run }: { run: ToolRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2.5 py-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[11px] font-medium text-slate-300 hover:text-white"
      >
        {run.status === 'running' ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-teal-400" />
        ) : run.status === 'ok' ? (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
        ) : (
          <XCircle className="h-3 w-3 shrink-0 text-red-400" />
        )}
        <Wrench className="h-3 w-3 shrink-0 text-slate-500" />
        <span className="font-mono">{run.name}</span>
        {run.summary && <span className="truncate text-slate-500">— {run.summary}</span>}
      </button>
      {open && run.args !== undefined && (
        <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-slate-950 p-2 font-mono text-[10px] leading-snug text-slate-400">
          {JSON.stringify(run.args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: '300ms' }} />
      <span className="text-[11px] text-slate-500">VIMO is working…</span>
    </div>
  );
}

function newSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/*  Main docked assistant                                              */
/* ------------------------------------------------------------------ */

export default function VimoAssistant() {
  const navigate = useNavigate();
  const {
    isAssistantOpen,
    toggleAssistant,
    setAssistantOpen,
    hasUnreadAssistant,
    setHasUnreadAssistant,
    assistantWidth,
    setAssistantWidth,
  } = useUIStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );

  const sessionIdRef = useRef(newSessionId());
  const streamingMsgIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /* ---------------- session bootstrap ---------------- */
  useEffect(() => {
    let sid: string | null = null;
    try {
      sid = sessionStorage.getItem('vimo_assistant_session');
      if (!sid) {
        sid = newSessionId();
        sessionStorage.setItem('vimo_assistant_session', sid);
      }
      const stored = sessionStorage.getItem('vimo_assistant_messages');
      if (stored) {
        try {
          setMessages(JSON.parse(stored) as ChatMessage[]);
        } catch {
          // corrupted cache — start fresh
          console.warn('[vimo] discarding corrupted assistant cache');
        }
      }
    } catch (err) {
      console.warn('[vimo] best-effort operation failed:', err);
    }
    sessionIdRef.current = sid || newSessionId();

    const onResize = () => setIsNarrow(window.matchMedia('(max-width: 767px)').matches);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('vimo_assistant_messages', JSON.stringify(messages.slice(-60)));
    } catch (err) {
      console.warn('[vimo] best-effort operation failed:', err);
    }
  }, [messages]);

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleAssistant();
      }
      if (e.key === 'Escape' && isAssistantOpen) {
        setAssistantOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAssistant, setAssistantOpen, isAssistantOpen]);

  useEffect(() => {
    if (isAssistantOpen) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [isAssistantOpen]);

  /* ---------------- live stream over socket ---------------- */
  useEffect(() => {
    const patchStreamed = (fn: (m: ChatMessage) => ChatMessage) => {
      const id = streamingMsgIdRef.current;
      if (!id) return;
      setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    };

    const handler = (raw: unknown) => {
      const ev = raw as AssistantEvent;
      if (!ev || ev.sessionId !== sessionIdRef.current) return;

      switch (ev.type) {
        case 'delta':
          if (ev.text) patchStreamed((m) => ({ ...m, content: m.content + ev.text }));
          break;

        case 'tool_start':
          patchStreamed((m) => ({
            ...m,
            toolRuns: [
              ...(m.toolRuns || []),
              { name: ev.toolName || 'tool', args: ev.args, status: 'running' as const },
            ],
          }));
          break;

        case 'tool_result':
          patchStreamed((m) => {
            const runs = [...(m.toolRuns || [])];
            for (let i = runs.length - 1; i >= 0; i--) {
              if (runs[i].name === ev.toolName && runs[i].status === 'running') {
                runs[i] = { ...runs[i], status: ev.ok === false ? 'fail' : 'ok', summary: ev.summary };
                break;
              }
            }
            return { ...m, toolRuns: runs };
          });
          break;

        case 'done': {
          const wasStopped = ev.stopped === true;
          patchStreamed((m) => ({
            ...m,
            streaming: false,
            content:
              m.content ||
              (wasStopped ? '_Stopped._' : "_Done — I didn't have anything to add._"),
            quickReplies: ev.quickReplies,
            navigationTarget: ev.navigationTarget,
            toolRuns: (m.toolRuns || []).map((r) =>
              r.status === 'running' ? { ...r, status: 'ok' as const, summary: r.summary ?? '' } : r,
            ),
          }));
          streamingMsgIdRef.current = null;
          setIsStreaming(false);
          break;
        }

        case 'error':
          patchStreamed((m) => ({
            ...m,
            streaming: false,
            isError: true,
            content: ev.message || 'Something went wrong.',
            toolRuns: (m.toolRuns || []).map((r) =>
              r.status === 'running' ? { ...r, status: 'fail' as const } : r,
            ),
          }));
          streamingMsgIdRef.current = null;
          setIsStreaming(false);
          break;
      }
    };

    socket.on('assistant:event', handler);
    return () => {
      socket.off('assistant:event', handler);
    };
  }, []);

  /* unread dot when messages land while closed */
  useEffect(() => {
    if (!isAssistantOpen && messages.length > 1 && !isStreaming) {
      setHasUnreadAssistant(true);
    }
  }, [isAssistantOpen, messages.length, isStreaming, setHasUnreadAssistant]);

  /* auto-scroll (stick to bottom unless the user scrolled up) */
  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  /* ---------------- sending ---------------- */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    const streamMsg: ChatMessage = {
      id: `stream-${Date.now()}`,
      role: 'assistant',
      content: '',
      toolRuns: [],
      streaming: true,
    };
    streamingMsgIdRef.current = streamMsg.id;
    setMessages((prev) => [...prev, userMsg, streamMsg]);
    setInputValue('');
    setIsStreaming(true);
    stickToBottomRef.current = true;

    try {
      await api.post('/api/assistant/chat', {
        message: trimmed,
        sessionId: sessionIdRef.current,
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      streamingMsgIdRef.current = null;
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamMsg.id
            ? {
                ...m,
                streaming: false,
                isError: true,
                content:
                  status === 429
                    ? 'Too many requests — take a breath and try again in a minute.'
                    : "I couldn't reach the server. Is VIMO still running?",
              }
            : m,
        ),
      );
    }
  }, [isStreaming]);

  const stopStreaming = useCallback(async () => {
    try {
      await api.post('/api/assistant/stop', { sessionId: sessionIdRef.current });
    } catch (err) {
      console.warn('[vimo] best-effort operation failed:', err);
    }
  }, []);

  const clearChat = useCallback(async () => {
    setMessages([]);
    streamingMsgIdRef.current = null;
    setIsStreaming(false);
    sessionIdRef.current = newSessionId();
    try {
      sessionStorage.setItem('vimo_assistant_session', sessionIdRef.current);
      sessionStorage.removeItem('vimo_assistant_messages');
    } catch (err) {
      console.warn('[vimo] best-effort operation failed:', err);
    }
    try {
      await api.post('/api/assistant/stop', { sessionId: sessionIdRef.current });
    } catch {
      // nothing to stop
    }
  }, []);

  const copyMessage = useCallback(async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.warn('[vimo] best-effort operation failed:', err);
    }
  }, []);

  /* ---------------- resize handle ---------------- */
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onMove = (ev: MouseEvent) => setAssistantWidth(window.innerWidth - ev.clientX);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [setAssistantWidth],
  );

  /* ---------------- input handling ---------------- */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  const formatNavLabel = (target?: string) => {
    if (!target) return '';
    const page = target.split('/')[1] || '';
    return page.charAt(0).toUpperCase() + page.slice(1);
  };

  const showWelcome = messages.length === 0;

  /* ---------------- render ---------------- */
  return (
    <>
      {/* Floating launcher button (when closed) */}
      {!isAssistantOpen && (
        <button
          onClick={toggleAssistant}
          title="VIMO Assistant (Ctrl+K)"
          className={`fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-indigo-500 text-white shadow-xl shadow-teal-500/25 transition-all hover:scale-105 active:scale-95 ${
            hasUnreadAssistant ? 'animate-pulse' : ''
          }`}
        >
          <Sparkles className="h-6 w-6" />
          {hasUnreadAssistant && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-slate-900" />
          )}
        </button>
      )}

      {/* Docked agent panel */}
      {isAssistantOpen && (
        <>
          {/* Mobile backdrop */}
          {isNarrow && (
            <div
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
              onClick={() => setAssistantOpen(false)}
            />
          )}

          <aside
            className={`fixed inset-y-0 right-0 z-40 flex flex-col border-l border-slate-700/70 bg-[#0a0f1c] shadow-2xl shadow-black/50 ${
              isNarrow ? 'w-full' : ''
            }`}
            style={isNarrow ? undefined : { width: assistantWidth }}
            role="complementary"
            aria-label="VIMO Assistant"
          >
            {/* Drag-to-resize handle (desktop) */}
            {!isNarrow && (
              <div
                onMouseDown={startResize}
                className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-teal-500/40"
                title="Drag to resize"
              />
            )}

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-indigo-500">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold leading-none text-white">VIMO Assistant</div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {isStreaming ? 'working…' : 'ready'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  title="New conversation"
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setAssistantOpen(false)}
                  title="Close (Esc)"
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {showWelcome && (
                <div className="pt-6">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-indigo-500">
                      <Sparkles className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">Hey — I'm VIMO.</div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">
                        I don't just answer questions — I <span className="text-slate-200">run your marketing</span>.
                        I can write posts, schedule them, launch campaigns & autopilot, analyze results, track trends and
                        competitors, search the web, and jump you anywhere in the app.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {QUICK_STARTS.map((qs) => (
                      <button
                        key={qs.label}
                        onClick={() => sendMessage(qs.prompt)}
                        className="rounded-xl border border-slate-700/70 bg-slate-900/50 px-3 py-2.5 text-left text-xs font-medium text-slate-300 transition-colors hover:border-teal-500/40 hover:bg-slate-800 hover:text-white"
                      >
                        <span className="mr-1.5">{qs.emoji}</span>
                        {qs.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`group ${isUser ? 'flex justify-end' : ''}`}>
                    <div className={`${isUser ? 'max-w-[88%]' : 'w-full'}`}>
                      <div
                        className={
                          isUser
                            ? 'rounded-2xl rounded-tr-md bg-gradient-to-br from-teal-500 to-teal-600 px-4 py-2.5 text-sm leading-relaxed text-white'
                            : msg.isError
                              ? 'rounded-2xl rounded-tl-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200'
                              : 'rounded-2xl rounded-tl-md border border-slate-700/60 bg-slate-900/70 px-4 py-2.5 text-slate-200'
                        }
                      >
                        {isUser ? (
                          msg.content
                        ) : msg.content ? (
                          <MarkdownLite text={msg.content} />
                        ) : msg.streaming ? (
                          <TypingIndicator />
                        ) : null}

                        {msg.streaming && msg.content && (
                          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-teal-400 align-text-bottom" />
                        )}
                      </div>

                      {/* Tool activity trail */}
                      {!!msg.toolRuns?.length && (
                        <div className="mt-2 space-y-1.5">
                          {msg.toolRuns.map((run, i) => (
                            <ToolRunRow key={`${msg.id}-tool-${i}`} run={run} />
                          ))}
                        </div>
                      )}

                      {/* Actions under assistant messages */}
                      {!isUser && !msg.streaming && msg.content && (
                        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => copyMessage(msg)}
                            title="Copy"
                            className="rounded p-1 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                          >
                            {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          {msg.navigationTarget && (
                            <button
                              onClick={() => navigate(msg.navigationTarget!)}
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-indigo-400 transition-colors hover:bg-indigo-500/10"
                            >
                              <ArrowUpRight className="h-3 w-3" />
                              Open {formatNavLabel(msg.navigationTarget)}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Quick replies */}
                      {!isUser && !msg.streaming && !!msg.quickReplies?.length && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.quickReplies.map((reply, i) => (
                            <button
                              key={i}
                              onClick={() => sendMessage(reply)}
                              className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-teal-500/40 hover:text-white"
                            >
                              {reply}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-slate-800 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  ref={(el) => {
                    textareaRef.current = el;
                    autoGrow(el);
                  }}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    autoGrow(e.target);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? 'VIMO is working — stop it or wait…' : 'Tell VIMO what to do…'}
                  disabled={isStreaming}
                  className="max-h-32 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50"
                />
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    title="Stop"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/90 text-white transition-all hover:bg-red-500 active:scale-95"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(inputValue)}
                    disabled={!inputValue.trim()}
                    title="Send (Enter)"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-500 text-white transition-all hover:from-teal-300 hover:to-teal-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between px-1">
                <span className="text-[10px] text-slate-600">Enter to send · Shift+Enter for a new line</span>
                <span className="text-[10px] text-slate-600">Ctrl+K to toggle</span>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

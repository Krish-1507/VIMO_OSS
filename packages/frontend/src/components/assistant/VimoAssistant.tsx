import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import api from '../../lib/api';
import { Sparkles, Send, X, Loader2, ArrowUpRight } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intentType?: string;
  systemActionTaken?: string;
  navigationTarget?: string;
  quickReplies?: string[];
}

interface AssistantResponse {
  message: string;
  intent: any;
  action: string;
  result: any;
  navigationTarget?: string;
  quickReplies: string[];
}

/* ------------------------------------------------------------------ */
/*  Quick-start suggestions                                            */
/* ------------------------------------------------------------------ */

const QUICK_STARTS = [
  { emoji: '🚀', label: 'Start autopilot', prompt: 'Start autopilot to grow my Instagram' },
  { emoji: '📊', label: 'Why did engagement drop?', prompt: 'Why did my engagement drop last week?' },
  { emoji: '✍️', label: 'Write a post about...', prompt: 'Write a post about industry trends' },
  { emoji: '🔥', label: 'Roast my brand', prompt: 'Roast my brand' },
];

/* ------------------------------------------------------------------ */
/*  Typing indicator component                                         */
/* ------------------------------------------------------------------ */

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 mb-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20">
        <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
      </div>
      <div className="rounded-xl bg-slate-800 px-4 py-3">
        <div className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Assistant Component                                           */
/* ------------------------------------------------------------------ */

export default function VimoAssistant() {
  const navigate = useNavigate();
  const {
    isAssistantOpen,
    toggleAssistant,
    hasUnreadAssistant,
    setHasUnreadAssistant,
  } = useUIStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize session
  useEffect(() => {
    let sid = sessionStorage.getItem('vimo_assistant_session');
    if (!sid) {
      sid = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem('vimo_assistant_session', sid);
    }
    setSessionId(sid);

    const stored = sessionStorage.getItem('vimo_assistant_messages');
    if (stored) {
      try {
        setMessages(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleAssistant();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAssistant]);

  // Focus input when panel opens
  useEffect(() => {
    if (isAssistantOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAssistantOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Persist messages to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('vimo_assistant_messages', JSON.stringify(messages));
  }, [messages]);

  // Show welcome message on first open
  useEffect(() => {
    if (isAssistantOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: "What's good! I'm VIMO, your Vibe Marketing mastermind. I don't just 'do marketing'—I run the whole show. Campaigns, analytics, autopilot... I've got it handled. What's the move today?",
        },
      ]);
    }
  }, [isAssistantOpen, messages.length]);

  // Set unread when panel is closed
  useEffect(() => {
    if (!isAssistantOpen && messages.length > 1) {
      setHasUnreadAssistant(true);
    }
  }, [isAssistantOpen, messages.length, setHasUnreadAssistant]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !sessionId) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await api.post('/api/assistant/message', { message: text, sessionId });

      const data: AssistantResponse = res.data;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        intentType: data.intent?.type,
        systemActionTaken: data.action,
        navigationTarget: data.navigationTarget,
        quickReplies: data.quickReplies || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Auto-navigate after delay
      if (data.navigationTarget) {
        setTimeout(() => {
          navigate(data.navigationTarget!);
        }, 500);
      }
    } catch (err: any) {
      const isAuth = err?.response?.status === 401;
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: isAuth
          ? 'Your session expired. Please **refresh the page** or **log in again** to continue.'
          : 'Sorry, I encountered an error processing your request. Please try again.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, navigate]);

  const handleQuickReply = (reply: string) => {
    sendMessage(reply);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const formatNavLabel = (target?: string) => {
    if (!target) return '';
    const page = target.split('/')[1] || '';
    return page.charAt(0).toUpperCase() + page.slice(1);
  };

  return (
    <>
      {/* Collapsed button */}
      {!isAssistantOpen && (
        <button
          onClick={toggleAssistant}
          title="VIMO Assistant (Cmd+K)"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 text-white shadow-xl shadow-teal-500/30 hover:bg-teal-400 transition-all active:scale-95 hover:scale-105"
        >
          <Sparkles className={`h-6 w-6 ${hasUnreadAssistant ? 'animate-pulse' : ''}`} />
          {hasUnreadAssistant && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-slate-900" />
          )}
        </button>
      )}

      {/* Expanded panel */}
      {isAssistantOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl w-[400px] h-[560px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)]">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-slate-900 px-4 py-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-400" />
              <span className="text-sm font-bold text-white">VIMO Assistant</span>
            </div>
            <button onClick={toggleAssistant} className="text-slate-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {messages.map((msg) => (
              <div key={msg.id} className={`mb-3 ${msg.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 mt-1">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                )}
                <div className="max-w-[85%]">
                  <div
                    className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-teal-500 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Go to {page} button */}
                  {msg.role === 'assistant' && msg.navigationTarget && (
                    <button
                      onClick={() => navigate(msg.navigationTarget!)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-600/30 bg-indigo-600/10 px-3 py-1.5 text-[10px] font-bold text-indigo-400 hover:bg-indigo-600/20 transition-colors"
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      Open {formatNavLabel(msg.navigationTarget)}
                    </button>
                  )}

                  {/* Per-message quick replies */}
                  {msg.role === 'assistant' && msg.quickReplies && msg.quickReplies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.quickReplies.map((reply, i) => (
                        <button
                          key={i}
                          onClick={() => handleQuickReply(reply)}
                          className="rounded-full border border-slate-600 bg-slate-800/50 px-2.5 py-1 text-[10px] font-medium text-slate-400 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && <TypingIndicator />}

            {/* Quick-start suggestions when empty */}
            {messages.length === 1 && messages[0]?.id === 'welcome' && (
              <div className="flex flex-wrap gap-2 mt-4">
                {QUICK_STARTS.map((qs, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(qs.prompt)}
                    className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    {qs.emoji} {qs.label}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-700 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask VIMO anything or give it a command..."
                className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-white hover:bg-teal-400 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { UserProfile } from '@/types/user-profile';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export function ChatWidget({ profile }: { profile: UserProfile }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        `Hi ${profile.userName}! I’m your career coach. Ask me anything—` +
        `from role options and skill gaps to a step-by-step plan for the week.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  
  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to fetch response');
      }

      const data = (await res.json()) as { reply: string };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            "Sorry, I couldn't reach the assistant just now. Please try again in a moment.",
        },
      ]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          `Chat cleared. How can I help, ${profile.userName}? ` +
          `We can discuss trade-offs, job paths, interview prep, or a weekly plan.`,
      },
    ]);
  };

  return (
    <div
      className="rounded-2xl border bg-white/70 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60"
      role="region"
      aria-label="Chat with career coach"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold">Ask Career Coach</span>
        </div>
        <button
          onClick={clearChat}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-gray-600 transition hover:-translate-y-[0.5px] hover:shadow-sm dark:border-gray-700 dark:text-gray-300"
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <div
        ref={listRef}
className="mb-3 h-48 overflow-y-auto rounded-xl border bg-white/60 p-3 text-sm 
             dark:border-gray-800 dark:bg-gray-900/50"
                     aria-live="polite"
      >
        {messages.map(m => (
          <div key={m.id} className="mb-3 last:mb-0">
            <div
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] whitespace-pre-wrap rounded-xl border px-3 py-2 shadow-sm dark:border-gray-700 bg-white/90'
                  : 'max-w-[95%] whitespace-pre-wrap rounded-xl border px-3 py-2 shadow-sm dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/70'
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="flex items-end gap-2">
        <textarea
          className="min-h-[44px] w-full resize-y rounded-xl border bg-white/90 p-3 text-sm shadow-sm outline-none transition focus:ring-1 dark:border-gray-800 dark:bg-gray-900/70"
          placeholder="Ask about roles, skills, or next steps…"
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={2}
          aria-label="Type your message"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border bg-white/90 px-3 text-sm font-medium shadow-sm transition hover:-translate-y-[1px] hover:shadow-md disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900/70"
          aria-label="Send message"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
}

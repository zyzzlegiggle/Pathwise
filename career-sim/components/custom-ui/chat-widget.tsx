'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { UserProfile } from '@/types/user-profile';

type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export function ChatWidget({ profile, variant='default', threadId: threadIdProp }: { profile: UserProfile; variant?: 'default'|'compact'; threadId?: string; }) {
  const initialText =
    variant === 'compact'
      ? `Hi ${profile.userName}! Ask me anything.`
      : `Hi ${profile.userName}! I’m your career coach. Ask me anything— from role options and skill gaps to a step-by-step plan for the week.`;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: uuidv4(), role: 'assistant', content: initialText },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  console.log(threadIdProp)
  const [threadId] = useState(() => threadIdProp || uuidv4());

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    // trigger on list length changes
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: trimmed,
    };

    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, profile, messages: next.map(({ role, content }) => ({ role, content })) }),
  });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to fetch response');
      }

      const data = (await res.json()) as { reply: string };
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.reply,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          content:
            "Sorry, I couldn't reach the assistant just now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: uuidv4(),
        role: 'assistant',
        content:
          `Chat cleared. How can I help, ${profile.userName}? ` +
          `We can discuss trade-offs, job paths, interview prep, or a weekly plan.`,
      },
    ]);
  };

  // container padding
  const wrap = `rounded-2xl border bg-white/70 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 ${
    variant === 'compact' ? 'p-3' : 'p-4'
  }`;

  // messages list height + text size
  const list = `mb-3 overflow-y-auto rounded-xl border bg-white/60 p-3 dark:border-gray-800 dark:bg-gray-900/50 ${
    variant === 'compact' ? 'max-h-40 text-xs' : 'max-h-72 text-sm'
  }`;

  // textarea rows
  const rows = variant === 'compact' ? 1 : 2;

  return (
    <div className={wrap} role="region" aria-label="Chat with career coach">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold">Ask Career Coach</span>
        </div>
        {variant !== 'compact' && (
          <button
            onClick={clearChat}
            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-gray-600 transition hover:-translate-y-[0.5px] hover:shadow-sm dark:border-gray-700 dark:text-gray-300"
            aria-label="Clear conversation"
            title="Clear conversation"
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <div ref={listRef} className={list} aria-live="polite">
        {messages.map(m => (
          <div key={m.id} className="mb-3 last:mb-0">
            <div
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] whitespace-pre-wrap rounded-xl border px-3 py-2 shadow-sm bg-white/90 dark:border-gray-700'
                  : 'max-w-[95%] whitespace-pre-wrap rounded-xl border px-3 py-2 shadow-sm bg-gray-50/70 dark:border-gray-700 dark:bg-gray-900/70'
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
          rows={rows}
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

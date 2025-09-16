/* eslint-disable react-hooks/rules-of-hooks */
// session-provider.tsx
'use client';
import { createContext, useContext, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

const Ctx = createContext("");

export function SessionProvider({ threadId, children }: { threadId?: string; children: React.ReactNode }) {
  // Persist a stable id for the lifetime of this provider
  const ref = useRef(threadId ?? uuidv4());
  return <Ctx.Provider value={ref.current}>{children}</Ctx.Provider>;
}

export function useThreadId() {
  return useContext(Ctx);
}

export function usePushData() {
  const threadId = useThreadId();
  return async (key: string, value: unknown) => {
    await fetch("/api/session-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, data: { [key]: value } }),
    });
  };
}

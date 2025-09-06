// app/components/system/SessionProvider.tsx
'use client';
import {createContext, useContext } from "react";
import { v4 as uuidv4 } from "uuid";


const Ctx = createContext("")


export function SessionProvider({ threadId, children }: { threadId?: string; children: React.ReactNode }) {
 
  const id = threadId || uuidv4();
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

export function useThreadId() {
  return useContext(Ctx);
}

// Minimal push helper
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

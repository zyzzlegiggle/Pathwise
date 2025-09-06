
const store = new Map<string, Record<string, unknown>>();

export function upsertSessionData(threadId: string, patch: Record<string, unknown>) {
  const cur = store.get(threadId) ?? {};
  store.set(threadId, { ...cur, ...patch });
  console.log(store);
}
export function getSessionData(threadId: string) {
  console.log(store);
  return store.get(threadId) ?? {};
}

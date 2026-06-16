type AuthEvent = "logout";

const listeners = new Map<AuthEvent, Set<() => void>>();

export const authEvents = {
  on(event: AuthEvent, handler: () => void): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  },
  emit(event: AuthEvent): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const h of set) h();
  },
};

// localStorage-backed shim for the window.storage API the prototype was built
// against. Kept async and shaped the same way so swapping in IndexedDB later
// is a one-file change.
export const storage = {
  get: async (k: string): Promise<{ key: string; value: string }> => {
    const v = localStorage.getItem(k);
    if (v === null) throw new Error("missing");
    return { key: k, value: v };
  },
  set: async (k: string, v: string): Promise<{ key: string; value: string }> => {
    localStorage.setItem(k, v);
    return { key: k, value: v };
  },
};

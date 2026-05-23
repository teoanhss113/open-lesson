import { beforeEach, vi } from 'vitest';

function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } satisfies Storage;
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    let storageAvailable = false;
    try {
      storageAvailable = typeof window.localStorage !== 'undefined' && window.localStorage !== null;
      if (storageAvailable) {
        // Test if accessing it works
        window.localStorage.getItem('test-probe');
      }
    } catch (e) {
      storageAvailable = false;
    }

    if (!storageAvailable) {
      const localStub = createStorageStub();
      const sessionStub = createStorageStub();

      (globalThis as any).localStorage = localStub;
      (globalThis as any).sessionStorage = sessionStub;

      Object.defineProperty(window, 'localStorage', {
        value: localStub,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, 'sessionStorage', {
        value: sessionStub,
        writable: true,
        configurable: true,
      });
    }
  } else {
    // node environment
    let nodeStorageAvailable = false;
    try {
      nodeStorageAvailable = typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null;
    } catch (e) {
      nodeStorageAvailable = false;
    }

    if (!nodeStorageAvailable) {
      const localStub = createStorageStub();
      const sessionStub = createStorageStub();
      (globalThis as any).localStorage = localStub;
      (globalThis as any).sessionStorage = sessionStub;
    }
  }
});

import { useEffect, type RefObject } from 'react';

/**
 * Hook to run a handler when clicking outside of a referenced element.
 * Optionally runs an escape handler on pressing Escape.
 */
export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (e: MouseEvent | TouchEvent) => void,
  enabled: boolean = true,
  escHandler?: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleEvent = (event: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escHandler) {
        escHandler();
      }
    };

    document.addEventListener('mousedown', handleEvent);
    document.addEventListener('touchstart', handleEvent);
    if (escHandler) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleEvent);
      document.removeEventListener('touchstart', handleEvent);
      if (escHandler) {
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [ref, handler, enabled, escHandler]);
}

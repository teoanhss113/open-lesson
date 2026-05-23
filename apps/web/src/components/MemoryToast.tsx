import { useEffect, useRef, useState } from 'react';
import type { MemoryChangeEvent } from '@open-design/contracts';
import { useT } from '../i18n';

interface ActiveToast {
  key: number;
  count: number;
  source?: MemoryChangeEvent['source'];
}

interface Props {
  onOpenMemory?: () => void;
}

const VISIBLE_MS = 4500;

export function MemoryToast({ onOpenMemory }: Props) {
  const t = useT();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/memory/events');
    es.addEventListener('change', (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as MemoryChangeEvent;
        if (event.kind !== 'extract') return;
        if ((event.count ?? 0) <= 0) return;
        if (event.source === 'manual') return;
        setToast({
          key: Date.now(),
          count: event.count ?? 1,
          source: event.source,
        });
      } catch {
      }
    });
    es.addEventListener('error', () => {});
    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast]);

  if (!toast) return null;

  const label = t('settings.memoryToastChanged');
  const detail =
    toast.source === 'llm'
      ? `(${toast.count} · LLM)`
      : `(${toast.count})`;
  const clickHint = t('settings.memoryToastClickHint');

  if (!onOpenMemory) {
    return (
      <div className="memory-toast" role="status" aria-live="polite">
        <span aria-hidden className="memory-toast__icon">✦</span>
        <span>{label}</span>
        <span className="memory-toast__detail">{detail}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="memory-toast memory-toast--clickable"
      aria-live="polite"
      aria-label={`${label} ${detail} — ${clickHint}`}
      title={clickHint}
      onClick={onOpenMemory}
    >
      <span aria-hidden className="memory-toast__icon">✦</span>
      <span>{label}</span>
      <span className="memory-toast__detail">{detail}</span>
      <span className="memory-toast__hint">{clickHint} →</span>
    </button>
  );
}

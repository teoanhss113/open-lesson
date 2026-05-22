import { useState, useCallback, useEffect } from 'react';
import type { LiveArtifactEventItem } from '../types';

let liveArtifactEventSequence = 0;

function appendLiveArtifactEventItem(
  prev: LiveArtifactEventItem[],
  event: LiveArtifactEventItem['event'],
): LiveArtifactEventItem[] {
  liveArtifactEventSequence += 1;
  const next = [...prev, { id: liveArtifactEventSequence, event }];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

export function useProjectArtifactEvents(projectId: string) {
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);

  useEffect(() => {
    setLiveArtifactEvents([]);
  }, [projectId]);

  const appendArtifactEvent = useCallback((event: LiveArtifactEventItem['event']) => {
    setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, event));
  }, []);

  return {
    liveArtifactEvents,
    appendArtifactEvent,
    setLiveArtifactEvents,
  };
}

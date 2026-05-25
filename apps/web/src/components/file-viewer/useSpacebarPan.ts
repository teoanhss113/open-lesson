import { useState, useEffect, useRef, useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export interface PanOffset {
  x: number;
  y: number;
}

interface SpacebarPanResult {
  isSpacePressed: boolean;
  isDragging: boolean;
  panOffset: PanOffset;
  resetPanOffset: () => void;
  handlePointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}

export function useSpacebarPan(
  _containerRef?: RefObject<HTMLElement | null>,
  iframeRef?: RefObject<HTMLIFrameElement | null>,
  _scale = 1,
): SpacebarPanResult {
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });

  const isSpacePressedRef = useRef(false);
  isSpacePressedRef.current = isSpacePressed;

  // Track current panOffset in a ref so handlePointerDown can read it synchronously
  const panOffsetRef = useRef<PanOffset>({ x: 0, y: 0 });
  panOffsetRef.current = panOffset;

  const resetPanOffset = useCallback(() => {
    panOffsetRef.current = { x: 0, y: 0 };
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Global cursor class so grab cursor shows over iframes too
  useEffect(() => {
    document.body.classList.toggle('spacebar-panning', isSpacePressed);
    if (!isSpacePressed) document.body.classList.remove('is-dragging');
  }, [isSpacePressed]);

  useEffect(() => {
    document.body.classList.toggle('is-dragging', isDragging);
  }, [isDragging]);

  // Inject spacebar-pan containment styles and apply classnames to the iframe body
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;

    const injectStylesAndApplyClasses = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Check if our style tag is already injected
        const styleId = 'od-spacebar-pan-styles';
        let styleTag = doc.getElementById(styleId);
        if (!styleTag) {
          styleTag = doc.createElement('style');
          styleTag.id = styleId;
          styleTag.textContent = `
            body.spacebar-panning {
              overflow: hidden !important;
            }
          `;
          doc.head.appendChild(styleTag);
        }

        // Apply classes to iframe body
        const iframeBody = doc.body;
        if (iframeBody) {
          iframeBody.classList.toggle('spacebar-panning', isSpacePressed);
          iframeBody.classList.toggle('is-dragging', isDragging);
        }
      } catch (e) {
        // Ignore cross-origin security errors
      }
    };

    // Run immediately in case the iframe is already loaded
    injectStylesAndApplyClasses();

    iframe.addEventListener('load', injectStylesAndApplyClasses);
    return () => {
      iframe.removeEventListener('load', injectStylesAndApplyClasses);
      // Clean up the classes on the iframe body on unmount
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          doc.body.classList.remove('spacebar-panning', 'is-dragging');
        }
      } catch (e) {
        // Ignore
      }
    };
  }, [iframeRef, isSpacePressed, isDragging]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('spacebar-panning', 'is-dragging');
    };
  }, []);

  useEffect(() => {
    const isInput = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (el as HTMLElement).isContentEditable ||
        !!el.closest('.composer') ||
        !!el.closest('.manual-edit-panel')
      );
    };

    // Window-level key listener (focus is outside any iframe)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.repeat) return;
      if (isInput(e.target as Element) || isInput(document.activeElement)) return;
      e.preventDefault();
      setIsSpacePressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        setIsSpacePressed(false);
        setIsDragging(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePressed(false);
      setIsDragging(false);
    };

    // postMessage from iframe Space-pan bridge
    const handleMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; state?: string } | null;
      if (!data || data.type !== 'od:space-pan') return;
      if (data.state === 'down') {
        setIsSpacePressed(true);
      } else if (data.state === 'up') {
        setIsSpacePressed(false);
        setIsDragging(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleBlur);
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!isSpacePressedRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const overlayEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;

    let captured = false;
    try {
      overlayEl.setPointerCapture(pointerId);
      captured = true;
    } catch {
      // ignore
    }

    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;

    // Capture the current offset so we can accumulate from it
    const baseX = panOffsetRef.current.x;
    const baseY = panOffsetRef.current.y;

    const handleMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      setPanOffset({ x: baseX + dx, y: baseY + dy });
    };

    const cleanup = (upEv: PointerEvent) => {
      setIsDragging(false);
      try {
        if (captured) overlayEl.releasePointerCapture(upEv.pointerId);
      } catch {
        // ignore
      }
      overlayEl.removeEventListener('pointermove', handleMove);
      overlayEl.removeEventListener('pointerup', cleanup);
      overlayEl.removeEventListener('pointercancel', cleanup);
      if (!captured) {
        window.removeEventListener('pointermove', handleMove, { capture: true });
        window.removeEventListener('pointerup', cleanup, { capture: true });
        window.removeEventListener('pointercancel', cleanup, { capture: true });
      }
    };

    if (captured) {
      overlayEl.addEventListener('pointermove', handleMove);
      overlayEl.addEventListener('pointerup', cleanup);
      overlayEl.addEventListener('pointercancel', cleanup);
    } else {
      window.addEventListener('pointermove', handleMove, { capture: true });
      window.addEventListener('pointerup', cleanup, { capture: true });
      window.addEventListener('pointercancel', cleanup, { capture: true });
    }
  };

  return { isSpacePressed, isDragging, panOffset, resetPanOffset, handlePointerDown };
}

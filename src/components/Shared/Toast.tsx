import { useEffect, useState, useCallback, useRef } from "react";

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({
  message,
  actionLabel,
  onAction,
  duration = 4000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(duration);
  const startRef = useRef(Date.now());

  const startTimer = useCallback(() => {
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 150);
    }, remainingRef.current);
  }, [onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      remainingRef.current -= Date.now() - startRef.current;
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  useEffect(() => {
    if (paused) {
      pauseTimer();
    } else {
      startTimer();
    }
  }, [paused, pauseTimer, startTimer]);

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-[40px] left-1/2 -translate-x-1/2 z-40
                 animate-slide-up"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-md px-base py-sm bg-text-primary text-white rounded-toast shadow-toast">
        <span className="text-snippet-body text-white">{message}</span>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="text-snippet-meta font-semibold text-accent hover:text-accent-hover
                       transition-colors duration-75"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

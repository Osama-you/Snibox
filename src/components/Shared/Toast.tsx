import { useEffect, useRef, useState } from "react";

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

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const remainingRef = useRef(duration);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    startRef.current = Date.now();
    const id = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismissRef.current(), 150);
    }, remainingRef.current);
    return () => {
      clearTimeout(id);
      remainingRef.current -= Date.now() - startRef.current;
    };
  }, [paused]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[52px] left-1/2 -translate-x-1/2 z-50 animate-fade-in"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-md px-base py-sm rounded-toast shadow-toast border border-transparent
                      bg-text-primary text-bg dark:bg-surface dark:text-text-primary dark:border-border">
        <span className="text-snippet-body">{message}</span>
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

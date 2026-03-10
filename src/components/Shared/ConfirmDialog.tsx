import { useId, useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-[1px]"
        aria-hidden="true"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-bg rounded-modal shadow-window p-base min-w-[280px] animate-scale-in"
      >
        <h3 id={titleId} className="text-editor-title text-text-primary mb-xs">{title}</h3>
        <p className="text-snippet-body text-text-secondary mb-base">{message}</p>
        <div className="flex justify-end gap-sm">
          <button
            onClick={onCancel}
            className="h-[32px] px-base text-snippet-body font-medium text-white
                       bg-accent hover:bg-accent-hover rounded-btn
                       transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`h-[32px] px-base text-snippet-body rounded-btn
                        transition-colors
                        ${
                          danger
                            ? "text-danger bg-danger/10 hover:bg-danger/20 border border-danger/20"
                            : "text-text-secondary bg-surface hover:bg-border border border-border"
                        }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

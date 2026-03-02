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
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in">
      <div className="absolute inset-0 bg-black/20" onClick={onCancel} />
      <div className="relative bg-white rounded-modal shadow-window p-base min-w-[280px] animate-scale-in">
        <h3 className="text-editor-title text-text-primary mb-xs">{title}</h3>
        <p className="text-snippet-body text-text-secondary mb-base">{message}</p>
        <div className="flex justify-end gap-sm">
          <button
            onClick={onCancel}
            className="h-[36px] px-base text-snippet-title text-white
                       bg-accent hover:bg-accent-hover rounded-btn
                       transition-colors duration-75"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`h-[36px] px-base text-snippet-title rounded-btn
                        transition-colors duration-75
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

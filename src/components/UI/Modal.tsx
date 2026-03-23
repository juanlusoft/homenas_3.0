import { type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Modal({ open, onClose, title, children, actions }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md glass-elevated rounded-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-disabled)] hover:text-[var(--text-primary)]">✕</button>
        </div>
        {children}
        {actions && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--outline-variant)]">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

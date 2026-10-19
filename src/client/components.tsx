import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export function SectionHeading({
  eyebrow,
  title,
  description,
  back,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  back?: () => void;
}) {
  return (
    <header className="section-heading">
      {back && (
        <button className="back-button" onClick={back}>
          <ArrowLeft aria-hidden="true" size={22} /> Back to conversation
        </button>
      )}
      <p className="eyebrow">{eyebrow}</p>
      <h1 tabIndex={-1}>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </header>
  );
}
export function NextButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="primary next-button" onClick={onClick}>
      {children}
      <ArrowRight aria-hidden="true" />
    </button>
  );
}
export function ConfirmDialog({
  title,
  children,
  busy,
  confirm,
  cancel,
  confirmLabel = 'Save check-in',
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
  confirmLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) cancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      {children}
      <div className="dialog-actions">
        <button autoFocus disabled={busy} onClick={cancel}>
          Cancel
        </button>
        <button className="primary" disabled={busy} onClick={confirm}>
          {busy ? 'Saving…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

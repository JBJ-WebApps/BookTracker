import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass =
    size === 'xl' ? 'max-w-4xl'
    : size === 'lg' ? 'max-w-2xl'
    : size === 'sm' ? 'max-w-sm'
    : 'max-w-lg';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative w-full ${widthClass} rounded-2xl bg-white shadow-2xl`}>
        {title && (
          <div className="px-6 pt-5 pb-3 border-b border-navy-50 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-navy-600">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-navy-900 hover:text-navy-500 text-xl leading-none"
            >
              ✕
            </button>
          </div>
        )}
        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 pb-5 pt-2 flex items-center justify-end gap-2 border-t border-navy-50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

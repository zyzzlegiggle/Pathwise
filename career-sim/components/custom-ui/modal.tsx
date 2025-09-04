'use client'
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 motion-safe:animate-fadeIn"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
  >
    <div
      className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-xl transition-all motion-safe:animate-scaleUp dark:border-gray-800 dark:bg-gray-900"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b p-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          onClick={onClose}
          className="rounded-lg border px-2 py-1 text-xs transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-800 dark:hover:bg-gray-800 dark:focus-visible:ring-gray-700"
        >
          Close
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto p-3">{children}</div>
    </div>
  </div>
  );
}
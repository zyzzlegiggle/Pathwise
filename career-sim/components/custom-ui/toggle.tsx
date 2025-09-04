
'use client'
export const Toggle = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => (
  <div className="inline-flex rounded-xl border bg-white/60 p-1 text-sm shadow-inner dark:border-gray-800 dark:bg-gray-900/60" role="tablist" aria-label="Toggle">
    {options.map((opt) => (
      <button
        key={opt}
        onClick={() => onChange(opt)}
        role="tab"
        aria-selected={opt === value}
        aria-pressed={opt === value}
        className={
          "rounded-lg px-3 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-700 " +
          (opt === value
            ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")
        }
      >
        {opt}
      </button>
    ))}
  </div>

);

'use client'
export const Toggle = ({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) => (
  <div className="inline-flex rounded-xl border p-1 text-sm dark:border-gray-800">
    {options.map((opt) => (
      <button
        key={opt}
        onClick={() => onChange(opt)}
        className={
          "rounded-lg px-3 py-1.5 transition " +
          (opt === value ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800")
        }
      >
        {opt}
      </button>
    ))}
  </div>
);
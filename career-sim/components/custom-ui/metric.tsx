'use client'

export const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border p-3 text-center transition hover:-translate-y-[1px] hover:shadow-sm dark:border-gray-800">
    <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-base font-semibold sm:text-lg tabular-nums">{value}</div>
    {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
  </div>

);
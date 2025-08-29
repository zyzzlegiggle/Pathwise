'use client'

export const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border p-3 text-center dark:border-gray-800">
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-xl font-semibold">{value}</div>
    {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
  </div>
);
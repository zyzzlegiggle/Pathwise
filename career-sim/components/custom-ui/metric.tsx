/* eslint-disable react-hooks/rules-of-hooks */
'use client'

type MetricProps = {
  label: string;
  value: string;     // supports "A / B" or a single value
  hint?: string;
};

export const Metric = ({ label, value, hint }: MetricProps) => {
  const parts = value.split('/').map(s => s.trim()); // ["A", "B"] or ["Value"]

  return (
    <div className="rounded-xl border p-3 text-center transition hover:-translate-y-[1px] hover:shadow-sm dark:border-gray-800 h-full">
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>

      {/* Value row: keeps each side unbroken, wraps as a pair if needed */}
      <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 leading-tight">
        {parts.length === 1 ? (
          <span className="text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap">
            {parts[0]}
          </span>
        ) : (
          <>
            <span className="text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap">
              {parts[0]}
            </span>
            <span aria-hidden className="text-gray-400">/</span>
            <span className="text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap">
              {parts[1]}
            </span>
          </>
        )}
      </div>

      {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
    </div>
  );
};

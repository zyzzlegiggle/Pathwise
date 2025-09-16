/* eslint-disable react-hooks/rules-of-hooks */
'use client'

export const Slider = ({ label, min, max, step = 1, value, onChange, suffix }: any) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-sm">
      <span className="text-gray-700 dark:text-gray-200">{label}</span>
      <span className="tabular-nums text-gray-500 dark:text-gray-400">
        {value}{suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-gray-900 dark:accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-700 h-3 rounded-full"
    />
  </div>

);

'use client'

import React from "react";


export const Chip = ({ children }: { children: React.ReactNode }) => (
<span className="inline-flex items-center rounded-full border border-gray-200 bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-700 transition dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300 hover:-translate-y-[0.5px] hover:shadow-sm">    {children}
  </span>
);
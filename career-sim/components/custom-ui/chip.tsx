'use client'

import React from "react";


export const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
    {children}
  </span>
);
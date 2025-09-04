
'use client'
export const Section = ({ title, icon, children, actions }: any) => (
  <section
    role="region"
    aria-label={title}
    className="group rounded-2xl border bg-white/70 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:shadow-md hover:-translate-y-[1px] dark:border-gray-800 dark:bg-gray-900/60 focus-within:ring-1 focus-within:ring-gray-300 dark:focus-within:ring-gray-700 motion-safe:animate-fadeInUp"
  >
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      <div className="shrink-0">{actions}</div>
    </div>
    {children}
  </section>

);

'use client'
export const Section = ({ title, icon, children, actions }: any) => (
  <section className="rounded-2xl border bg-white/70 p-5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      {actions}
    </div>
    {children}
  </section>
);
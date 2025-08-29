'use client'

import { Users } from "lucide-react";
import { Chip } from "./chip";

// --- People Like Me ---
export function PeopleLikeMe() {
  const people = [
    { name: "A., 26", from: "Assistant", to: "Coordinator", time: "5 months", pay: "$38k → $48k", note: "Portfolio + referral" },
    { name: "K., 29", from: "Analyst", to: "Associate", time: "4 months", pay: "$52k → $65k", note: "Certificate + networking" },
    { name: "S., 31", from: "Operator", to: "Specialist", time: "7 months", pay: "$45k → $60k", note: "3 samples + blog" },
  ];
  return (
    <div className="rounded-2xl border p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users size={16} />People like me (examples)</div>
      <div className="grid gap-3 md:grid-cols-3">
        {people.map((p, i) => (
          <div key={i} className="rounded-xl border p-3 text-sm shadow-sm dark:border-gray-800">
            <div className="mb-1 font-semibold">{p.name}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">{p.from} → {p.to}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip>Time: {p.time}</Chip>
              <Chip>Pay: {p.pay}</Chip>
              <Chip>{p.note}</Chip>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">Examples are anonymized and simplified. In the real app, each card links to sources and proof.</p>
    </div>
  );
}
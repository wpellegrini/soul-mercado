"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Abas de uma seção (Administração, Estoque...). A primeira aba só fica ativa no caminho exato. */
export default function SubTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-4 overflow-x-auto border-b border-stone-200 text-sm print:hidden">
      {tabs.map((t, i) => {
        const active = i === 0 ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 pb-2 font-medium whitespace-nowrap ${
              active
                ? "border-brand-600 text-stone-900"
                : "border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

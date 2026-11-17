import Link from "next/link";
import { getSettings, homeFor, requireUser } from "@/lib/auth";
import { BUSINESS_LABEL, canSell, canStock, ROLE_LABEL } from "@/lib/types";
import NavLinks from "@/components/nav-links";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireUser();
  const settings = await getSettings();
  const role = profile.role;

  const links: { href: string; label: string }[] = [];
  if (role === "admin") links.push({ href: "/painel", label: "Painel" });
  if (canSell(role)) links.push({ href: "/pdv", label: "PDV" }, { href: "/caixa", label: "Caixa" }, { href: "/vendas", label: "Vendas" });
  links.push({ href: "/produtos", label: "Produtos" });
  if (canStock(role)) links.push({ href: "/estoque", label: "Estoque" });
  if (canSell(role)) links.push({ href: "/clientes", label: "Clientes" });
  if (role === "admin") links.push({ href: "/relatorios", label: "Relatórios" }, { href: "/admin", label: "Administração" });

  const initials = settings.store_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="bg-brand text-white print:hidden">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href={homeFor(role)} className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-white/15 text-xs font-bold">{initials}</span>
            <span className="leading-tight">
              {settings.store_name}
              <span className="block text-[11px] font-normal text-emerald-100/70">{BUSINESS_LABEL[settings.business_kind]}</span>
            </span>
          </Link>
          <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
            <NavLinks links={links} />
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{profile.full_name || profile.email}</div>
              <div className="text-xs text-emerald-100/70">{ROLE_LABEL[role]}</div>
            </div>
            <form action={signOut}>
              <button className="rounded-md border border-white/25 px-3 py-1.5 text-xs font-medium hover:bg-white/10">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}

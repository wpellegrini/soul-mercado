import { requireStock } from "@/lib/auth";
import SubTabs from "@/components/sub-tabs";

export default async function StockLayout({ children }: LayoutProps<"/estoque">) {
  await requireStock();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-stone-900 print:hidden">Estoque</h1>
      <SubTabs
        tabs={[
          { href: "/estoque", label: "Entrada de mercadoria" },
          { href: "/estoque/ajuste", label: "Perda e contagem" },
          { href: "/estoque/compras", label: "Lista de compras" },
          { href: "/estoque/historico", label: "Histórico" },
        ]}
      />
      {children}
    </div>
  );
}

import { requireAdmin } from "@/lib/auth";
import SubTabs from "@/components/sub-tabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-stone-900">Administração</h1>
      <SubTabs
        tabs={[
          { href: "/admin/usuarios", label: "Usuários" },
          { href: "/admin/secoes", label: "Seções" },
          { href: "/admin/configuracoes", label: "Loja e balança" },
        ]}
      />
      {children}
    </div>
  );
}

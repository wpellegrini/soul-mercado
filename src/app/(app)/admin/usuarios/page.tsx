import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, ROLE_LABEL, ROLES, type Profile } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { updateRole } from "../actions";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  const { supabase, profile: me } = await requireAdmin();
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  const users = (data ?? []) as Profile[];
  const pending = users.filter((u) => u.role === "pendente").length;

  return (
    <div>
      <p className="mb-4 text-sm text-stone-500">
        Quem se cadastra fica <strong>aguardando liberação</strong>. Defina <strong>Caixa</strong> (PDV, caixa, vendas e fiado),{" "}
        <strong>Estoque</strong> (produtos, entradas, perdas, inventário e etiquetas) ou <strong>Gerente</strong> (tudo, inclusive
        relatórios, cancelamentos, limite de fiado e usuários).
      </p>
      {pending > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pending} {pending === 1 ? "pessoa aguarda" : "pessoas aguardam"} liberação.
        </p>
      )}
      <div className="card divide-y divide-stone-100">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium text-stone-900">
                {u.full_name || "Sem nome"} {u.id === me.id && <span className="text-xs text-stone-400">(você)</span>}
                {u.role === "pendente" && (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Novo</span>
                )}
              </div>
              <div className="text-xs text-stone-500">
                {u.email} · desde {formatDateTime(u.created_at)}
              </div>
            </div>
            <ActionForm action={updateRole} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={u.id} />
              <select name="role" defaultValue={u.role} className="input w-56" aria-label={`Perfil de ${u.email}`}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Salvar</button>
            </ActionForm>
          </div>
        ))}
      </div>
    </div>
  );
}

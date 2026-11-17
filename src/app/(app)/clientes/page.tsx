import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { loadDebts } from "@/lib/queries";
import { formatMoney, normalize, type Customer } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { createCustomer } from "./actions";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  const sp = await searchParams;
  const { supabase, profile } = await requireSeller();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const devendo = sp.filtro === "devendo";

  const [{ data }, debts] = await Promise.all([
    supabase.from("customers").select("*").order("name").returns<Customer[]>(),
    loadDebts(supabase),
  ]);
  const words = normalize(q).split(/\s+/).filter(Boolean);
  const list = (data ?? []).filter(
    (c) =>
      (!devendo || (debts.get(c.id) ?? 0) > 0) &&
      (!words.length || words.every((w) => normalize(`${c.name} ${c.phone}`).includes(w))),
  );
  const totalDebt = [...debts.values()].reduce((s, d) => s + Math.max(0, d), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Clientes e fiado</h1>
          <p className="text-sm text-stone-500">
            Total a receber no fiado: <strong className="text-stone-900">{formatMoney(totalDebt)}</strong>
          </p>
        </div>
        <form className="card flex flex-wrap items-end gap-3 p-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="label">
              Buscar
            </label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="Nome ou telefone" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="filtro" value="devendo" defaultChecked={devendo} className="h-4 w-4" />
            Só quem está devendo
          </label>
          <button className="btn-secondary">Filtrar</button>
        </form>
        <div className="card divide-y divide-stone-100">
          {list.length === 0 && <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhum cliente.</p>}
          {list.map((c) => {
            const debt = debts.get(c.id) ?? 0;
            const limit = Number(c.credit_limit);
            const over = limit > 0 && debt / limit >= 0.8;
            return (
              <Link key={c.id} href={`/clientes/${c.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 ${c.active ? "" : "opacity-50"}`}>
                <div>
                  <div className="font-medium text-stone-900">{c.name}</div>
                  <div className="text-xs text-stone-500">
                    {c.phone || "sem telefone"} · {limit > 0 ? `limite ${formatMoney(limit)}` : "sem fiado"}
                  </div>
                </div>
                <div className={`text-right text-sm font-semibold ${debt > 0 ? (over ? "text-red-700" : "text-amber-700") : "text-stone-400"}`}>
                  {debt > 0 ? `deve ${formatMoney(debt)}` : "em dia"}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <section className="card h-fit p-4">
        <h2 className="mb-3 text-sm font-semibold text-stone-900">Novo cliente</h2>
        <ActionForm action={createCustomer} className="space-y-3">
          <div>
            <label htmlFor="name" className="label">
              Nome
            </label>
            <input id="name" name="name" className="input" required />
          </div>
          <div>
            <label htmlFor="phone" className="label">
              Telefone / WhatsApp
            </label>
            <input id="phone" name="phone" className="input" inputMode="tel" />
          </div>
          <div>
            <label htmlFor="document" className="label">
              CPF
            </label>
            <input id="document" name="document" className="input" />
          </div>
          {profile.role === "admin" ? (
            <div>
              <label htmlFor="credit_limit" className="label">
                Limite de fiado (R$)
              </label>
              <input id="credit_limit" name="credit_limit" inputMode="decimal" className="input" placeholder="0 = não compra fiado" />
            </div>
          ) : (
            <p className="text-xs text-stone-500">O limite de fiado é definido pelo gerente.</p>
          )}
          <input type="hidden" name="notes" value="" />
          <button className="btn-primary w-full">Cadastrar</button>
        </ActionForm>
      </section>
    </div>
  );
}

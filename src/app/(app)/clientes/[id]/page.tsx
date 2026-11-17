import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { loadDebts } from "@/lib/queries";
import { formatDateTime, formatMoney, PAYMENT_LABEL, whatsappLink, type Customer, type PaymentMethod } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { receivePayment, updateCustomer } from "../actions";

export const metadata: Metadata = { title: "Cliente" };

type FiadoSale = { sale_id: number; created_at: string; status: string; amount: number };
type Received = { id: number; amount: number; method: PaymentMethod; notes: string; created_at: string };

export default async function CustomerPage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const { supabase, profile } = await requireSeller();
  const cid = Number(id);
  const [{ data: customer }, debts, { data: sales }, { data: received }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", cid).maybeSingle<Customer>(),
    loadDebts(supabase),
    supabase.rpc("customer_statement", { p_customer_id: cid }),
    supabase.from("customer_payments").select("*").eq("customer_id", cid).order("created_at", { ascending: false }).limit(100).returns<Received[]>(),
  ]);
  if (!customer) notFound();
  const debt = debts.get(cid) ?? 0;
  const limit = Number(customer.credit_limit);
  const wa = whatsappLink(customer.phone);

  // Extrato: compras no fiado (+) e pagamentos (−), do mais recente ao mais antigo
  const entries = [
    ...((sales ?? []) as FiadoSale[]).map((s) => ({
        key: `s${s.sale_id}`,
        at: s.created_at,
        label: (
          <>
            Compra{" "}
            {profile.role === "admin" ? (
              <Link href={`/vendas/${s.sale_id}`} className="text-brand-600 hover:underline">
                #{s.sale_id}
              </Link>
            ) : (
              <>#{s.sale_id}</>
            )}
            {s.status === "cancelada" && <span className="ml-1 text-xs text-red-700">(cancelada)</span>}
          </>
        ),
        value: s.status === "cancelada" ? 0 : Number(s.amount),
      })),
    ...(received ?? []).map((r) => ({
      key: `r${r.id}`,
      at: r.created_at,
      label: <>Pagamento · {PAYMENT_LABEL[r.method]}{r.notes && ` — ${r.notes}`}</>,
      value: -Number(r.amount),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <Link href="/clientes" className="text-sm text-stone-500 hover:text-stone-900">
        ← Clientes
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{customer.name}</h1>
          <p className="text-sm text-stone-500">
            {customer.phone || "sem telefone"} · cliente desde {formatDateTime(customer.created_at).slice(0, 10)}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="card px-4 py-2 text-right">
            <div className="text-xs text-stone-500">Deve</div>
            <div className={`text-xl font-bold ${debt > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatMoney(debt)}</div>
          </div>
          <div className="card px-4 py-2 text-right">
            <div className="text-xs text-stone-500">Limite</div>
            <div className="text-xl font-bold text-stone-900">{limit > 0 ? formatMoney(limit) : "sem fiado"}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Extrato do fiado</h2>
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-500">Nenhuma compra no fiado ainda.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {entries.map((e) => (
                <li key={e.key} className="flex justify-between gap-3 px-4 py-2">
                  <span>
                    <span className="text-stone-500">{formatDateTime(e.at)}</span> · {e.label}
                  </span>
                  <strong className={e.value > 0 ? "text-red-700" : e.value < 0 ? "text-emerald-700" : "text-stone-400"}>
                    {e.value > 0 ? "+" : e.value < 0 ? "−" : ""}
                    {formatMoney(Math.abs(e.value))}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          {debt > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Receber pagamento</h2>
              <ActionForm action={receivePayment} className="space-y-3">
                <input type="hidden" name="customer_id" value={customer.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="amount" className="label">
                      Valor (R$)
                    </label>
                    <input id="amount" name="amount" inputMode="decimal" defaultValue={debt.toFixed(2).replace(".", ",")} key={debt} className="input" required />
                  </div>
                  <div>
                    <label htmlFor="method" className="label">
                      Forma
                    </label>
                    <select id="method" name="method" className="input">
                      {(["dinheiro", "pix", "debito", "credito"] as const).map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_LABEL[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <input name="notes" className="input" placeholder="Observação (opcional)" aria-label="Observação" />
                <button className="btn-primary w-full">Registrar pagamento</button>
                <p className="text-xs text-stone-500">Em dinheiro, o valor entra no seu caixa aberto.</p>
              </ActionForm>
              {wa && (
                <a
                  href={`${wa}?text=${encodeURIComponent(`Olá, ${customer.name.split(" ")[0]}! Passando para lembrar do saldo de ${formatMoney(debt)} na caderneta. Obrigado!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary mt-3 w-full"
                >
                  Lembrar pelo WhatsApp
                </a>
              )}
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-stone-900">Dados do cliente</h2>
            <ActionForm action={updateCustomer} className="space-y-3">
              <input type="hidden" name="id" value={customer.id} />
              <div>
                <label htmlFor="name" className="label">
                  Nome
                </label>
                <input id="name" name="name" defaultValue={customer.name} className="input" required />
              </div>
              <div>
                <label htmlFor="phone" className="label">
                  Telefone / WhatsApp
                </label>
                <input id="phone" name="phone" defaultValue={customer.phone} className="input" />
              </div>
              <div>
                <label htmlFor="document" className="label">
                  CPF
                </label>
                <input id="document" name="document" defaultValue={customer.document} className="input" />
              </div>
              {profile.role === "admin" && (
                <div>
                  <label htmlFor="credit_limit" className="label">
                    Limite de fiado (R$)
                  </label>
                  <input id="credit_limit" name="credit_limit" defaultValue={limit ? limit.toFixed(2).replace(".", ",") : ""} inputMode="decimal" className="input" placeholder="0 = não compra fiado" />
                </div>
              )}
              <div>
                <label htmlFor="notes" className="label">
                  Observações
                </label>
                <textarea id="notes" name="notes" defaultValue={customer.notes} className="input" rows={2} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={customer.active} className="h-4 w-4" />
                Ativo
              </label>
              <button className="btn-secondary">Salvar</button>
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { DbClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatTime, PAYMENT_LABEL, PAYMENT_METHODS, type CashSession, type CashSummary } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { cashMovement, closeCash } from "./actions";

type Movement = { id: number; kind: "sangria" | "suprimento"; amount: number; reason: string; created_at: string };

/** Resumo de um caixa: vendas por forma de pagamento, gaveta, sangrias e fechamento. */
export default async function SessionPanel({
  supabase,
  session,
  operator,
  canOperate,
}: {
  supabase: DbClient;
  session: CashSession;
  operator: string;
  canOperate: boolean;
}) {
  const [{ data: summaryData }, { data: moves }] = await Promise.all([
    supabase.rpc("cash_summary", { p_session_id: session.id }),
    supabase.from("cash_movements").select("*").eq("session_id", session.id).order("created_at").returns<Movement[]>(),
  ]);
  const s = summaryData as CashSummary | null;
  if (!s) return <p className="card p-6 text-sm text-stone-500">Não foi possível carregar este caixa.</p>;

  const open = session.status === "aberto";
  const diff = session.counted_amount !== null && session.expected_amount !== null ? Number(session.counted_amount) - Number(session.expected_amount) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Caixa nº {session.id}{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-medium ${open ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-stone-100 text-stone-600"}`}>
              {open ? "Aberto" : "Fechado"}
            </span>
          </h1>
          <p className="text-sm text-stone-500">
            {operator} · aberto em {formatDateTime(session.opened_at)}
            {session.closed_at && ` · fechado às ${formatTime(session.closed_at)}`}
          </p>
        </div>
        {open && canOperate && (
          <Link href="/pdv" className="btn-primary">
            Voltar ao PDV
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-stone-900">Vendas ({s.sales_count})</h2>
          <dl className="space-y-1.5 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <Row key={m} label={PAYMENT_LABEL[m]} value={formatMoney(s.by_method[m] ?? 0)} />
            ))}
            <Row label="Total vendido" value={formatMoney(s.sales_total)} strong />
          </dl>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-stone-900">Dinheiro na gaveta</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Troco inicial" value={formatMoney(s.opening)} />
            <Row label="+ Vendas em dinheiro" value={formatMoney(s.by_method.dinheiro ?? 0)} />
            <Row label="− Troco dado" value={formatMoney(s.change)} />
            <Row label="+ Fiado recebido em dinheiro" value={formatMoney(s.fiado_received)} />
            <Row label="+ Suprimentos" value={formatMoney(s.suprimentos)} />
            <Row label="− Sangrias" value={formatMoney(s.sangrias)} />
            <Row label={open ? "Deve haver na gaveta" : "Esperado no fechamento"} value={formatMoney(open ? s.expected : session.expected_amount)} strong />
            {!open && (
              <>
                <Row label="Contado" value={formatMoney(session.counted_amount)} />
                <Row
                  label={diff === 0 ? "Diferença" : diff! > 0 ? "Sobra" : "Falta"}
                  value={formatMoney(Math.abs(diff ?? 0))}
                  strong
                  tone={diff === 0 ? "ok" : "bad"}
                />
              </>
            )}
          </dl>
          {session.notes && <p className="mt-3 rounded bg-stone-50 px-3 py-2 text-sm text-stone-600">Obs.: {session.notes}</p>}
        </section>
      </div>

      {(moves?.length ?? 0) > 0 && (
        <section className="card">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Sangrias e suprimentos</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {moves!.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 px-4 py-2">
                <span>
                  {formatTime(m.created_at)} · {m.kind === "sangria" ? "Sangria" : "Suprimento"}
                  {m.reason && <span className="text-stone-500"> — {m.reason}</span>}
                </span>
                <strong className={m.kind === "sangria" ? "text-red-700" : "text-emerald-700"}>
                  {m.kind === "sangria" ? "−" : "+"} {formatMoney(m.amount)}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && canOperate && (
        <div className="grid gap-6 lg:grid-cols-2 print:hidden">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-stone-900">Sangria ou suprimento</h2>
            <p className="mb-3 text-xs text-stone-500">Sangria: tirar dinheiro da gaveta (cofre, pagamento). Suprimento: colocar troco.</p>
            <ActionForm action={cashMovement} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="session_id" value={session.id} />
              <div>
                <label className="label" htmlFor="kind">
                  Tipo
                </label>
                <select id="kind" name="kind" className="input">
                  <option value="sangria">Sangria (retirada)</option>
                  <option value="suprimento">Suprimento (reforço)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="amount">
                  Valor (R$)
                </label>
                <input id="amount" name="amount" inputMode="decimal" className="input" required />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="reason">
                  Motivo
                </label>
                <input id="reason" name="reason" className="input" placeholder="ex.: depósito no cofre" />
              </div>
              <div className="sm:col-span-2">
                <button className="btn-secondary">Registrar</button>
              </div>
            </ActionForm>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-stone-900">Fechar o caixa</h2>
            <p className="mb-3 text-xs text-stone-500">
              Conte o dinheiro da gaveta e informe abaixo. O sistema compara com o esperado ({formatMoney(s.expected)}).
            </p>
            <ActionForm action={closeCash} className="grid gap-3">
              <input type="hidden" name="session_id" value={session.id} />
              <div>
                <label className="label" htmlFor="counted_amount">
                  Dinheiro contado (R$)
                </label>
                <input id="counted_amount" name="counted_amount" inputMode="decimal" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="notes">
                  Observação
                </label>
                <input id="notes" name="notes" className="input" placeholder="opcional" />
              </div>
              <div>
                <button className="btn-danger">Fechar caixa</button>
              </div>
            </ActionForm>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-stone-900";
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-stone-100 pt-1.5 font-semibold" : ""}`}>
      <dt className="text-stone-600">{label}</dt>
      <dd className={color}>{value}</dd>
    </div>
  );
}

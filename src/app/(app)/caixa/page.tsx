import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { formatDateTime, formatMoney, type CashSession, type Profile } from "@/lib/types";
import SessionPanel from "./session-panel";

export const metadata: Metadata = { title: "Caixa" };

export default async function CashPage() {
  const { supabase, profile } = await requireSeller();

  const [{ data: open }, { data: history }, { data: people }] = await Promise.all([
    supabase.from("cash_sessions").select("*").eq("opened_by", profile.id).eq("status", "aberto").maybeSingle<CashSession>(),
    // O banco já limita: o caixa vê os seus; o gerente vê todos
    supabase.from("cash_sessions").select("*").order("opened_at", { ascending: false }).limit(30).returns<CashSession[]>(),
    supabase.from("profiles").select("id, full_name, email").returns<Pick<Profile, "id" | "full_name" | "email">[]>(),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const sessions = (history ?? []).filter((h) => h.id !== open?.id);

  return (
    <div className="space-y-8">
      {open ? (
        <SessionPanel supabase={supabase} session={open} operator={nameOf.get(open.opened_by) ?? ""} canOperate />
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Você não tem caixa aberto</h1>
            <p className="text-sm text-stone-500">Abra o caixa no PDV, informando o troco inicial.</p>
          </div>
          <Link href="/pdv" className="btn-primary">
            Abrir caixa
          </Link>
        </div>
      )}

      <section className="card overflow-x-auto">
        <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">
          {profile.role === "admin" ? "Caixas (todos os operadores)" : "Seus caixas anteriores"}
        </h2>
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-stone-500">Nenhum caixa ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">Operador</th>
                <th className="px-4 py-2 font-medium">Abertura</th>
                <th className="px-4 py-2 font-medium">Fechamento</th>
                <th className="px-4 py-2 text-right font-medium">Esperado</th>
                <th className="px-4 py-2 text-right font-medium">Contado</th>
                <th className="px-4 py-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sessions.map((h) => {
                const diff = h.counted_amount !== null && h.expected_amount !== null ? Number(h.counted_amount) - Number(h.expected_amount) : null;
                return (
                  <tr key={h.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2">
                      <Link href={`/caixa/${h.id}`} className="font-medium text-brand-600 hover:underline">
                        {h.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{nameOf.get(h.opened_by)}</td>
                    <td className="px-4 py-2">{formatDateTime(h.opened_at)}</td>
                    <td className="px-4 py-2">{h.status === "aberto" ? <span className="text-emerald-700">aberto</span> : formatDateTime(h.closed_at)}</td>
                    <td className="px-4 py-2 text-right">{h.expected_amount === null ? "—" : formatMoney(h.expected_amount)}</td>
                    <td className="px-4 py-2 text-right">{h.counted_amount === null ? "—" : formatMoney(h.counted_amount)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${diff === null ? "" : diff === 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {diff === null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatMoney(Math.abs(diff))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

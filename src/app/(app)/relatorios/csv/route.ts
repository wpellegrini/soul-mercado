import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import type { SalesReport } from "@/lib/types";
import { readPeriod } from "../period";

/** Exporta o relatório em CSV (abre no Excel: separador ";" e vírgula decimal). */
export async function GET(request: NextRequest) {
  const { supabase } = await requireAdmin();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const { from, to } = readPeriod(sp);
  const { data, error } = await supabase.rpc("sales_report", { p_from: from, p_to: to });
  if (error) return new Response(error.message, { status: 400 });
  const r = data as SalesReport;

  const num = (n: number | string, digits = 2) => Number(n).toFixed(digits).replace(".", ",");
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  let rows: string[][];
  let name: string;
  if (sp.tipo === "dias") {
    name = `vendas-por-dia_${from}_${to}.csv`;
    rows = [["Dia", "Vendas", "Faturamento"], ...r.by_day.map((d) => [d.day.split("-").reverse().join("/"), String(d.count), num(d.revenue)])];
  } else {
    name = `produtos-vendidos_${from}_${to}.csv`;
    rows = [
      ["Produto", "Unidade", "Quantidade", "Faturamento", "Custo", "Lucro bruto"],
      ...r.top_products.map((p) => [p.name, p.unit, num(p.quantity, 3), num(p.revenue), num(p.cost), num(Number(p.revenue) - Number(p.cost))]),
    ];
  }
  // BOM: o Excel reconhece os acentos
  const body = "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}

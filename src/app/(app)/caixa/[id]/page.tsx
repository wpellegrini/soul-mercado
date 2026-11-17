import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import type { CashSession, Profile } from "@/lib/types";
import SessionPanel from "../session-panel";

export const metadata: Metadata = { title: "Caixa" };

export default async function CashSessionPage({ params }: PageProps<"/caixa/[id]">) {
  const { id } = await params;
  const { supabase, profile } = await requireSeller();
  const { data: session } = await supabase.from("cash_sessions").select("*").eq("id", Number(id)).maybeSingle<CashSession>();
  if (!session) notFound();
  const { data: op } = await supabase.from("profiles").select("full_name, email").eq("id", session.opened_by).maybeSingle<Pick<Profile, "full_name" | "email">>();

  return (
    <div className="space-y-4">
      <Link href="/caixa" className="text-sm text-stone-500 hover:text-stone-900 print:hidden">
        ← Caixas
      </Link>
      <SessionPanel
        supabase={supabase}
        session={session}
        operator={op?.full_name || op?.email || ""}
        canOperate={session.opened_by === profile.id || profile.role === "admin"}
      />
    </div>
  );
}

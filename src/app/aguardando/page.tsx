import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = { title: "Aguardando liberação" };

export default async function WaitingPage() {
  const { profile } = await getSession();
  if (profile.role !== "pendente") redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl">
          ⏳
        </div>
        <h1 className="text-lg font-semibold text-stone-900">Cadastro recebido</h1>
        <p className="mt-2 text-sm text-stone-600">
          Olá, {profile.full_name || profile.email}. Seu acesso precisa ser liberado por um
          gerente, que vai definir se você trabalha no <strong>caixa</strong> ou no{" "}
          <strong>estoque</strong>. Depois disso, é só entrar de novo.
        </p>
        <form action={signOut} className="mt-6">
          <button className="btn-secondary">Sair</button>
        </form>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">
            SM
          </div>
          <h1 className="text-xl font-semibold text-stone-900">Soul Mercado</h1>
          <p className="mt-1 text-sm text-stone-500">PDV, estoque e caixa para minimercados e padarias</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

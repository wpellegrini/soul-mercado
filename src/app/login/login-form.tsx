"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginForm() {
  const [mode, setMode] = useState<"entrar" | "cadastrar">("entrar");
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});

  const state = mode === "entrar" ? signInState : signUpState;
  const pending = mode === "entrar" ? signingIn : signingUp;

  return (
    <div className="card p-6 sm:p-8">
      <div className="mb-6 grid grid-cols-2 rounded-md bg-stone-100 p-1 text-sm">
        {(["entrar", "cadastrar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1.5 font-medium transition ${
              mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
            }`}
          >
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <form action={mode === "entrar" ? signInAction : signUpAction} className="space-y-4">
        {mode === "cadastrar" && (
          <div>
            <label htmlFor="full_name" className="label">
              Nome completo
            </label>
            <input id="full_name" name="full_name" className="input" autoComplete="name" required />
          </div>
        )}
        <div>
          <label htmlFor="email" className="label">
            E-mail
          </label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            minLength={mode === "cadastrar" ? 8 : undefined}
            autoComplete={mode === "entrar" ? "current-password" : "new-password"}
            required
          />
          {mode === "cadastrar" && (
            <p className="mt-1 text-xs text-stone-500">Mínimo de 8 caracteres.</p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-md bg-brand-50 px-3 py-2 text-sm text-emerald-800">
            {state.message}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Aguarde..." : mode === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useActionState } from "react";

type State = { error?: string; ok?: string };

/** Formulário genérico que mostra a mensagem de erro/sucesso da Server Action. */
export default function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="mt-2 basis-full text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && !pending && (
        <p role="status" className="mt-2 basis-full text-sm text-emerald-700">
          {state.ok}
        </p>
      )}
    </form>
  );
}

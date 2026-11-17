"use client";

import { useEffect } from "react";

/** Sem "button": abre a janela de impressão ao carregar. Com "button": mostra o botão Imprimir. */
export default function AutoPrint({ button }: { button?: boolean }) {
  useEffect(() => {
    if (button) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [button]);

  if (!button) return null;
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => window.print()}>
        Imprimir
      </button>
      <button type="button" className="btn-secondary" onClick={() => window.close()}>
        Fechar
      </button>
    </>
  );
}

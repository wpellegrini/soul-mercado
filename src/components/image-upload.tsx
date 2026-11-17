"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { imageUrl } from "@/lib/types";

/** Reduz a foto para no máximo 600 px (webp) antes de enviar: fica leve no PDV. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte a imagens");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao converter a foto"))), "image/webp", 0.82),
  );
}

/**
 * Escolhe/tira a foto, envia direto para o Supabase Storage e guarda o caminho
 * num campo escondido "image_path" do formulário.
 */
export default function ImageUpload({ initialPath, emoji }: { initialPath: string; emoji: string }) {
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = imageUrl(path);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await shrink(file);
      const name = `${crypto.randomUUID()}.webp`;
      const { error: upErr } = await createClient()
        .storage.from("produtos")
        .upload(name, blob, { contentType: "image/webp", cacheControl: "31536000" });
      if (upErr) throw new Error(upErr.message);
      setPath(name);
    } catch (err) {
      setError(`Não foi possível enviar a foto: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <input type="hidden" name="image_path" value={path} />
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Foto do produto" className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl" aria-hidden="true">
            {emoji}
          </span>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <label className="btn-secondary cursor-pointer">
          {busy ? "Enviando..." : url ? "Trocar foto" : "Adicionar foto"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} disabled={busy} />
        </label>
        {url && (
          <button type="button" className="block text-xs text-red-700 hover:underline" onClick={() => setPath("")}>
            Remover foto
          </button>
        )}
        <p className="text-xs text-stone-500">No celular, abre a câmera. A foto é reduzida antes do envio.</p>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}

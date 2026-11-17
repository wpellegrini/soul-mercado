"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function getDetector(): DetectorCtor | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null);
}

/**
 * Lê código de barras pela câmera do celular (Chrome no Android, Safari recente).
 * Nos computadores, use o leitor USB: ele "digita" o código e aperta Enter.
 */
export default function CameraScanner({ onCode, label = "Ler com a câmera" }: { onCode: (code: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    // Só depois de montar: no servidor não existe "window"
    const t = setTimeout(() => setSupported(Boolean(getDetector()) && Boolean(navigator.mediaDevices)), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const Ctor = getDetector();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        while (!stopped) {
          const found = await detector.detect(video).catch(() => []);
          if (found[0]?.rawValue) {
            onCodeRef.current(found[0].rawValue);
            setOpen(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("Não foi possível abrir a câmera. Verifique a permissão do navegador.");
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!supported) return null;

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => (setError(""), setOpen(true))}>
        📷 {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Leitor pela câmera">
          <div className="w-full max-w-md rounded-lg bg-white p-4">
            <p className="mb-2 text-sm text-stone-600">Aponte a câmera para o código de barras.</p>
            <video ref={videoRef} className="aspect-video w-full rounded bg-black object-cover" muted playsInline />
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Cabeçalhos de segurança do sistema.
// A política de conteúdo (CSP) usa um código único por página (nonce): só os
// scripts do próprio sistema rodam, e o site não pode ser embutido em outro
// (proteção contra clickjacking).

/** Câmera: o Soul Mercado lê código de barras pela câmera do celular. */
const CAMERA = "self";

export function newNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  // Endereço do Supabase: fotos dos produtos (Storage) e envio de fotos
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Estilos inline (ex.: altura das barras dos gráficos) não executam código
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${supabase}`.trim(),
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Demais cabeçalhos, aplicados a todas as respostas (next.config.ts). */
export const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: `camera=(${CAMERA}), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`,
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

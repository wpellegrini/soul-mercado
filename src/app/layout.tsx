import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Soul Mercado", template: "%s | Soul Mercado" },
  description: "PDV, estoque e caixa para minimercados e padarias — Soul Pellegrini",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Todas as páginas renderizadas a cada acesso: assim cada uma recebe o
  // código único (nonce) da política de segurança, inclusive a de login.
  await connection();
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}

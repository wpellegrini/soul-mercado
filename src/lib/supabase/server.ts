import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

export const DB_SCHEMA = "mercado";

export type DbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Cliente Supabase para Server Components e Server Actions (um por requisição).
 * Todas as tabelas ficam no schema "mercado": o projeto Supabase pode ser
 * dividido com outros sistemas sem misturar dados.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

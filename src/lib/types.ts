export type Role = "pendente" | "caixa" | "estoque" | "admin";
export type Unit = "un" | "kg";
export type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito" | "fiado";
export type MovementKind = "entrada" | "venda" | "cancelamento" | "ajuste" | "perda";

export const ROLES: Role[] = ["pendente", "caixa", "estoque", "admin"];
export const ROLE_LABEL: Record<Role, string> = {
  pendente: "Aguardando liberação",
  caixa: "Caixa",
  estoque: "Estoque",
  admin: "Gerente (administrador)",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["dinheiro", "pix", "debito", "credito", "fiado"];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  fiado: "Fiado",
};

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  entrada: "Entrada",
  venda: "Venda",
  cancelamento: "Venda cancelada",
  ajuste: "Ajuste",
  perda: "Perda",
};

export const BUSINESS_KINDS = ["minimercado", "padaria", "mercearia", "emporio"] as const;
export type BusinessKind = (typeof BUSINESS_KINDS)[number];
export const BUSINESS_LABEL: Record<BusinessKind, string> = {
  minimercado: "Minimercado",
  padaria: "Padaria",
  mercearia: "Mercearia",
  emporio: "Empório",
};

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  created_at: string;
};

export type Settings = {
  id: number;
  store_name: string;
  business_kind: BusinessKind;
  document: string;
  phone: string;
  address: string;
  receipt_footer: string;
  max_discount_pct: number;
  scale_prefix: string;
  scale_code_digits: number;
  scale_value_kind: "preco" | "peso";
};

export type Category = { id: number; name: string; emoji: string; sort: number };

export type Product = {
  id: number;
  name: string;
  barcode: string;
  plu: string;
  category_id: number | null;
  unit: Unit;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  image_path: string;
  favorite: boolean;
  active: boolean;
  price_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: number;
  name: string;
  phone: string;
  document: string;
  credit_limit: number;
  notes: string;
  active: boolean;
  created_at: string;
};

export type CashSession = {
  id: number;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  status: "aberto" | "fechado";
  closed_at: string | null;
  expected_amount: number | null;
  counted_amount: number | null;
  notes: string;
};

export type CashSummary = {
  opening: number;
  sales_count: number;
  sales_total: number;
  change: number;
  by_method: Partial<Record<PaymentMethod, number>>;
  fiado_received: number;
  suprimentos: number;
  sangrias: number;
  expected: number;
};

export type Sale = {
  id: number;
  session_id: number;
  seller_id: string;
  customer_id: number | null;
  subtotal: number;
  discount: number;
  total: number;
  change_amount: number;
  status: "concluida" | "cancelada";
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string;
};

export type SaleItem = {
  id: number;
  product_id: number;
  name: string;
  unit: Unit;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total: number;
};

export type SalesReport = {
  sales_count: number;
  gross: number;
  discount: number;
  revenue: number;
  cost: number;
  items: number;
  cancelled: number;
  by_method: Partial<Record<PaymentMethod, number>>;
  by_day: { day: string; revenue: number; count: number }[];
  by_hour: { hour: number; revenue: number; count: number }[];
  by_category: { category: string; revenue: number; cost: number }[];
  top_products: { product_id: number; name: string; unit: Unit; quantity: number; revenue: number; cost: number }[];
};

// ---------- Permissões (as mesmas regras do banco) ----------
export const canSell = (r: Role) => r === "caixa" || r === "admin";
export const canStock = (r: Role) => r === "estoque" || r === "admin";

// ---------- Datas (sempre no fuso de Brasília) ----------
export const TZ = "America/Sao_Paulo";

export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

/** Início do dia (00:00 de Brasília) em ISO, para filtrar created_at. */
export function dayStart(iso: string) {
  return `${iso}T00:00:00-03:00`;
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TZ }).format(new Date(iso));
}

// ---------- Números ----------
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatMoney(v: number | string | null | undefined) {
  return brl.format(Number(v ?? 0));
}

/** 2 → "2 un" · 0.355 → "0,355 kg" */
export function formatQty(q: number | string, unit: Unit) {
  const n = Number(q);
  if (unit === "kg") return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} un`;
}

export function formatPct(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Aceita "1.234,56", "1234,56" e "1234.56". */
export function parseDecimal(raw: string) {
  const s = raw.replace(/\s|R\$/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Remove acentos e deixa minúsculo, para buscas. */
export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

/** Endereço público da foto do produto (bucket "produtos" do Supabase Storage). */
export function imageUrl(path: string | null | undefined) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/produtos/${path}` : null;
}

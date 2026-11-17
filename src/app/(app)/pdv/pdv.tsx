"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ScaleConfig } from "@/lib/barcode";
import { cashSuggestions, lineTotal, parseInput, parseWeight, resolveCode, searchProducts } from "@/lib/pdv";
import { formatMoney, formatQty, parseDecimal, PAYMENT_LABEL, round2, type Category, type PaymentMethod, type Unit } from "@/lib/types";
import ProductImage from "@/components/product-image";
import { finalizeSale } from "./actions";

export type PdvProduct = {
  id: number;
  name: string;
  barcode: string;
  plu: string;
  unit: Unit;
  price: number;
  image_path: string;
  favorite: boolean;
  category_id: number | null;
  emoji: string;
};

export type PdvCustomer = { id: number; name: string; credit_limit: number; debt: number };

type Line = {
  key: string;
  product: PdvProduct;
  quantity: number;
  labelTotal: number | null;
  total: number;
};

type Payment = { method: PaymentMethod; amount: number };

// ---------- Bipe (som de confirmação e de erro) ----------
let audioCtx: AudioContext | null = null;
function beep(ok: boolean) {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 1400 : 220;
    osc.type = ok ? "sine" : "square";
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (ok ? 0.08 : 0.3));
  } catch {
    // sem som: segue normalmente
  }
}

let seq = 0;
const newKey = () => `l${++seq}`;

export default function Pdv({
  products,
  categories,
  customers,
  scale,
  maxDiscountPct,
}: {
  products: PdvProduct[];
  categories: Category[];
  customers: PdvCustomer[];
  scale: ScaleConfig;
  maxDiscountPct: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [grid, setGrid] = useState<"fav" | number>("fav");
  const [weighing, setWeighing] = useState<PdvProduct | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ saleId: number; total: number; change: number } | null>(null);

  const subtotal = useMemo(() => round2(cart.reduce((s, l) => s + l.total, 0)), [cart]);
  const itemsCount = cart.reduce((n, l) => n + (l.product.unit === "un" ? l.quantity : 1), 0);
  const last = cart.find((l) => l.key === lastKey) ?? cart[cart.length - 1] ?? null;

  const focusInput = useCallback(() => setTimeout(() => inputRef.current?.focus(), 0), []);

  // Cada bipe é um evento de teclado separado: o React atualiza "cart" entre um e outro
  function addProduct(product: PdvProduct, quantity: number, labelTotal: number | null) {
    beep(true);
    setMessage(null);
    // Produto por unidade bipado de novo: soma na mesma linha e sobe para o fim da lista
    if (product.unit === "un" && labelTotal === null) {
      const i = cart.findIndex((l) => l.product.id === product.id && l.labelTotal === null);
      if (i >= 0) {
        const q = cart[i].quantity + quantity;
        const updated = { ...cart[i], quantity: q, total: lineTotal("un", product.price, q, null) };
        setCart([...cart.slice(0, i), ...cart.slice(i + 1), updated]);
        setLastKey(updated.key);
        return;
      }
    }
    const line: Line = {
      key: newKey(),
      product,
      quantity,
      labelTotal,
      total: lineTotal(product.unit, product.price, quantity, labelTotal),
    };
    setCart([...cart, line]);
    setLastKey(line.key);
  }

  /** Clique numa foto da grade. "3*" digitado antes multiplica; em kg, "0,350*" é o peso. */
  function pick(product: PdvProduct) {
    const m = code.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*xX]/);
    const multiplier = m && parseDecimal(m[1]) > 0 ? parseDecimal(m[1]) : null;
    setCode("");
    if (product.unit === "kg" && multiplier === null) {
      setWeighing(product);
      return;
    }
    if (product.unit === "un" && multiplier !== null && !Number.isInteger(multiplier)) {
      beep(false);
      setMessage({ error: true, text: `${product.name} é vendido por unidade: use quantidade inteira.` });
      focusInput();
      return;
    }
    addProduct(product, multiplier ?? 1, null);
    focusInput();
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const raw = code.trim();
    if (!raw) {
      if (cart.length) setPaying(true);
      return;
    }
    const r = resolveCode(raw, products, scale);
    if (r.kind === "notfound") {
      beep(false);
      setMessage({ error: true, text: `Produto não encontrado: ${r.code || raw}` });
      setCode("");
      return;
    }
    if (r.kind === "search") return; // a grade já mostra os resultados para escolher
    setCode("");
    if (r.quantity === null) {
      setWeighing(r.product);
      return;
    }
    if (r.product.unit === "un" && !Number.isInteger(r.quantity)) {
      beep(false);
      setMessage({ error: true, text: `${r.product.name} é vendido por unidade: use quantidade inteira.` });
      return;
    }
    addProduct(r.product, r.quantity, r.labelTotal);
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
    focusInput();
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key) return [l];
        const q = l.quantity + delta;
        if (q <= 0) return [];
        return [{ ...l, quantity: q, total: lineTotal(l.product.unit, l.product.price, q, null) }];
      }),
    );
    focusInput();
  }

  const resetSale = useCallback(() => {
    setCart([]);
    setLastKey(null);
    setPaying(false);
    setDone(null);
    setMessage(null);
    setCode("");
    focusInput();
  }, [focusInput]);

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          resetSale();
        }
        return;
      }
      if (paying || weighing) return; // a janela aberta cuida das teclas
      if (e.key === "F2") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (cart.length) setPaying(true);
      } else if (e.key === "F6") {
        e.preventDefault();
        if (last) removeLine(last.key);
      } else if (e.key === "F9") {
        e.preventDefault();
        if (cart.length && confirm("Cancelar esta venda e limpar todos os itens?")) resetSale();
      } else if (e.key === "Escape") {
        setCode("");
        setMessage(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Grade: busca pelo nome, seção escolhida ou favoritos
  const { code: typed } = parseInput(code);
  const searching = typed.length >= 2 && !/^\d+$/.test(typed);
  const gridProducts = searching
    ? searchProducts(typed, products, 30)
    : grid === "fav"
      ? products.filter((p) => p.favorite)
      : products.filter((p) => p.category_id === grid);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      {/* ------- Esquerda: leitura, último item e grade com fotos ------- */}
      <div className="min-w-0 space-y-4">
        <form onSubmit={submitCode}>
          <label htmlFor="pdv-code" className="sr-only">
            Código de barras, código curto ou nome do produto
          </label>
          <div className="flex gap-2">
            <input
              id="pdv-code"
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="Bipe o código de barras, digite o código ou o nome (F2)"
              className="input h-14 min-w-0 flex-1 text-lg"
            />
            <button className="btn-primary h-14 px-6">Adicionar</button>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Quantidade: <kbd className="rounded bg-stone-200 px-1">3*</kbd> antes do código · Peso:{" "}
            <kbd className="rounded bg-stone-200 px-1">0,350*0001</kbd> · Enter com o campo vazio vai para o pagamento
          </p>
        </form>

        {message && (
          <p
            role="alert"
            className={`rounded-md px-4 py-3 text-sm font-medium ${message.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
          >
            {message.text}
          </p>
        )}

        {/* Último item: foto grande */}
        <div className="card flex items-center gap-5 p-4">
          {last ? (
            <>
              <ProductImage path={last.product.image_path} emoji={last.product.emoji} name={last.product.name} className="h-32 w-32 text-4xl sm:h-40 sm:w-40" rounded="rounded-lg" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Último item</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900 sm:text-3xl">{last.product.name}</div>
                <div className="mt-2 text-lg text-stone-600">
                  {formatQty(last.quantity, last.product.unit)} × {formatMoney(last.product.price)}
                  {last.product.unit === "kg" ? "/kg" : ""}
                </div>
                <div className="mt-1 text-3xl font-bold text-brand-600">{formatMoney(last.total)}</div>
              </div>
            </>
          ) : (
            <div className="flex h-32 w-full items-center justify-center text-stone-400 sm:h-40">
              Caixa livre — bipe o primeiro produto
            </div>
          )}
        </div>

        {/* Grade de atalhos com foto */}
        <div>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 text-sm">
            {searching ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">
                Resultado da busca: “{typed}” ({gridProducts.length})
              </span>
            ) : (
              <>
                <Chip active={grid === "fav"} onClick={() => setGrid("fav")}>
                  ⭐ Atalhos
                </Chip>
                {categories.map((c) => (
                  <Chip key={c.id} active={grid === c.id} onClick={() => setGrid(c.id)}>
                    {c.emoji} {c.name}
                  </Chip>
                ))}
              </>
            )}
          </div>
          {gridProducts.length === 0 ? (
            <p className="card p-6 text-sm text-stone-500">
              {searching
                ? "Nenhum produto com esse nome."
                : grid === "fav"
                  ? "Marque produtos como “atalho no PDV” no cadastro para aparecerem aqui (pão francês, sonho, café...)."
                  : "Nenhum produto nesta seção."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {gridProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className="card flex flex-col items-center gap-1 p-2 text-center transition hover:border-brand-600 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  <ProductImage path={p.image_path} emoji={p.emoji} name={p.name} className="h-20 w-full text-2xl" />
                  <span className="line-clamp-2 text-xs font-medium text-stone-800">{p.name}</span>
                  <span className="text-sm font-semibold text-stone-900">
                    {formatMoney(p.price)}
                    {p.unit === "kg" && <span className="text-xs font-normal text-stone-500">/kg</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------- Direita: cupom em andamento ------- */}
      <aside className="card flex min-h-[420px] flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="font-semibold text-stone-900">Venda atual</h2>
          <span className="text-sm text-stone-500">
            {itemsCount.toLocaleString("pt-BR")} {itemsCount === 1 ? "item" : "itens"}
          </span>
        </div>
        <ol className="flex-1 divide-y divide-stone-100 overflow-y-auto">
          {cart.length === 0 && <li className="px-4 py-10 text-center text-sm text-stone-400">Nenhum item ainda.</li>}
          {cart.map((l, i) => (
            <li key={l.key} className={`flex items-center gap-3 px-4 py-2 ${l.key === last?.key ? "bg-amber-50" : ""}`}>
              <span className="w-5 text-xs text-stone-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-stone-900">{l.product.name}</div>
                <div className="text-xs text-stone-500">
                  {formatQty(l.quantity, l.product.unit)} × {formatMoney(l.product.price)}
                  {l.labelTotal !== null && " · etiqueta da balança"}
                </div>
              </div>
              {l.product.unit === "un" && l.labelTotal === null && (
                <div className="flex items-center">
                  <button type="button" onClick={() => changeQty(l.key, -1)} className="h-7 w-7 rounded border border-stone-200 text-stone-600 hover:bg-stone-100" aria-label={`Diminuir ${l.product.name}`}>
                    −
                  </button>
                  <button type="button" onClick={() => changeQty(l.key, 1)} className="ml-1 h-7 w-7 rounded border border-stone-200 text-stone-600 hover:bg-stone-100" aria-label={`Aumentar ${l.product.name}`}>
                    +
                  </button>
                </div>
              )}
              <span className="w-20 text-right text-sm font-semibold text-stone-900">{formatMoney(l.total)}</span>
              <button type="button" onClick={() => removeLine(l.key)} className="text-stone-400 hover:text-red-700" aria-label={`Remover ${l.product.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ol>
        <div className="border-t border-stone-200 p-4">
          <div className="flex items-end justify-between">
            <span className="text-sm font-medium uppercase tracking-wide text-stone-500">Total</span>
            <span className="text-4xl font-bold text-stone-900">{formatMoney(subtotal)}</span>
          </div>
          <button
            type="button"
            className="btn-primary mt-4 w-full py-4 text-lg"
            disabled={!cart.length}
            onClick={() => setPaying(true)}
          >
            Finalizar venda (F4)
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary text-xs" disabled={!last} onClick={() => last && removeLine(last.key)}>
              Tirar último item (F6)
            </button>
            <button
              type="button"
              className="btn-danger text-xs"
              disabled={!cart.length}
              onClick={() => confirm("Cancelar esta venda e limpar todos os itens?") && resetSale()}
            >
              Cancelar venda (F9)
            </button>
          </div>
        </div>
      </aside>

      {weighing && (
        <WeightDialog
          product={weighing}
          onCancel={() => {
            setWeighing(null);
            focusInput();
          }}
          onConfirm={(kg) => {
            addProduct(weighing, kg, null);
            setWeighing(null);
            focusInput();
          }}
        />
      )}

      {paying && !done && (
        <PaymentDialog
          subtotal={subtotal}
          lines={cart}
          customers={customers}
          maxDiscountPct={maxDiscountPct}
          onCancel={() => {
            setPaying(false);
            focusInput();
          }}
          onDone={(r) => {
            setDone(r);
            router.refresh(); // atualiza o fiado dos clientes
          }}
        />
      )}

      {done && <DoneDialog result={done} onNext={resetSale} />}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1 font-medium transition ${
        active ? "bg-brand text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function WeightDialog({ product, onCancel, onConfirm }: { product: PdvProduct; onCancel: () => void; onConfirm: (kg: number) => void }) {
  const [raw, setRaw] = useState("");
  const kg = parseWeight(raw);
  const valid = kg > 0 && kg < 100;
  return (
    <Modal title="Informe o peso" onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(kg);
        }}
        className="space-y-4"
      >
        <div className="flex items-center gap-4">
          <ProductImage path={product.image_path} emoji={product.emoji} name={product.name} className="h-20 w-20 text-3xl" />
          <div>
            <div className="text-lg font-semibold text-stone-900">{product.name}</div>
            <div className="text-stone-600">{formatMoney(product.price)}/kg</div>
          </div>
        </div>
        <div>
          <label htmlFor="weight" className="label">
            Peso (kg ou gramas)
          </label>
          <input id="weight" value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" placeholder="ex.: 0,350 ou 350" className="input h-12 text-xl" autoFocus />
          <p className="mt-1 text-sm text-stone-600">
            {valid ? (
              <>
                {formatQty(kg, "kg")} = <strong>{formatMoney(round2(kg * product.price))}</strong>
              </>
            ) : (
              "Números inteiros a partir de 10 são gramas (350 = 0,350 kg)."
            )}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!valid}>
            Adicionar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentDialog({
  subtotal,
  lines,
  customers,
  maxDiscountPct,
  onCancel,
  onDone,
}: {
  subtotal: number;
  lines: Line[];
  customers: PdvCustomer[];
  maxDiscountPct: number;
  onCancel: () => void;
  onDone: (r: { saleId: number; total: number; change: number }) => void;
}) {
  const [discountRaw, setDiscountRaw] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [amountRaw, setAmountRaw] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);

  // Desconto em R$ ou em % ("10%")
  const discount = (() => {
    const s = discountRaw.trim();
    if (!s) return 0;
    if (s.endsWith("%")) return round2((subtotal * parseDecimal(s.slice(0, -1))) / 100);
    return round2(parseDecimal(s));
  })();
  const maxDiscount = round2((subtotal * maxDiscountPct) / 100);
  const discountError =
    !Number.isFinite(discount) || discount < 0
      ? "Desconto inválido."
      : discount > maxDiscount
        ? `Desconto máximo: ${formatMoney(maxDiscount)} (${maxDiscountPct}%).`
        : "";
  const total = round2(subtotal - (discountError ? 0 : discount));
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2(Math.max(0, total - paid));
  const change = round2(Math.max(0, paid - total));
  const hasFiado = payments.some((p) => p.method === "fiado") || method === "fiado";
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const ready = remaining === 0 && !discountError && (!payments.some((p) => p.method === "fiado") || customer);

  // Ao abrir (e a cada pagamento), sugere o valor que falta
  useEffect(() => {
    const t = setTimeout(() => {
      setAmountRaw(remaining > 0 ? remaining.toFixed(2).replace(".", ",") : "");
      amountRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [remaining, method]);

  function addPayment(amountOverride?: number) {
    setError("");
    const amount = round2(amountOverride ?? parseDecimal(amountRaw));
    if (!(amount > 0)) return setError("Informe o valor recebido.");
    if (method !== "dinheiro" && amount > remaining) return setError("Cartão, Pix e fiado não podem passar do total (troco só em dinheiro).");
    if (method === "fiado") {
      if (!customer) return setError("Escolha o cliente do fiado.");
      if (customer.debt + amount > customer.credit_limit)
        return setError(
          customer.credit_limit === 0
            ? `${customer.name} não tem limite de fiado (o gerente define em Clientes).`
            : `Limite de fiado excedido: limite ${formatMoney(customer.credit_limit)}, já deve ${formatMoney(customer.debt)}.`,
        );
    }
    setPayments((prev) => [...prev, { method, amount }]);
  }

  function finish() {
    if (!ready || pending) return;
    setError("");
    startTransition(async () => {
      const r = await finalizeSale({
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          ...(l.labelTotal !== null ? { total: l.labelTotal } : {}),
        })),
        payments,
        discount: discountError ? 0 : discount,
        customerId: customer?.id ?? null,
      });
      if ("error" in r) {
        beep(false);
        setError(r.error);
      } else {
        beep(true);
        onDone(r);
      }
    });
  }

  return (
    <Modal title="Pagamento" onClose={onCancel}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total" value={formatMoney(total)} strong />
          <Stat label="Falta" value={formatMoney(remaining)} tone={remaining > 0 ? "warn" : undefined} />
          <Stat label="Troco" value={formatMoney(change)} tone={change > 0 ? "ok" : undefined} />
        </div>

        <div>
          <label htmlFor="discount" className="label">
            Desconto <span className="font-normal text-stone-500">(R$ ou %, ex.: 2,00 ou 5%)</span>
          </label>
          <input id="discount" value={discountRaw} onChange={(e) => setDiscountRaw(e.target.value)} className="input" placeholder="0,00" disabled={payments.length > 0} />
          {discountError && <p className="mt-1 text-xs text-red-700">{discountError}</p>}
          {discount > 0 && !discountError && <p className="mt-1 text-xs text-stone-500">Subtotal {formatMoney(subtotal)} − desconto {formatMoney(discount)}</p>}
        </div>

        {remaining > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(["dinheiro", "pix", "debito", "credito", "fiado"] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-md border px-2 py-3 text-sm font-medium transition ${
                    method === m ? "border-brand-600 bg-brand-50 text-emerald-900 ring-2 ring-brand-600/30" : "border-stone-200 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {m === "debito" ? "Débito" : m === "credito" ? "Crédito" : PAYMENT_LABEL[m]}
                </button>
              ))}
            </div>

            {hasFiado && (
              <div>
                <label htmlFor="customer" className="label">
                  Cliente do fiado
                </label>
                <select id="customer" className="input" value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Escolha...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — deve {formatMoney(c.debt)} de {formatMoney(c.credit_limit)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addPayment();
              }}
              className="flex gap-2"
            >
              <label htmlFor="amount" className="sr-only">
                Valor recebido
              </label>
              <input id="amount" ref={amountRef} value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} inputMode="decimal" className="input h-12 flex-1 text-xl" autoFocus />
              <button className="btn-primary px-5">Lançar {PAYMENT_LABEL[method].replace("Cartão de ", "")}</button>
            </form>
            {method === "dinheiro" && (
              <div className="flex flex-wrap gap-2">
                {cashSuggestions(remaining).map((v) => (
                  <button key={v} type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => addPayment(v)}>
                    {v === remaining ? "Valor exato" : formatMoney(v)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {payments.length > 0 && (
          <ul className="divide-y divide-stone-100 rounded-md border border-stone-200 text-sm">
            {payments.map((p, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2">
                <span>{PAYMENT_LABEL[p.method]}</span>
                <span className="flex items-center gap-3">
                  <strong>{formatMoney(p.amount)}</strong>
                  <button type="button" className="text-stone-400 hover:text-red-700" onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))} aria-label="Remover pagamento">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Voltar (Esc)
          </button>
          <button
            type="button"
            className="btn-primary px-6 py-3 text-base"
            disabled={!ready || pending}
            onClick={finish}
            ref={(el) => {
              if (el && ready && !pending) el.focus();
            }}
          >
            {pending ? "Gravando..." : "Concluir venda"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warn" | "ok" }) {
  const color = tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "text-stone-900";
  return (
    <div className="rounded-lg bg-stone-50 px-2 py-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`${strong ? "text-2xl" : "text-xl"} font-bold ${color}`}>{value}</div>
    </div>
  );
}

function DoneDialog({ result, onNext }: { result: { saleId: number; total: number; change: number }; onNext: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Venda concluída">
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">✓</div>
        <h2 className="text-xl font-semibold text-stone-900">Venda nº {result.saleId} concluída</h2>
        <p className="mt-1 text-stone-600">Total {formatMoney(result.total)}</p>
        {result.change > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 py-4">
            <div className="text-sm font-medium text-amber-900">Troco</div>
            <div className="text-4xl font-bold text-amber-900">{formatMoney(result.change)}</div>
          </div>
        )}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <a href={`/cupom/${result.saleId}?imprimir=1`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Imprimir cupom
          </a>
          <button type="button" className="btn-primary" onClick={onNext} autoFocus>
            Nova venda (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}

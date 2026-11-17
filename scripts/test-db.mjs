// Testa o banco de dados localmente, sem Supabase, usando PGlite (PostgreSQL em WebAssembly).
// Uso: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/0001_mercado.sql", import.meta.url), "utf8");

// Simula o que o Supabase já traz pronto: schemas auth/extensions, auth.uid() e os papéis.
const supabaseShim = `
  create schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth, extensions to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const db = new PGlite();
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FALHOU  ${name}${detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
  }
}

async function expectError(name, fn, fragment) {
  try {
    await fn();
    check(`${name} (deveria falhar)`, false);
  } catch (e) {
    const ok = fragment ? String(e.message).includes(fragment) : true;
    if (!ok) console.log(`        erro recebido: ${e.message}`);
    check(name, ok);
  }
}

// Executa como um usuário logado (papel "authenticated" + auth.uid())
async function as(userId, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.exec(`set local role authenticated`);
    return tx.query(sql, params);
  });
}
const one = async (userId, sql, params = []) => (await as(userId, sql, params)).rows[0];
const q1 = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const num = (v) => Number(v);

async function createUser(email, name) {
  const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
    email,
    JSON.stringify({ full_name: name }),
  ]);
  return r.rows[0].id;
}

const productId = async (name) => (await q1(`select id from public.products where name=$1`, [name])).id;
const stockOf = async (id) => num((await q1(`select stock from public.products where id=$1`, [id])).stock);
const sell = (user, items, payments, discount = 0, customer = null) =>
  one(user, `select public.finalize_sale($1::jsonb, $2::jsonb, $3, $4) as id`, [
    JSON.stringify(items),
    JSON.stringify(payments),
    discount,
    customer,
  ]).then((r) => r.id);

await db.exec(supabaseShim);
await db.exec(migration);
console.log("Migração aplicada.\n");

// ---------------------------------------------------------------------
console.log("Cadastro e perfis");
const admin = await createUser("gerente@mercado.com", "Gina Gerente");
const caixa = await createUser("caixa@mercado.com", "Caio Caixa");
const caixa2 = await createUser("caixa2@mercado.com", "Cora Caixa");
const estoquista = await createUser("estoque@mercado.com", "Edu Estoque");
const novato = await createUser("novo@mercado.com", "Nina Nova");

const roles = Object.fromEntries((await db.query(`select email, role from public.profiles`)).rows.map((r) => [r.email, r.role]));
check("primeiro usuário vira admin", roles["gerente@mercado.com"] === "admin");
check("demais usuários entram como pendentes", roles["caixa@mercado.com"] === "pendente");
await expectError(
  "pendente não consegue se liberar sozinho",
  () => as(novato, `update public.profiles set role='admin' where id=$1`, [novato]),
  "Apenas administradores",
);
await as(admin, `update public.profiles set role='caixa' where id = any($1::uuid[])`, [[caixa, caixa2]]);
await as(admin, `update public.profiles set role='estoque' where id=$1`, [estoquista]);
check(
  "admin libera caixas e estoquista",
  (await q1(`select count(*)::int n from public.profiles where role in ('caixa','estoque')`)).n === 3,
);
await expectError(
  "último admin não pode deixar de ser admin",
  () => as(admin, `update public.profiles set role='caixa' where id=$1`, [admin]),
  "pelo menos um administrador",
);

// ---------------------------------------------------------------------
console.log("\nProdutos e exemplos");
const leite = await productId("Leite integral 1L");
const pao = await productId("Pão francês");
const cerveja = await productId("Cerveja lata 350ml");
check("24 produtos de exemplo", (await q1(`select count(*)::int n from public.products`)).n === 24);
check("estoque inicial dos exemplos (leite = 48)", (await stockOf(leite)) === 48);
check("estoque inicial por kg (pão = 10 kg)", (await stockOf(pao)) === 10);
check(
  "pendente não vê produtos",
  (await as(novato, `select count(*)::int n from public.products`)).rows[0].n === 0,
);
check("caixa vê produtos", (await one(caixa, `select count(*)::int n from public.products`)).n === 24);
await expectError(
  "caixa não cadastra produto",
  () => as(caixa, `insert into public.products (name, price) values ('Bala', 0.5)`),
  "row-level security",
);
const novo = (
  await one(
    estoquista,
    `insert into public.products (name, barcode, price, cost, stock) values ('Biscoito recheado', '7899123450167', 3.49, 2.10, 999) returning id, stock`,
  )
);
check("estoque cadastra produto e o estoque começa em zero", num(novo.stock) === 0);
await expectError(
  "código de barras repetido é recusado",
  () => as(estoquista, `insert into public.products (name, barcode, price) values ('Outro', '7899123450167', 1)`),
  "products_barcode_key",
);
await expectError(
  "estoque não muda por edição direta",
  () => as(admin, `update public.products set stock = 500 where id=$1`, [leite]),
  "O estoque só muda",
);
await as(estoquista, `update public.products set price = 5.69 where id=$1`, [leite]);
check("estoque altera preço", num((await q1(`select price from public.products where id=$1`, [leite])).price) === 5.69);

// ---------------------------------------------------------------------
console.log("\nMovimentações de estoque");
await as(
  estoquista,
  `insert into public.stock_movements (product_id, kind, quantity, unit_cost, reason) values ($1, 'entrada', 24, 2.15, 'NF 123 - Distribuidora')`,
  [novo.id],
);
const bisc = await q1(`select stock, cost from public.products where id=$1`, [novo.id]);
check("entrada soma no estoque", num(bisc.stock) === 24);
check("entrada com custo atualiza o custo do produto", num(bisc.cost) === 2.15);
const mov = await q1(`select stock_after, created_by from public.stock_movements where product_id=$1`, [novo.id]);
check("movimentação guarda saldo e autor", num(mov.stock_after) === 24 && mov.created_by === estoquista);
await expectError(
  "perda com quantidade positiva é recusada",
  () => as(estoquista, `insert into public.stock_movements (product_id, kind, quantity) values ($1, 'perda', 2)`, [novo.id]),
  "quantidade negativa",
);
await as(estoquista, `insert into public.stock_movements (product_id, kind, quantity, reason) values ($1, 'perda', -2, 'Embalagem violada')`, [
  novo.id,
]);
check("perda baixa o estoque", (await stockOf(novo.id)) === 22);
await expectError(
  "quantidade fracionada em produto por unidade é recusada",
  () => as(estoquista, `insert into public.stock_movements (product_id, kind, quantity) values ($1, 'entrada', 1.5)`, [novo.id]),
  "quantidade inteira",
);
await expectError(
  "estoquista não lança 'venda' manualmente",
  () => as(estoquista, `insert into public.stock_movements (product_id, kind, quantity) values ($1, 'venda', -1)`, [novo.id]),
  "row-level security",
);
await expectError(
  "caixa não lança entrada",
  () => as(caixa, `insert into public.stock_movements (product_id, kind, quantity) values ($1, 'entrada', 5)`, [novo.id]),
  "row-level security",
);
const diff = await one(estoquista, `select public.count_stock($1, 20, 'Inventário mensal') as d`, [novo.id]);
check("inventário lança a diferença (22 → 20 = -2)", num(diff.d) === -2 && (await stockOf(novo.id)) === 20);
await expectError("caixa não faz inventário", () => as(caixa, `select public.count_stock($1, 5)`, [novo.id]), "não pode ajustar");

// ---------------------------------------------------------------------
console.log("\nCaixa (abertura)");
await expectError("vender sem abrir o caixa", () => sell(caixa, [{ product_id: leite, quantity: 1 }], [{ method: "pix", amount: 5.69 }]), "Abra o caixa");
await expectError(
  "pendente não abre caixa",
  () => as(novato, `insert into public.cash_sessions (opening_amount) values (100)`),
  "row-level security",
);
await expectError(
  "estoquista não abre caixa",
  () => as(estoquista, `insert into public.cash_sessions (opening_amount) values (100)`),
  "row-level security",
);
const sessao = (await one(caixa, `insert into public.cash_sessions (opening_amount) values (100) returning id, status`));
check("caixa abre o caixa com troco inicial", sessao.status === "aberto");
await expectError(
  "não abre dois caixas ao mesmo tempo",
  () => as(caixa, `insert into public.cash_sessions (opening_amount) values (50)`),
  "já tem um caixa aberto",
);

// ---------------------------------------------------------------------
console.log("\nVendas no PDV");
const v1 = await sell(
  caixa,
  [
    { product_id: leite, quantity: 2, unit_price: 0.01 }, // preço da tela é ignorado
    { product_id: pao, quantity: 0.5 }, // digitado: 0,5 kg × 16,90
    { product_id: pao, quantity: 0.35, total: 5.92 }, // etiqueta da balança
  ],
  [{ method: "dinheiro", amount: 50 }],
);
const s1 = await q1(`select subtotal, total, change_amount, seller_id, session_id from public.sales where id=$1`, [v1]);
// 2 × 5,69 = 11,38 ; 0,5 × 16,90 = 8,45 ; etiqueta 5,92 → 25,75
check("total usa o preço do cadastro e a etiqueta da balança", num(s1.total) === 25.75, s1.total);
check("troco calculado (50 - 25,75 = 24,25)", num(s1.change_amount) === 24.25, s1.change_amount);
check("venda fica no caixa e no nome do operador", s1.seller_id === caixa && s1.session_id === sessao.id);
check("venda baixa o estoque (leite 48 → 46)", (await stockOf(leite)) === 46);
check("venda por peso baixa o estoque (pão 10 → 9,15)", (await stockOf(pao)) === 9.15);
const it = await q1(`select unit_cost from public.sale_items where sale_id=$1 and product_id=$2`, [v1, leite]);
check("item guarda o custo da época (margem)", num(it.unit_cost) === 3.9);

await expectError(
  "quantidade fracionada em produto por unidade",
  () => sell(caixa, [{ product_id: leite, quantity: 1.5 }], [{ method: "pix", amount: 10 }]),
  "vendido por unidade",
);
await expectError(
  "pagamento insuficiente",
  () => sell(caixa, [{ product_id: cerveja, quantity: 6 }], [{ method: "pix", amount: 20 }]),
  "faltam R$ 5,74",
);
await expectError(
  "cartão não pode passar do total (troco só em dinheiro)",
  () => sell(caixa, [{ product_id: cerveja, quantity: 1 }], [{ method: "debito", amount: 10 }]),
  "troco só em dinheiro",
);
await expectError(
  "venda sem itens",
  () => sell(caixa, [], [{ method: "pix", amount: 1 }]),
  "não tem itens",
);
await expectError(
  "desconto do caixa acima do limite (10%)",
  () => sell(caixa, [{ product_id: cerveja, quantity: 10 }], [{ method: "pix", amount: 30 }], 12.9),
  "limite do caixa",
);
const v2 = await sell(
  caixa,
  [{ product_id: cerveja, quantity: 10 }],
  [
    { method: "pix", amount: 20 },
    { method: "dinheiro", amount: 20 },
  ],
  4.29,
);
const s2 = await q1(`select subtotal, discount, total, change_amount from public.sales where id=$1`, [v2]);
check("desconto dentro do limite + pagamento dividido (pix + dinheiro)", num(s2.total) === 38.61 && num(s2.change_amount) === 1.39, s2);
await expectError(
  "caixa não grava venda direto na tabela",
  () => as(caixa, `insert into public.sales (session_id, seller_id, subtotal, total) values ($1, $2, 1, 1)`, [sessao.id, caixa]),
  "row-level security",
);
await expectError(
  "estoquista não vende",
  () => sell(estoquista, [{ product_id: leite, quantity: 1 }], [{ method: "pix", amount: 6 }]),
  "não pode vender",
);
const vendaInativa = await productId("Sabonete 85g");
await as(admin, `update public.products set active=false where id=$1`, [vendaInativa]);
await expectError(
  "produto desativado não é vendido",
  () => sell(caixa, [{ product_id: vendaInativa, quantity: 1 }], [{ method: "pix", amount: 3 }]),
  "não está disponível",
);

// ---------------------------------------------------------------------
console.log("\nFiado (caderneta)");
const cli = (await one(caixa, `insert into public.customers (name, phone) values ('Dona Maria', '48999990000') returning id`)).id;
await expectError(
  "cliente sem limite não compra fiado",
  () => sell(caixa, [{ product_id: leite, quantity: 2 }], [{ method: "fiado", amount: 11.38 }], 0, cli),
  "Limite de fiado",
);
await expectError(
  "caixa não define limite de fiado",
  () => as(caixa, `update public.customers set credit_limit = 500 where id=$1`, [cli]),
  "Apenas o administrador",
);
await as(admin, `update public.customers set credit_limit = 50 where id=$1`, [cli]);
await expectError(
  "fiado sem escolher o cliente",
  () => sell(caixa, [{ product_id: leite, quantity: 2 }], [{ method: "fiado", amount: 11.38 }]),
  "Escolha o cliente",
);
const v3 = await sell(caixa, [{ product_id: leite, quantity: 5 }], [{ method: "fiado", amount: 28.45 }], 0, cli);
check("venda fiado dentro do limite", Boolean(v3));
const debts = async (u) =>
  num((await one(u, `select debt from public.customer_debts() where customer_id=$1`, [cli])).debt);
check("dívida do cliente = 28,45", (await debts(caixa)) === 28.45);
await expectError(
  "fiado acima do limite (já deve 28,45; limite 50)",
  () => sell(caixa, [{ product_id: leite, quantity: 4 }], [{ method: "fiado", amount: 22.76 }], 0, cli),
  "já deve R$ 28,45",
);
await expectError(
  "pagar mais do que deve",
  () => as(caixa, `insert into public.customer_payments (customer_id, amount, method) values ($1, 30, 'pix')`, [cli]),
  "maior que a dívida",
);
await as(caixa, `insert into public.customer_payments (customer_id, amount, method) values ($1, 10, 'dinheiro')`, [cli]);
check("pagamento abate a dívida (28,45 - 10 = 18,45)", (await debts(caixa)) === 18.45);
check(
  "outro caixa vê o extrato completo do fiado",
  (await as(caixa2, `select * from public.customer_statement($1)`, [cli])).rows.length === 1,
);
await expectError("estoquista não vê o fiado", () => as(estoquista, `select * from public.customer_debts()`), "não acessa o fiado");
await expectError(
  "função interna de dívida não fica exposta",
  () => as(caixa, `select public.customer_debt($1)`, [cli]),
  "permission denied",
);

// ---------------------------------------------------------------------
console.log("\nCaixa (sangria, resumo e fechamento)");
// Dinheiro: 100 abertura + 50 - 24,25 (v1) + 20 - 1,39 (v2) + 10 fiado recebido = 154,36
let resumo = (await one(caixa, `select public.cash_summary($1) as r`, [sessao.id])).r;
check("dinheiro esperado na gaveta = 154,36", num(resumo.expected) === 154.36, resumo.expected);
await expectError(
  "sangria maior que o dinheiro em caixa",
  () => as(caixa, `insert into public.cash_movements (session_id, kind, amount) values ($1, 'sangria', 500)`, [sessao.id]),
  "maior que o dinheiro",
);
await as(caixa, `insert into public.cash_movements (session_id, kind, amount, reason) values ($1, 'sangria', 100, 'Cofre')`, [sessao.id]);
await as(caixa, `insert into public.cash_movements (session_id, kind, amount, reason) values ($1, 'suprimento', 20, 'Moedas')`, [sessao.id]);
resumo = (await one(caixa, `select public.cash_summary($1) as r`, [sessao.id])).r;
check("sangria e suprimento entram no esperado (74,36)", num(resumo.expected) === 74.36, resumo.expected);
check("resumo mostra vendas por forma de pagamento", num(resumo.by_method.pix) === 20 && num(resumo.by_method.fiado) === 28.45, resumo.by_method);
await expectError(
  "outro caixa não vê o resumo deste caixa",
  () => as(caixa2, `select public.cash_summary($1)`, [sessao.id]),
  "Caixa não encontrado",
);
check(
  "outro caixa não vê as vendas deste caixa",
  (await one(caixa2, `select count(*)::int n from public.sales`)).n === 0,
);
check("admin vê todas as vendas", (await one(admin, `select count(*)::int n from public.sales`)).n === 3);
await expectError(
  "outro caixa não lança sangria aqui",
  () => as(caixa2, `insert into public.cash_movements (session_id, kind, amount) values ($1, 'suprimento', 5)`, [sessao.id]),
  "outro operador",
);
const esperado = await one(caixa, `select public.close_cash_session($1, 70, 'Faltou troco') as e`, [sessao.id]);
const fechado = await q1(`select status, expected_amount, counted_amount from public.cash_sessions where id=$1`, [sessao.id]);
check(
  "fechamento guarda esperado (74,36) e contado (70,00)",
  fechado.status === "fechado" && num(esperado.e) === 74.36 && num(fechado.counted_amount) === 70,
  fechado,
);
await expectError(
  "não vende com o caixa fechado",
  () => sell(caixa, [{ product_id: leite, quantity: 1 }], [{ method: "pix", amount: 5.69 }]),
  "Abra o caixa",
);
await expectError(
  "não fecha duas vezes",
  () => as(caixa, `select public.close_cash_session($1, 70)`, [sessao.id]),
  "não está aberto",
);

// ---------------------------------------------------------------------
console.log("\nCancelamento e relatórios");
await expectError("caixa não cancela venda", () => as(caixa, `select public.cancel_sale($1, 'Erro')`, [v2]), "Apenas o administrador");
await expectError("cancelar sem motivo", () => as(admin, `select public.cancel_sale($1, '')`, [v2]), "motivo");
const antes = await stockOf(cerveja);
await as(admin, `select public.cancel_sale($1, 'Cliente desistiu')`, [v2]);
check("cancelamento devolve ao estoque (+10 cervejas)", (await stockOf(cerveja)) === antes + 10);
await expectError("não cancela duas vezes", () => as(admin, `select public.cancel_sale($1, 'De novo')`, [v2]), "já foi cancelada");

const hoje = (await q1(`select to_char(public.today(), 'YYYY-MM-DD') d`)).d;
const rel = (await one(admin, `select public.sales_report($1::date, $1::date) as r`, [hoje])).r;
check("relatório: 2 vendas concluídas e 1 cancelada", num(rel.sales_count) === 2 && num(rel.cancelled) === 1, rel);
check("relatório: faturamento 54,20 (25,75 + 28,45)", num(rel.revenue) === 54.2, rel.revenue);
check("relatório: dinheiro líquido do troco (50 - 24,25)", num(rel.by_method.dinheiro) === 25.75, rel.by_method);
check("relatório: produto mais vendido é o leite", rel.top_products[0]?.name === "Leite integral 1L", rel.top_products[0]);
check("relatório: vendas por hora e por seção", rel.by_hour.length >= 1 && rel.by_category.length >= 2);
await expectError("caixa não vê relatórios", () => as(caixa, `select public.sales_report($1::date, $1::date)`, [hoje]), "Apenas o administrador");

// Estoque baixo: leite tem mínimo 24; 46 - 5 (fiado) = 41
await as(estoquista, `select public.count_stock($1, 10)`, [leite]);
const baixo = (await as(estoquista, `select name from public.low_stock`)).rows.map((r) => r.name);
check("lista de compras mostra o leite abaixo do mínimo", baixo.includes("Leite integral 1L"));
check("produto sem mínimo não aparece na lista de compras", !baixo.includes("Pão francês"));

console.log(`\n${passed} ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);

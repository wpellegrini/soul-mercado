-- =====================================================================
-- Soul Mercado: estrutura do banco de dados (PostgreSQL / Supabase)
-- Gestão de minimercados e padarias: PDV, estoque, caixa e fiado.
-- Execute este arquivo inteiro no SQL Editor do Supabase e, em seguida,
-- o arquivo 0002_fotos.sql (armazenamento das fotos dos produtos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
-- pendente: acabou de se cadastrar e aguarda liberação do administrador
-- caixa: vende no PDV, abre/fecha o próprio caixa, recebe fiado
-- estoque: cadastra produtos, dá entrada de mercadoria, perdas e inventário
-- admin: gerente (tudo, inclusive relatórios, cancelamentos e usuários)
create type public.user_role as enum ('pendente', 'caixa', 'estoque', 'admin');

-- un: vendido por unidade; kg: vendido por peso (pão francês, frios, frutas)
create type public.unit_kind as enum ('un', 'kg');

create type public.payment_method as enum ('dinheiro', 'pix', 'debito', 'credito', 'fiado');

create type public.sale_status as enum ('concluida', 'cancelada');

create type public.movement_kind as enum (
  'entrada',       -- compra / chegada de mercadoria (+)
  'venda',         -- saída pelo PDV (-)
  'cancelamento',  -- venda cancelada: a mercadoria volta (+)
  'ajuste',        -- correção ou inventário (+/-)
  'perda'          -- quebra, vencimento, consumo interno (-)
);

create type public.cash_status as enum ('aberto', 'fechado');

create type public.cash_move_kind as enum (
  'sangria',    -- retirada de dinheiro do caixa
  'suprimento'  -- reforço de troco
);

-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------

-- Perfil de cada usuário (complementa auth.users, que é do Supabase)
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text not null default '',
  role       public.user_role not null default 'pendente',
  created_at timestamptz not null default now()
);

-- Dados da loja (sempre uma única linha)
create table public.settings (
  id                integer primary key default 1 check (id = 1),
  store_name        text not null default 'Meu Mercado' check (char_length(store_name) between 2 and 80),
  business_kind     text not null default 'minimercado' check (business_kind in ('minimercado', 'padaria', 'mercearia', 'emporio')),
  document          text not null default '',  -- CNPJ
  phone             text not null default '',
  address           text not null default '',
  receipt_footer    text not null default 'Obrigado pela preferência! Volte sempre.',
  -- Desconto máximo que o caixa pode dar sozinho (% da venda). Admin não tem limite.
  max_discount_pct  numeric(5, 2) not null default 10 check (max_discount_pct between 0 and 100),
  -- Etiquetas da balança (EAN-13 começando com o prefixo):
  -- prefixo + código do produto (PLU) + valor + dígito verificador
  scale_prefix      text not null default '2' check (scale_prefix ~ '^[0-9]{1,2}$'),
  scale_code_digits integer not null default 4 check (scale_code_digits between 4 and 6),
  scale_value_kind  text not null default 'preco' check (scale_value_kind in ('preco', 'peso'))
);

-- Seções da loja (Padaria, Bebidas, Mercearia...)
create table public.categories (
  id     bigint generated always as identity primary key,
  name   text not null unique check (char_length(name) between 2 and 40),
  emoji  text not null default '🛒' check (char_length(emoji) between 1 and 8),
  sort   integer not null default 0
);

create table public.products (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 2 and 120),
  barcode     text not null default '' check (barcode ~ '^[0-9]{0,14}$'),
  plu         text not null default '' check (plu ~ '^[0-9]{0,6}$'),  -- código curto / da balança
  category_id bigint references public.categories (id) on delete set null,
  unit        public.unit_kind not null default 'un',
  price       numeric(10, 2) not null check (price >= 0),
  cost        numeric(10, 2) not null default 0 check (cost >= 0),
  stock       numeric(12, 3) not null default 0,
  min_stock   numeric(12, 3) not null default 0 check (min_stock >= 0),
  image_path  text not null default '',  -- arquivo no bucket "produtos"
  favorite    boolean not null default false,  -- atalho com foto no PDV
  active      boolean not null default true,
  price_updated_at timestamptz not null default now(),  -- etiquetas: preço mudou
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index products_barcode_key on public.products (barcode) where barcode <> '';
create unique index products_plu_key on public.products (plu) where plu <> '';
create index products_name_idx on public.products (lower(name));

-- Clientes (principalmente para a venda fiado / "na caderneta")
create table public.customers (
  id           bigint generated always as identity primary key,
  name         text not null check (char_length(name) between 3 and 120),
  phone        text not null default '',
  document     text not null default '',
  -- Quanto o cliente pode dever no fiado. 0 = não compra fiado.
  credit_limit numeric(10, 2) not null default 0 check (credit_limit >= 0),
  notes        text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index customers_name_idx on public.customers (lower(name));

-- Abertura e fechamento de caixa (um caixa aberto por operador)
create table public.cash_sessions (
  id              bigint generated always as identity primary key,
  opened_by       uuid not null default auth.uid() references public.profiles (id),
  opened_at       timestamptz not null default now(),
  opening_amount  numeric(10, 2) not null default 0 check (opening_amount >= 0),
  status          public.cash_status not null default 'aberto',
  closed_at       timestamptz,
  closed_by       uuid references public.profiles (id),
  expected_amount numeric(10, 2),  -- dinheiro que deveria haver na gaveta
  counted_amount  numeric(10, 2),  -- dinheiro contado no fechamento
  notes           text not null default ''
);

create unique index cash_sessions_one_open on public.cash_sessions (opened_by) where status = 'aberto';

create table public.cash_movements (
  id         bigint generated always as identity primary key,
  session_id bigint not null references public.cash_sessions (id),
  kind       public.cash_move_kind not null,
  amount     numeric(10, 2) not null check (amount > 0),
  reason     text not null default '',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.sales (
  id            bigint generated always as identity primary key,
  session_id    bigint not null references public.cash_sessions (id),
  seller_id     uuid not null references public.profiles (id),
  customer_id   bigint references public.customers (id),
  subtotal      numeric(10, 2) not null check (subtotal >= 0),
  discount      numeric(10, 2) not null default 0 check (discount >= 0),
  total         numeric(10, 2) not null check (total >= 0),
  change_amount numeric(10, 2) not null default 0 check (change_amount >= 0),  -- troco
  status        public.sale_status not null default 'concluida',
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  cancelled_by  uuid references public.profiles (id),
  cancel_reason text not null default ''
);

create index sales_created_idx on public.sales (created_at);
create index sales_session_idx on public.sales (session_id);
create index sales_customer_idx on public.sales (customer_id);

create table public.sale_items (
  id         bigint generated always as identity primary key,
  sale_id    bigint not null references public.sales (id) on delete cascade,
  product_id bigint not null references public.products (id),
  name       text not null,             -- nome no momento da venda
  unit       public.unit_kind not null,
  quantity   numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  unit_cost  numeric(10, 2) not null default 0,  -- custo no momento (margem)
  total      numeric(10, 2) not null check (total >= 0)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

create table public.sale_payments (
  id      bigint generated always as identity primary key,
  sale_id bigint not null references public.sales (id) on delete cascade,
  method  public.payment_method not null,
  amount  numeric(10, 2) not null check (amount > 0)
);

create index sale_payments_sale_idx on public.sale_payments (sale_id);

-- Histórico de tudo que mexe no estoque
create table public.stock_movements (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products (id) on delete cascade,
  kind        public.movement_kind not null,
  quantity    numeric(12, 3) not null check (quantity <> 0),  -- + entra, - sai
  unit_cost   numeric(10, 2) check (unit_cost >= 0),
  stock_after numeric(12, 3),
  reason      text not null default '',  -- fornecedor/nota, motivo da perda...
  sale_id     bigint references public.sales (id),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_created_idx on public.stock_movements (created_at);

-- Pagamentos de fiado (o cliente quita a caderneta)
create table public.customer_payments (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers (id),
  amount      numeric(10, 2) not null check (amount > 0),
  method      public.payment_method not null check (method <> 'fiado'),
  session_id  bigint references public.cash_sessions (id),
  notes       text not null default '',
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index customer_payments_customer_idx on public.customer_payments (customer_id);

-- ---------------------------------------------------------------------
-- 3. Funções auxiliares
-- ---------------------------------------------------------------------

-- "Hoje" no fuso de Brasília (o servidor do Supabase roda em UTC)
create function public.today()
returns date
language sql stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Valor em reais para mensagens: 1234.5 -> "R$ 1234,50"
create function public.brl(p numeric)
returns text
language sql immutable
as $$
  select 'R$ ' || replace(to_char(round(coalesce(p, 0), 2), 'FM999999990.00'), '.', ',');
$$;

create function public.app_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() <> 'pendente', false);
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

-- Vende no PDV
create function public.can_sell()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() in ('caixa', 'admin'), false);
$$;

-- Mexe no cadastro de produtos e no estoque
create function public.can_stock()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() in ('estoque', 'admin'), false);
$$;

-- Quanto o cliente deve no fiado
create function public.customer_debt(p_customer_id bigint)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((
           select sum(sp.amount)
             from public.sale_payments sp
             join public.sales s on s.id = sp.sale_id
            where s.customer_id = p_customer_id and s.status = 'concluida' and sp.method = 'fiado'
         ), 0)
       - coalesce((select sum(amount) from public.customer_payments where customer_id = p_customer_id), 0);
$$;

-- Dinheiro que deveria estar na gaveta de um caixa
create function public.cash_expected(p_session_id bigint)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select cs.opening_amount
       + coalesce((
           select sum(sp.amount) from public.sale_payments sp
             join public.sales s on s.id = sp.sale_id
            where s.session_id = cs.id and s.status = 'concluida' and sp.method = 'dinheiro'
         ), 0)
       - coalesce((select sum(change_amount) from public.sales where session_id = cs.id and status = 'concluida'), 0)
       + coalesce((select sum(amount) from public.customer_payments where session_id = cs.id and method = 'dinheiro'), 0)
       + coalesce((select sum(amount) from public.cash_movements where session_id = cs.id and kind = 'suprimento'), 0)
       - coalesce((select sum(amount) from public.cash_movements where session_id = cs.id and kind = 'sangria'), 0)
    from public.cash_sessions cs
   where cs.id = p_session_id;
$$;

-- Caixa aberto do usuário logado (nulo se não houver)
create function public.my_open_session()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select id from public.cash_sessions where opened_by = auth.uid() and status = 'aberto';
$$;

-- ---------------------------------------------------------------------
-- 4. Regras automáticas (triggers)
-- ---------------------------------------------------------------------

-- 4.1 Cria o perfil quando alguém se cadastra.
--     O PRIMEIRO usuário vira administrador; os demais aguardam liberação.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    case
      when exists (select 1 from public.profiles where role = 'admin')
        then 'pendente'::public.user_role
      else 'admin'::public.user_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4.2 Só administradores mudam o perfil de acesso; sempre deve existir um admin.
create function public.protect_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;

  if new.role is distinct from old.role then
    -- auth.uid() nulo = alteração feita direto no SQL Editor (permitido)
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Apenas administradores podem alterar o perfil de acesso';
    end if;
    if old.role = 'admin' and not exists (
      select 1 from public.profiles where role = 'admin' and id <> old.id
    ) then
      raise exception 'O sistema precisa de pelo menos um administrador';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

-- 4.3 Produto: o saldo de estoque só muda por movimentação (entrada, venda,
--     perda, ajuste). Na criação, o estoque inicial vira uma movimentação.
create function public.product_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.stock := 0;  -- o estoque inicial entra como movimentação
    new.price_updated_at := now();
  elsif new.price is distinct from old.price then
    new.price_updated_at := now();
  end if;
  if tg_op = 'UPDATE' and new.stock is distinct from old.stock and pg_trigger_depth() = 1 then
    raise exception 'O estoque só muda por entrada, perda ou ajuste (tela Estoque)';
  end if;
  return new;
end;
$$;

create trigger products_before_write
  before insert or update on public.products
  for each row execute function public.product_before_write();

-- 4.4 Movimentação de estoque: confere o sinal, atualiza o saldo do produto
--     e, na entrada com custo, atualiza o custo do produto.
create function public.stock_movement_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_unit public.unit_kind;
  v_stock numeric;
begin
  new.created_at := now();
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  if new.kind in ('entrada', 'cancelamento') and new.quantity <= 0 then
    raise exception 'Entrada precisa de quantidade positiva';
  end if;
  if new.kind in ('venda', 'perda') and new.quantity >= 0 then
    raise exception 'Saída (venda/perda) precisa de quantidade negativa';
  end if;

  select unit into v_unit from public.products where id = new.product_id for update;
  if v_unit is null then
    raise exception 'Produto não encontrado';
  end if;
  if v_unit = 'un' and new.quantity <> trunc(new.quantity) then
    raise exception 'Produto vendido por unidade: use quantidade inteira';
  end if;

  update public.products
     set stock = stock + new.quantity,
         cost = case when new.kind = 'entrada' and new.unit_cost is not null then new.unit_cost else cost end
   where id = new.product_id
   returning stock into v_stock;
  new.stock_after := v_stock;
  return new;
end;
$$;

create trigger stock_movements_before_insert
  before insert on public.stock_movements
  for each row execute function public.stock_movement_before_insert();

-- 4.5 Clientes: só o admin define o limite do fiado
create function public.protect_customer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.credit_limit <> 0 then
      raise exception 'Apenas o administrador define o limite de fiado';
    end if;
    if tg_op = 'UPDATE' and new.credit_limit <> old.credit_limit then
      raise exception 'Apenas o administrador define o limite de fiado';
    end if;
  end if;
  return new;
end;
$$;

create trigger customers_protect
  before insert or update on public.customers
  for each row execute function public.protect_customer();

-- 4.6 Abertura de caixa: sempre "aberto", do próprio usuário
create function public.cash_session_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.opened_by := coalesce(auth.uid(), new.opened_by);
  new.opened_at := now();
  new.status := 'aberto';
  new.closed_at := null;
  new.closed_by := null;
  new.expected_amount := null;
  new.counted_amount := null;
  if exists (select 1 from public.cash_sessions where opened_by = new.opened_by and status = 'aberto') then
    raise exception 'Você já tem um caixa aberto';
  end if;
  return new;
end;
$$;

create trigger cash_sessions_before_insert
  before insert on public.cash_sessions
  for each row execute function public.cash_session_before_insert();

-- 4.7 Sangria/suprimento: só no próprio caixa aberto (admin em qualquer um aberto)
create function public.cash_movement_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  select * into v_session from public.cash_sessions where id = new.session_id;
  if v_session.id is null or v_session.status <> 'aberto' then
    raise exception 'O caixa precisa estar aberto';
  end if;
  if auth.uid() is not null and v_session.opened_by <> auth.uid() and not public.is_admin() then
    raise exception 'Este caixa é de outro operador';
  end if;
  if new.kind = 'sangria' and new.amount > public.cash_expected(new.session_id) then
    raise exception 'Sangria maior que o dinheiro em caixa';
  end if;
  return new;
end;
$$;

create trigger cash_movements_before_insert
  before insert on public.cash_movements
  for each row execute function public.cash_movement_before_insert();

-- 4.8 Pagamento de fiado: não pode passar do que o cliente deve;
--     em dinheiro, entra no caixa aberto de quem recebeu.
create function public.customer_payment_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  new.session_id := public.my_open_session();
  if new.method = 'dinheiro' and new.session_id is null and auth.uid() is not null then
    raise exception 'Abra o caixa para receber em dinheiro';
  end if;
  if new.amount > public.customer_debt(new.customer_id) then
    raise exception 'Valor maior que a dívida do cliente';
  end if;
  return new;
end;
$$;

create trigger customer_payments_before_insert
  before insert on public.customer_payments
  for each row execute function public.customer_payment_before_insert();

-- ---------------------------------------------------------------------
-- 5. Operações do PDV (funções chamadas pelo sistema)
-- ---------------------------------------------------------------------

-- 5.1 Finaliza uma venda de uma vez só (tudo ou nada).
--   p_items:    [{"product_id": 1, "quantity": 2}, {"product_id": 5, "quantity": 0.350, "total": 5.92}]
--               ("total" só vale para produto por kg, vindo da etiqueta da balança)
--   p_payments: [{"method": "dinheiro", "amount": 50}, {"method": "pix", "amount": 10}]
-- Os preços vêm do cadastro, nunca da tela. Retorna o número da venda.
create function public.finalize_sale(
  p_items jsonb,
  p_payments jsonb,
  p_discount numeric default 0,
  p_customer_id bigint default null
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_session bigint;
  v_sale bigint;
  v_item jsonb;
  v_pay jsonb;
  v_product public.products;
  v_qty numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_total numeric;
  v_paid numeric := 0;
  v_cash numeric := 0;
  v_noncash numeric := 0;
  v_fiado numeric := 0;
  v_change numeric;
  v_max_pct numeric;
  v_customer public.customers;
  v_lines jsonb := '[]'::jsonb;
begin
  if not public.can_sell() then
    raise exception 'Seu perfil não pode vender no PDV';
  end if;
  v_session := public.my_open_session();
  if v_session is null then
    raise exception 'Abra o caixa antes de vender';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda não tem itens';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Informe a forma de pagamento';
  end if;

  -- Itens: preço do cadastro
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::bigint;
    if v_product.id is null or not v_product.active then
      raise exception 'Produto % não está disponível', v_item ->> 'product_id';
    end if;
    v_qty := round((v_item ->> 'quantity')::numeric, 3);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida para %', v_product.name;
    end if;
    if v_product.unit = 'un' and v_qty <> trunc(v_qty) then
      raise exception '% é vendido por unidade', v_product.name;
    end if;
    if v_product.unit = 'kg' and (v_item ->> 'total') is not null then
      v_line := round((v_item ->> 'total')::numeric, 2);  -- etiqueta da balança
    else
      v_line := round(v_qty * v_product.price, 2);
    end if;
    if v_line < 0 then
      raise exception 'Valor inválido para %', v_product.name;
    end if;
    v_subtotal := v_subtotal + v_line;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.name, 'unit', v_product.unit,
      'quantity', v_qty, 'unit_price', v_product.price, 'unit_cost', v_product.cost, 'total', v_line
    );
  end loop;

  -- Desconto: o caixa tem limite; o admin não
  v_discount := round(v_discount, 2);
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Desconto inválido';
  end if;
  select max_discount_pct into v_max_pct from public.settings where id = 1;
  if not public.is_admin() and v_discount > round(v_subtotal * coalesce(v_max_pct, 0) / 100, 2) then
    raise exception '%', 'Desconto acima do limite do caixa (' || coalesce(v_max_pct, 0)::text || '% da venda)';
  end if;
  v_total := v_subtotal - v_discount;

  -- Pagamentos: só o dinheiro pode passar do total (gera troco)
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    if (v_pay ->> 'amount')::numeric is null or (v_pay ->> 'amount')::numeric <= 0 then
      raise exception 'Valor de pagamento inválido';
    end if;
    case v_pay ->> 'method'
      when 'dinheiro' then v_cash := v_cash + round((v_pay ->> 'amount')::numeric, 2);
      when 'fiado' then v_fiado := v_fiado + round((v_pay ->> 'amount')::numeric, 2);
      when 'pix', 'debito', 'credito' then v_noncash := v_noncash + round((v_pay ->> 'amount')::numeric, 2);
      else raise exception 'Forma de pagamento inválida';
    end case;
  end loop;
  v_paid := v_cash + v_noncash + v_fiado;
  if v_paid < v_total then
    raise exception 'Pagamento insuficiente: faltam %', public.brl(v_total - v_paid);
  end if;
  if v_noncash + v_fiado > v_total then
    raise exception 'Cartão, Pix e fiado não podem passar do total (troco só em dinheiro)';
  end if;
  v_change := v_paid - v_total;

  -- Fiado: cliente com limite disponível
  if v_fiado > 0 then
    select * into v_customer from public.customers where id = p_customer_id for update;
    if v_customer.id is null or not v_customer.active then
      raise exception 'Escolha o cliente para vender fiado';
    end if;
    if public.customer_debt(v_customer.id) + v_fiado > v_customer.credit_limit then
      raise exception 'Limite de fiado de % excedido (limite %, já deve %)',
        v_customer.name, public.brl(v_customer.credit_limit),
        public.brl(public.customer_debt(v_customer.id));
    end if;
  end if;

  insert into public.sales (session_id, seller_id, customer_id, subtotal, discount, total, change_amount)
  values (v_session, auth.uid(), p_customer_id, v_subtotal, v_discount, v_total, v_change)
  returning id into v_sale;

  insert into public.sale_items (sale_id, product_id, name, unit, quantity, unit_price, unit_cost, total)
  select v_sale, (l ->> 'product_id')::bigint, l ->> 'name', (l ->> 'unit')::public.unit_kind,
         (l ->> 'quantity')::numeric, (l ->> 'unit_price')::numeric, (l ->> 'unit_cost')::numeric,
         (l ->> 'total')::numeric
    from jsonb_array_elements(v_lines) l;

  insert into public.sale_payments (sale_id, method, amount)
  select v_sale, (p ->> 'method')::public.payment_method, round((p ->> 'amount')::numeric, 2)
    from jsonb_array_elements(p_payments) p;

  -- Baixa no estoque (pode ficar negativo: o caixa nunca deixa de vender)
  insert into public.stock_movements (product_id, kind, quantity, sale_id, reason)
  select (l ->> 'product_id')::bigint, 'venda', -(l ->> 'quantity')::numeric, v_sale, 'Venda #' || v_sale
    from jsonb_array_elements(v_lines) l;

  return v_sale;
end;
$$;

-- 5.2 Cancela uma venda (só admin): a mercadoria volta ao estoque
create function public.cancel_sale(p_sale_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador cancela vendas';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento';
  end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Venda não encontrada';
  end if;
  if v_sale.status = 'cancelada' then
    raise exception 'Esta venda já foi cancelada';
  end if;

  update public.sales
     set status = 'cancelada', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_sale_id;

  insert into public.stock_movements (product_id, kind, quantity, sale_id, reason)
  select product_id, 'cancelamento', quantity, p_sale_id, 'Cancelamento da venda #' || p_sale_id
    from public.sale_items where sale_id = p_sale_id;
end;
$$;

-- 5.3 Fecha o caixa: guarda o esperado e o contado
create function public.close_cash_session(p_session_id bigint, p_counted numeric, p_notes text default '')
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_expected numeric;
begin
  select * into v_session from public.cash_sessions where id = p_session_id for update;
  if v_session.id is null or v_session.status <> 'aberto' then
    raise exception 'Este caixa não está aberto';
  end if;
  if v_session.opened_by <> auth.uid() and not public.is_admin() then
    raise exception 'Este caixa é de outro operador';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Informe o dinheiro contado na gaveta';
  end if;
  v_expected := public.cash_expected(p_session_id);
  update public.cash_sessions
     set status = 'fechado', closed_at = now(), closed_by = auth.uid(),
         expected_amount = v_expected, counted_amount = round(p_counted, 2),
         notes = coalesce(p_notes, '')
   where id = p_session_id;
  return v_expected;
end;
$$;

-- 5.4 Inventário: informa a quantidade contada e o sistema lança a diferença
create function public.count_stock(p_product_id bigint, p_counted numeric, p_reason text default 'Inventário')
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_stock numeric;
  v_diff numeric;
begin
  if not public.can_stock() then
    raise exception 'Seu perfil não pode ajustar o estoque';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Quantidade contada inválida';
  end if;
  select stock into v_stock from public.products where id = p_product_id for update;
  if v_stock is null then
    raise exception 'Produto não encontrado';
  end if;
  v_diff := round(p_counted, 3) - v_stock;
  if v_diff <> 0 then
    insert into public.stock_movements (product_id, kind, quantity, reason)
    values (p_product_id, 'ajuste', v_diff, coalesce(nullif(trim(p_reason), ''), 'Inventário'));
  end if;
  return v_diff;
end;
$$;

-- 5.5 Relatório de vendas de um período (só admin)
create function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_end   timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador vê os relatórios';
  end if;

  with s as (
    select * from public.sales
     where status = 'concluida' and created_at >= v_start and created_at < v_end
  ),
  i as (
    select si.*, s.created_at from public.sale_items si join s on s.id = si.sale_id
  )
  select jsonb_build_object(
    'sales_count', (select count(*) from s),
    'gross', (select coalesce(sum(subtotal), 0) from s),
    'discount', (select coalesce(sum(discount), 0) from s),
    'revenue', (select coalesce(sum(total), 0) from s),
    -- custo da mercadoria vendida (rateando o desconto, a margem fica aproximada)
    'cost', (select coalesce(sum(round(quantity * unit_cost, 2)), 0) from i),
    'items', (select coalesce(sum(case when unit = 'un' then quantity else 1 end), 0) from i),
    'cancelled', (
      select count(*) from public.sales
       where status = 'cancelada' and created_at >= v_start and created_at < v_end
    ),
    'by_method', coalesce((
      select jsonb_object_agg(method, amount) from (
        select sp.method,
               sum(sp.amount) - case when sp.method = 'dinheiro' then (select coalesce(sum(change_amount), 0) from s) else 0 end as amount
          from public.sale_payments sp join s on s.id = sp.sale_id
         group by sp.method
      ) m
    ), '{}'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue, 'count', n) order by day) from (
        select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, sum(total) as revenue, count(*) as n
          from s group by 1
      ) d
    ), '[]'::jsonb),
    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'revenue', revenue, 'count', n) order by h) from (
        select extract(hour from created_at at time zone 'America/Sao_Paulo')::int as h, sum(total) as revenue, count(*) as n
          from s group by 1
      ) d
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'revenue', revenue, 'cost', cost) order by revenue desc) from (
        select coalesce(c.name, 'Sem seção') as category, sum(i.total) as revenue, sum(round(i.quantity * i.unit_cost, 2)) as cost
          from i
          left join public.products p on p.id = i.product_id
          left join public.categories c on c.id = p.category_id
         group by 1
      ) d
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', product_id, 'name', name, 'unit', unit,
               'quantity', quantity, 'revenue', revenue, 'cost', cost) order by revenue desc) from (
        select product_id, max(name) as name, max(unit::text) as unit, sum(quantity) as quantity,
               sum(total) as revenue, sum(round(quantity * unit_cost, 2)) as cost
          from i group by product_id
          order by sum(total) desc
          limit 500
      ) d
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- 5.6 Resumo de um caixa (operador dono ou admin)
create function public.cash_summary(p_session_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  select * into v_session from public.cash_sessions where id = p_session_id;
  if v_session.id is null or (v_session.opened_by <> auth.uid() and not public.is_admin()) then
    raise exception 'Caixa não encontrado';
  end if;
  return jsonb_build_object(
    'opening', v_session.opening_amount,
    'sales_count', (select count(*) from public.sales where session_id = p_session_id and status = 'concluida'),
    'sales_total', (select coalesce(sum(total), 0) from public.sales where session_id = p_session_id and status = 'concluida'),
    'change', (select coalesce(sum(change_amount), 0) from public.sales where session_id = p_session_id and status = 'concluida'),
    'by_method', coalesce((
      select jsonb_object_agg(method, amount) from (
        select sp.method, sum(sp.amount) as amount
          from public.sale_payments sp join public.sales s on s.id = sp.sale_id
         where s.session_id = p_session_id and s.status = 'concluida'
         group by sp.method
      ) m
    ), '{}'::jsonb),
    'fiado_received', (select coalesce(sum(amount), 0) from public.customer_payments where session_id = p_session_id and method = 'dinheiro'),
    'suprimentos', (select coalesce(sum(amount), 0) from public.cash_movements where session_id = p_session_id and kind = 'suprimento'),
    'sangrias', (select coalesce(sum(amount), 0) from public.cash_movements where session_id = p_session_id and kind = 'sangria'),
    'expected', public.cash_expected(p_session_id)
  );
end;
$$;

-- 5.7 Dívida de fiado dos clientes (caixa e admin)
create function public.customer_debts()
returns table (customer_id bigint, debt numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_sell() then
    raise exception 'Seu perfil não acessa o fiado';
  end if;
  return query select c.id, public.customer_debt(c.id) from public.customers c;
end;
$$;

-- 5.8 Compras fiado de um cliente (o caixa vê todas, não só as que ele vendeu)
create function public.customer_statement(p_customer_id bigint)
returns table (sale_id bigint, created_at timestamptz, status public.sale_status, amount numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_sell() then
    raise exception 'Seu perfil não acessa o fiado';
  end if;
  return query
    select s.id, s.created_at, s.status, sum(sp.amount)
      from public.sales s
      join public.sale_payments sp on sp.sale_id = s.id
     where s.customer_id = p_customer_id and sp.method = 'fiado'
     group by s.id
     order by s.created_at desc
     limit 200;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Visões
-- ---------------------------------------------------------------------

-- Produtos abaixo do estoque mínimo (lista de compras)
create view public.low_stock
with (security_invoker = true)
as
select p.id, p.name, p.barcode, p.unit, p.stock, p.min_stock, p.cost, p.image_path,
       c.name as category, c.emoji
  from public.products p
  left join public.categories c on c.id = p.category_id
 where p.active and p.stock <= p.min_stock and p.min_stock > 0;

-- ---------------------------------------------------------------------
-- 7. Segurança (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.settings          enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.cash_sessions     enable row level security;
alter table public.cash_movements    enable row level security;
alter table public.sales             enable row level security;
alter table public.sale_items        enable row level security;
alter table public.sale_payments     enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.customer_payments enable row level security;

-- Perfis
create policy "Ver o próprio perfil ou, se funcionário, todos"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active());
create policy "Editar o próprio perfil ou, se admin, qualquer um"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Configurações
create policy "Funcionários veem as configurações"
  on public.settings for select to authenticated using (public.is_active());
create policy "Admin altera as configurações"
  on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seções e produtos: todos veem; estoque e admin cadastram
create policy "Funcionários veem as seções"
  on public.categories for select to authenticated using (public.is_active());
create policy "Estoque gerencia as seções"
  on public.categories for all to authenticated
  using (public.can_stock()) with check (public.can_stock());

create policy "Funcionários veem os produtos"
  on public.products for select to authenticated using (public.is_active());
create policy "Estoque cadastra produtos"
  on public.products for insert to authenticated with check (public.can_stock());
create policy "Estoque altera produtos"
  on public.products for update to authenticated
  using (public.can_stock()) with check (public.can_stock());

-- Clientes: caixa e admin
create policy "Caixa vê os clientes"
  on public.customers for select to authenticated using (public.can_sell());
create policy "Caixa cadastra clientes"
  on public.customers for insert to authenticated with check (public.can_sell());
create policy "Caixa altera clientes"
  on public.customers for update to authenticated
  using (public.can_sell()) with check (public.can_sell());

-- Caixa: cada operador vê o seu; o admin vê todos
create policy "Ver o próprio caixa ou, se admin, todos"
  on public.cash_sessions for select to authenticated
  using (opened_by = auth.uid() or public.is_admin());
create policy "Caixa abre o próprio caixa"
  on public.cash_sessions for insert to authenticated
  with check (public.can_sell() and opened_by = auth.uid());

create policy "Ver sangrias do próprio caixa ou, se admin, todas"
  on public.cash_movements for select to authenticated
  using (created_by = auth.uid() or public.is_admin()
         or exists (select 1 from public.cash_sessions cs where cs.id = session_id and cs.opened_by = auth.uid()));
create policy "Caixa lança sangria e suprimento"
  on public.cash_movements for insert to authenticated with check (public.can_sell());

-- Vendas: gravadas só pela função finalize_sale (sem insert direto)
create policy "Ver as próprias vendas ou, se admin, todas"
  on public.sales for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());
create policy "Ver itens das vendas visíveis"
  on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy "Ver pagamentos das vendas visíveis"
  on public.sale_payments for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));

-- Estoque: entradas, perdas e ajustes manuais (vendas entram pela função)
create policy "Estoque vê as movimentações"
  on public.stock_movements for select to authenticated using (public.can_stock());
create policy "Estoque lança entrada, perda e ajuste"
  on public.stock_movements for insert to authenticated
  with check (public.can_stock() and kind in ('entrada', 'perda', 'ajuste') and sale_id is null);

-- Fiado
create policy "Caixa vê os pagamentos de fiado"
  on public.customer_payments for select to authenticated using (public.can_sell());
create policy "Caixa recebe fiado"
  on public.customer_payments for insert to authenticated with check (public.can_sell());

-- Funções internas: não ficam expostas na API
revoke execute on function public.customer_debt(bigint) from public, anon, authenticated;
revoke execute on function public.cash_expected(bigint) from public, anon, authenticated;
revoke execute on function public.my_open_session() from public, anon;
revoke execute on function public.cash_summary(bigint) from public, anon;
revoke execute on function public.customer_debts() from public, anon;
revoke execute on function public.customer_statement(bigint) from public, anon;
revoke execute on function public.finalize_sale(jsonb, jsonb, numeric, bigint) from public, anon;
revoke execute on function public.cancel_sale(bigint, text) from public, anon;
revoke execute on function public.close_cash_session(bigint, numeric, text) from public, anon;
revoke execute on function public.count_stock(bigint, numeric, text) from public, anon;
revoke execute on function public.sales_report(date, date) from public, anon;

-- ---------------------------------------------------------------------
-- 8. Dados iniciais (exemplos: edite ou desative à vontade)
-- ---------------------------------------------------------------------
insert into public.settings (id) values (1);

insert into public.categories (name, emoji, sort) values
  ('Padaria', '🥖', 1),
  ('Frios e laticínios', '🧀', 2),
  ('Bebidas', '🥤', 3),
  ('Mercearia', '🥫', 4),
  ('Hortifrúti', '🍎', 5),
  ('Limpeza', '🧽', 6),
  ('Higiene', '🧴', 7);

insert into public.products (name, barcode, plu, category_id, unit, price, cost, min_stock, favorite)
select v.name, v.barcode, v.plu, c.id, v.unit::public.unit_kind, v.price, v.cost, v.min_stock, v.favorite
  from (values
    ('Pão francês',              '',              '0001', 'Padaria',            'kg', 16.90, 7.20, 0,  true),
    ('Pão de queijo',            '',              '0002', 'Padaria',            'kg', 42.90, 18.00, 0, true),
    ('Sonho de creme',           '',              '0003', 'Padaria',            'un',  6.50, 2.40, 0,  true),
    ('Bolo de cenoura (fatia)',  '',              '0004', 'Padaria',            'un',  7.90, 2.90, 0,  true),
    ('Café coado (copo)',        '',              '0005', 'Padaria',            'un',  4.50, 1.10, 0,  true),
    ('Presunto fatiado',         '',              '0010', 'Frios e laticínios', 'kg', 39.90, 24.00, 0, true),
    ('Queijo muçarela fatiado',  '',              '0011', 'Frios e laticínios', 'kg', 54.90, 34.00, 0, true),
    ('Leite integral 1L',        '7899123450013', '',     'Frios e laticínios', 'un',  5.49, 3.90, 24, false),
    ('Manteiga 200g',            '7899123450020', '',     'Frios e laticínios', 'un', 12.90, 8.70, 6,  false),
    ('Iogurte natural 170g',     '7899123450037', '',     'Frios e laticínios', 'un',  3.99, 2.30, 12, false),
    ('Refrigerante cola 2L',     '7899123450044', '',     'Bebidas',            'un', 10.99, 7.20, 12, false),
    ('Água mineral 500ml',       '7899123450051', '',     'Bebidas',            'un',  2.99, 1.10, 24, false),
    ('Suco de uva 1L',           '7899123450068', '',     'Bebidas',            'un',  9.90, 6.10, 6,  false),
    ('Cerveja lata 350ml',       '7899123450075', '',     'Bebidas',            'un',  4.29, 2.85, 48, false),
    ('Arroz tipo 1 5kg',         '7899123450082', '',     'Mercearia',          'un', 27.90, 21.50, 10, false),
    ('Feijão carioca 1kg',       '7899123450099', '',     'Mercearia',          'un',  8.49, 6.10, 10, false),
    ('Café torrado 500g',        '7899123450105', '',     'Mercearia',          'un', 19.90, 14.20, 8, false),
    ('Açúcar refinado 1kg',      '7899123450112', '',     'Mercearia',          'un',  4.99, 3.60, 10, false),
    ('Macarrão espaguete 500g',  '7899123450129', '',     'Mercearia',          'un',  4.79, 2.95, 10, false),
    ('Banana prata',             '',              '0020', 'Hortifrúti',         'kg',  6.99, 3.80, 0,  true),
    ('Tomate',                   '',              '0021', 'Hortifrúti',         'kg',  8.99, 5.10, 0,  false),
    ('Detergente 500ml',         '7899123450136', '',     'Limpeza',            'un',  2.79, 1.70, 12, false),
    ('Papel higiênico 12 rolos', '7899123450143', '',     'Higiene',            'un', 21.90, 15.40, 6, false),
    ('Sabonete 85g',             '7899123450150', '',     'Higiene',            'un',  2.49, 1.30, 12, false)
  ) as v(name, barcode, plu, category, unit, price, cost, min_stock, favorite)
  join public.categories c on c.name = v.category;

-- Estoque inicial dos exemplos (vira movimentação "ajuste")
insert into public.stock_movements (product_id, kind, quantity, reason)
select id, 'ajuste', case when unit = 'kg' then 10 else greatest(min_stock * 2, 10) end, 'Estoque inicial (exemplo)'
  from public.products;

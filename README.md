# Soul Mercado

Sistema de gestão para **minimercados, padarias, mercearias e empórios**: frente de caixa (PDV) com foto
dos produtos e leitor de código de barras, controle de estoque, caixa, fiado e relatórios.
Uma solução [Soul Pellegrini](https://soulpellegrini.com.br).

Feito com Next.js 16, React 19, Tailwind CSS 4 e Supabase (PostgreSQL + Auth + Storage).

## O que o sistema faz

**PDV (frente de caixa)**
- Leitor de código de barras USB: bipou, entrou na venda (o leitor "digita" o código e aperta Enter).
- Foto grande do último item bipado e grade de **atalhos com foto** para o que não tem código
  (pão francês, sonho, café, frios), separada por seção, boa para tela de toque.
- **Etiqueta da balança**: lê o código impresso pela balança (Toledo, Filizola, Urano...) com o preço ou o peso.
- Produto por kg sem etiqueta: o caixa digita o peso (`350` = 350 g, `0,350` = 350 g).
- Quantidade rápida: `3*` antes do código. Busca pelo nome, sem acento.
- Desconto em R$ ou %, com limite para o caixa (o gerente não tem limite).
- Pagamento dividido: dinheiro (com troco e notas sugeridas), Pix, débito, crédito e **fiado**.
- Bipe de confirmação e de erro, atalhos de teclado (F2 busca, F4 pagamento, F6 tira o último, F9 cancela).
- Cupom para impressora térmica de 80 mm (comprovante **não fiscal**).

**Caixa**
- Abertura com troco inicial, sangria e suprimento.
- Fechamento com conferência: dinheiro esperado na gaveta × contado, com sobra ou falta.
- Histórico de caixas por operador.

**Estoque**
- Entrada de mercadoria bipando os produtos da nota: quantidade, custo (atualiza a margem) e novo preço.
- Perdas (vencido, quebrado), entrada avulsa e **contagem/inventário** (o sistema lança a diferença).
- Toda venda baixa o estoque; cancelamento devolve. Histórico completo por produto.
- **Lista de compras**: o que está abaixo do mínimo, com quantidade sugerida e custo estimado.
- **Etiquetas de gôndola** com preço e código de barras, para imprimir em A4 (filtro "preço alterado").

**Produtos**
- Foto pelo celular (câmera) ou arquivo, reduzida automaticamente antes do envio.
- Leitura do código de barras pela câmera do celular (Chrome no Android).
- Preço, custo, margem e markup calculados na hora; produto por unidade ou por kg; código da balança (PLU).

**Clientes e fiado**
- Caderneta com limite por cliente (definido pelo gerente), extrato e recebimento.
- Lembrete de cobrança pelo WhatsApp.

**Painel e relatórios (gerente)**
- Vendido hoje, ticket médio, lucro bruto, vendas por hora, formas de pagamento, mais vendidos,
  caixas abertos, estoque baixo/negativo e fiado a receber.
- Relatórios por período: faturamento por dia, por seção (com margem), por produto e por forma de pagamento.
- Exportação em CSV (abre direto no Excel).

## Perfis de acesso

| Perfil | O que faz |
|---|---|
| **Caixa** | PDV, abrir/fechar o próprio caixa, sangria, ver as próprias vendas, clientes e receber fiado |
| **Estoque** | Produtos, fotos, entradas, perdas, inventário, lista de compras e etiquetas |
| **Gerente** | Tudo, inclusive painel, relatórios, cancelar vendas, limite de fiado, configurações e usuários |

As regras ficam **no banco de dados** (Row Level Security e funções), não só na tela:
o preço da venda sempre vem do cadastro, o estoque só muda por movimentação registrada,
uma venda é gravada inteira ou não é gravada, e um caixa não enxerga as vendas do outro.

## Como instalar

### 1. Banco de dados (Supabase)

1. Crie uma conta gratuita em <https://supabase.com> e um novo projeto (região **South America (São Paulo)**).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/migrations/0001_mercado.sql` e clique em **Run**.
   O script já cria 7 seções e 24 produtos de exemplo (pães, frios, bebidas, mercearia...): edite ou desative depois.
3. Em seguida, rode também `supabase/migrations/0002_fotos.sql` (cria o espaço para as fotos dos produtos).
4. Em **Project Settings → API Keys**, copie a **Project URL** e a **Publishable key**.
5. Em **Authentication → URL Configuration**, preencha **Site URL** com o endereço do sistema (no início, `http://localhost:3000`).

### 2. Rodar no computador

Requer Node.js 20 ou mais novo.

```bash
npm install
cp .env.example .env.local   # e preencha com a URL e a chave do passo anterior
npm run dev
```

Abra <http://localhost:3000> e crie sua conta. **O primeiro usuário cadastrado vira gerente (administrador).**
Os próximos ficam aguardando liberação; defina o perfil de cada um em **Administração → Usuários**.

### 3. Publicar (Vercel)

1. Envie o projeto para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório.
3. Em **Environment Variables**, cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Clique em **Deploy**.
5. No Supabase, troque a **Site URL** pelo endereço da Vercel (ex.: `https://mercado.suaempresa.com.br`)
   e adicione-o também em **Redirect URLs**.

### Confirmação de e-mail

Por padrão o Supabase exige que o usuário confirme o e-mail antes de entrar. O link aponta para `/auth/confirm`.
Para testes, dá para desligar em **Authentication → Sign In / Providers → Email → Confirm email**.

## Equipamentos

- **Leitor de código de barras**: qualquer leitor USB ou Bluetooth no modo teclado (padrão de fábrica).
  Deixe o cursor no campo do PDV e bipe.
- **Balança etiquetadora**: configure em **Administração → Loja e balança** o prefixo (normalmente `2`),
  quantos dígitos tem o código do produto (4 a 6) e se a etiqueta traz o **preço** ou o **peso**.
  Cadastre no produto o mesmo código (PLU) usado na balança. Exemplo com prefixo 2, código de 4 dígitos e preço:
  `2 0001 0001690 9` = produto 0001, R$ 16,90.
- **Impressora térmica** (80 mm): o cupom abre já na janela de impressão. No Chrome, dá para imprimir direto
  sem a janela com o atalho `--kiosk-printing`.
- **Celular**: funciona como leitor (câmera) na entrada de mercadoria, no cadastro e no inventário.

## Testes

```bash
npm test          # os dois abaixo
npm run test:db   # 79 regras do banco em um PostgreSQL local (PGlite)
npm run test:lib  # 32 regras do PDV: código de barras, etiqueta da balança, peso, troco
```

O teste do banco cobre permissões de cada perfil, venda (preço do cadastro, troco, desconto, pagamento dividido),
baixa e devolução de estoque, fiado com limite, sangria, fechamento de caixa, cancelamento e relatórios.

## Importante

- O cupom é um **comprovante não fiscal**. Para emitir NFC-e (exigida na maioria dos estados para venda ao consumidor),
  é preciso integrar um emissor fiscal (ex.: Focus NFe, PlugNotas, Nuvem Fiscal) e o certificado digital da loja.
- O estoque pode ficar negativo de propósito: o caixa nunca deixa de vender porque a entrada não foi lançada.
  Produtos com estoque negativo aparecem no painel para correção.

## Próximas ideias

- Emissão de NFC-e integrada.
- Funcionamento offline do PDV (fila de vendas quando a internet cai).
- Integração com maquininha (TEF) e Pix com QR Code dinâmico.
- Validade por lote, com alerta de produtos vencendo.
- Promoções (leve 3 pague 2, preço por horário: pão quentinho, fim de dia).
- Encomendas da padaria (bolos e salgados para festas) com data de retirada.
- Pedidos para fornecedores a partir da lista de compras.

import type { Metadata } from "next";
import { getSettings, requireAdmin } from "@/lib/auth";
import { BUSINESS_KINDS, BUSINESS_LABEL } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { updateSettings } from "../actions";

export const metadata: Metadata = { title: "Loja e balança" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  const example = `${s.scale_prefix}${"0".repeat(s.scale_code_digits - 1)}1`;

  return (
    <ActionForm action={updateSettings} className="max-w-3xl space-y-6">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-stone-900 sm:col-span-2">Dados da loja (aparecem no cupom)</h2>
        <div>
          <label htmlFor="store_name" className="label">
            Nome da loja
          </label>
          <input id="store_name" name="store_name" defaultValue={s.store_name} className="input" required />
        </div>
        <div>
          <label htmlFor="business_kind" className="label">
            Tipo
          </label>
          <select id="business_kind" name="business_kind" defaultValue={s.business_kind} className="input">
            {BUSINESS_KINDS.map((k) => (
              <option key={k} value={k}>
                {BUSINESS_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="document" className="label">
            CNPJ
          </label>
          <input id="document" name="document" defaultValue={s.document} className="input" />
        </div>
        <div>
          <label htmlFor="phone" className="label">
            Telefone
          </label>
          <input id="phone" name="phone" defaultValue={s.phone} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className="label">
            Endereço
          </label>
          <input id="address" name="address" defaultValue={s.address} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="receipt_footer" className="label">
            Mensagem no fim do cupom
          </label>
          <input id="receipt_footer" name="receipt_footer" defaultValue={s.receipt_footer} className="input" />
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-stone-900 sm:col-span-2">Regras do caixa</h2>
        <div>
          <label htmlFor="max_discount_pct" className="label">
            Desconto máximo do caixa (%)
          </label>
          <input id="max_discount_pct" name="max_discount_pct" defaultValue={String(s.max_discount_pct).replace(".", ",")} inputMode="decimal" className="input" />
          <p className="mt-1 text-xs text-stone-500">Acima disso, só o gerente consegue dar desconto.</p>
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <h2 className="text-sm font-semibold text-stone-900">Etiquetas da balança</h2>
          <p className="mt-1 text-xs text-stone-500">
            A balança imprime um código de 13 dígitos: prefixo + código do produto (o PLU do cadastro) + valor + dígito verificador.
            Confira na configuração da sua balança (Toledo, Filizola, Urano...). Exemplo atual: <code>{example}</code> + valor.
          </p>
        </div>
        <div>
          <label htmlFor="scale_prefix" className="label">
            Prefixo
          </label>
          <input id="scale_prefix" name="scale_prefix" defaultValue={s.scale_prefix} className="input" inputMode="numeric" maxLength={2} />
        </div>
        <div>
          <label htmlFor="scale_code_digits" className="label">
            Dígitos do código
          </label>
          <select id="scale_code_digits" name="scale_code_digits" defaultValue={s.scale_code_digits} className="input">
            {[4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="scale_value_kind" className="label">
            A etiqueta traz
          </label>
          <select id="scale_value_kind" name="scale_value_kind" defaultValue={s.scale_value_kind} className="input">
            <option value="preco">o preço total (centavos)</option>
            <option value="peso">o peso (gramas)</option>
          </select>
        </div>
      </section>

      <button className="btn-primary px-6">Salvar configurações</button>
    </ActionForm>
  );
}

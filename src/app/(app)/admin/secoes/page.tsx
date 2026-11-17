import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { loadCategories } from "@/lib/queries";
import ActionForm from "@/components/action-form";
import { createCategory, deleteCategory, updateCategory } from "../actions";

export const metadata: Metadata = { title: "Seções" };

export default async function CategoriesPage() {
  const { supabase } = await requireAdmin();
  const categories = await loadCategories(supabase);

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-stone-500">
        As seções organizam os produtos e viram abas na grade de fotos do PDV. O emoji aparece quando o produto não tem foto.
      </p>
      <div className="card divide-y divide-stone-100">
        {categories.map((c) => (
          <div key={c.id} className="flex flex-wrap items-start gap-2 px-4 py-3">
            <ActionForm action={updateCategory} className="flex flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="emoji" defaultValue={c.emoji} className="input w-16 text-center text-lg" aria-label="Emoji" maxLength={8} />
              <input name="name" defaultValue={c.name} className="input min-w-40 flex-1" aria-label="Nome da seção" required />
              <input name="sort" defaultValue={c.sort} type="number" className="input w-20" aria-label="Ordem" title="Ordem nas abas do PDV" />
              <button className="btn-secondary">Salvar</button>
            </ActionForm>
            <ActionForm action={deleteCategory}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-danger" title="Os produtos ficam sem seção">
                Apagar
              </button>
            </ActionForm>
          </div>
        ))}
      </div>
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-stone-900">Nova seção</h2>
        <ActionForm action={createCategory} className="flex flex-wrap items-center gap-2">
          <input name="emoji" defaultValue="🛒" className="input w-16 text-center text-lg" aria-label="Emoji" maxLength={8} />
          <input name="name" className="input min-w-40 flex-1" placeholder="ex.: Confeitaria" aria-label="Nome da seção" required />
          <input name="sort" defaultValue={categories.length + 1} type="number" className="input w-20" aria-label="Ordem" />
          <button className="btn-primary">Criar</button>
        </ActionForm>
      </section>
    </div>
  );
}

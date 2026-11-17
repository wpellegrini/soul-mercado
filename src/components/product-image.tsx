import { imageUrl } from "@/lib/types";

/** Foto do produto ou, sem foto, o emoji da seção sobre um fundo neutro. */
export default function ProductImage({
  path,
  emoji,
  name,
  className = "h-12 w-12",
  rounded = "rounded-md",
}: {
  path: string | null | undefined;
  emoji?: string | null;
  name: string;
  className?: string;
  rounded?: string;
}) {
  const url = imageUrl(path);
  if (url) {
    return (
      // Fotos já chegam reduzidas (webp, até 600 px), sem precisar do otimizador do Next
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} loading="lazy" className={`${className} ${rounded} bg-white object-cover`} />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${className} ${rounded} flex shrink-0 items-center justify-center bg-stone-100 text-[length:inherit]`}
    >
      <span className="text-[1.6em] leading-none">{emoji || "🛒"}</span>
    </div>
  );
}

import { ean13Bits } from "@/lib/barcode";

/** Código de barras EAN-13 em SVG (para etiquetas). Outros formatos mostram só os números. */
export default function BarcodeSvg({ code, height = 40 }: { code: string; height?: number }) {
  const bits = ean13Bits(code);
  if (!bits) return <div className="font-mono text-xs tracking-widest">{code}</div>;
  const quiet = 9;
  const width = bits.length + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 10}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Código de barras ${code}`}
      shapeRendering="crispEdges"
    >
      <rect width={width} height={height + 10} fill="#fff" />
      {bits.split("").map((b, i) =>
        b === "1" ? <rect key={i} x={quiet + i} y={0} width={1} height={height} fill="#000" /> : null,
      )}
      <text x={width / 2} y={height + 9} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#000">
        {code}
      </text>
    </svg>
  );
}

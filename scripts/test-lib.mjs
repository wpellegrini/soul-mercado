// Testa as regras do PDV que rodam no navegador (código de barras, balança, peso, troco).
// Uso: npm run test:lib   (Node 22.18+ executa TypeScript direto)
import { registerHooks } from "node:module";

// Os imports do projeto não têm extensão ("./types"): completa com ".ts"
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});

const { eanCheckDigit, isValidEan, parseScaleBarcode, ean13Bits } = await import("../src/lib/barcode.ts");
const { parseInput, resolveCode, lineTotal, parseWeight, cashSuggestions, searchProducts } = await import("../src/lib/pdv.ts");

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FALHOU  ${name}${detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
  }
}

const scale = { scale_prefix: "2", scale_code_digits: 4, scale_value_kind: "preco" };
const products = [
  { id: 1, name: "Leite integral 1L", barcode: "7899123450013", plu: "", unit: "un", price: 5.49 },
  { id: 2, name: "Pão francês", barcode: "", plu: "0001", unit: "kg", price: 16.9 },
  { id: 3, name: "Pão de queijo", barcode: "", plu: "0002", unit: "kg", price: 42.9 },
  { id: 4, name: "Sonho de creme", barcode: "", plu: "0003", unit: "un", price: 6.5 },
];

console.log("Código de barras");
check("dígito verificador EAN-13", eanCheckDigit("789912345001") === "3");
check("EAN-13 válido", isValidEan("7899123450013"));
check("EAN-13 com dígito errado é inválido", !isValidEan("7899123450014"));
check("EAN-8 válido", isValidEan("96385074"));
check("desenho do EAN-13 tem 95 módulos", ean13Bits("7899123450013")?.length === 95);
check("desenho recusa código inválido", ean13Bits("123") === null);

console.log("\nEtiqueta da balança");
const label = parseScaleBarcode("2000100016909", scale);
check("lê produto e preço (0001, R$ 16,90)", label?.plu === "0001" && label?.total === 16.9, label);
check("etiqueta com dígito errado é ignorada", parseScaleBarcode("2000100016900", scale) === null);
const byWeight = parseScaleBarcode("2000100003503", { ...scale, scale_value_kind: "peso" });
check("modo peso: 350 g", byWeight?.weight === 0.35, byWeight);
check("5 dígitos de código", parseScaleBarcode("2000010016907", { ...scale, scale_code_digits: 5 })?.plu === "00001");

console.log("\nLeitura no PDV");
check("multiplicador 3*código", parseInput("3*7899123450013").multiplier === 3);
check("multiplicador com x", parseInput("2x 7899123450013").multiplier === 2);
check("peso no multiplicador 0,350*0001", parseInput("0,350*0001").multiplier === 0.35);
check("sem multiplicador", parseInput("7899123450013").multiplier === null);

let r = resolveCode("7899123450013", products, scale);
check("código de barras exato → 1 un", r.kind === "product" && r.product.id === 1 && r.quantity === 1);
r = resolveCode("3*7899123450013", products, scale);
check("3*código → 3 un", r.kind === "product" && r.quantity === 3);
r = resolveCode("2000100016909", products, scale);
check("etiqueta → pão, total da etiqueta", r.kind === "product" && r.product.id === 2 && r.labelTotal === 16.9 && r.quantity === 1, r);
r = resolveCode("1", products, scale);
check("PLU digitado (1 = 0001) em kg pede o peso", r.kind === "product" && r.product.id === 2 && r.quantity === null);
r = resolveCode("0,250*1", products, scale);
check("peso*PLU já informa o peso", r.kind === "product" && r.quantity === 0.25);
r = resolveCode("3", products, scale);
check("PLU de item por unidade → 1 un", r.kind === "product" && r.product.id === 4 && r.quantity === 1);
r = resolveCode("pao", products, scale);
check("nome sem acento acha os dois pães", r.kind === "search" && r.results.length === 2);
r = resolveCode("pao fran", products, scale);
check("nome com uma única resposta adiciona direto", r.kind === "product" && r.product.id === 2);
r = resolveCode("7890000000000", products, scale);
check("código desconhecido", r.kind === "notfound");
check("busca por várias palavras", searchProducts("leite 1l", products).length === 1);

console.log("\nValores");
check("linha por unidade: 3 × 5,49 = 16,47", lineTotal("un", 5.49, 3, null) === 16.47);
check("linha por peso: 0,355 kg × 16,90 = 6,00", lineTotal("kg", 16.9, 0.355, null) === 6);
check("linha com etiqueta usa o total da etiqueta", lineTotal("kg", 16.9, 0.35, 5.92) === 5.92);
check("peso 350 → 0,350 kg", parseWeight("350") === 0.35);
check("peso 0,350 → 0,350 kg", parseWeight("0,350") === 0.35);
check("peso 1 → 1 kg", parseWeight("1") === 1);
check("peso 1,2 → 1,2 kg", parseWeight("1,2") === 1.2);
const sug = cashSuggestions(23.75);
check("troco rápido: exato, 24, 25, 30, 40", JSON.stringify(sug) === JSON.stringify([23.75, 24, 25, 30, 40]), sug);

console.log(`\n${passed} ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);

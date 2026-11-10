export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
  image: string;
};
export type Connection = { url: string; version: string };
export type Snapshot = { products: Product[]; version: string };
export const DEFAULT_SHEETS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxi6cSpbXtnLBpkPpxtO5S5yxkGKQ7tNNuD5Z9mXTFD-7LRftixceESDq6Bs2R9P7s/exec";
export const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1JwcHRNFWoUCCq1ywVQQL9_qnZTZtykHDgzio8S9NxKM/edit";
export function validProducts(data: unknown): data is Product[] {
  return (
    Array.isArray(data) &&
    data.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.sku === "string" &&
        typeof p.category === "string" &&
        Number.isFinite(p.price) &&
        p.price >= 0 &&
        Number.isInteger(p.stock) &&
        p.stock >= 0 &&
        typeof p.active === "boolean" &&
        typeof p.image === "string" &&
        (!p.image ||
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)),
    )
  );
}
export async function sheetsRequest(
  connection: Pick<Connection, "url">,
  action: "read" | "write",
  version?: string,
  products?: Product[],
): Promise<Snapshot> {
  const url = new URL(connection.url);
  if (
    url.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error(
      "Usá la URL de implementación de Apps Script terminada en /exec.",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action,
        version,
        products,
      }),
      signal: controller.signal,
      credentials: "omit",
      redirect: "follow",
    });
    if (!response.ok) throw Error("Google Sheets no respondió correctamente.");
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error(
        "La implementación no devuelve JSON. Revisá que permita acceso a cualquier persona y usá la URL /exec.",
      );
    }
    if (!data.ok) {
      if (
        typeof data.error === "string" &&
        /CATALOG_PASSWORD|Clave del catálogo/.test(data.error)
      )
        throw Error(
          "Falta actualizar la implementación de Apps Script a la versión sin contraseña. Abrí la guía de Google Sheets del repositorio para completar ese paso.",
        );
      throw Error(data.error || "No se pudo sincronizar.");
    }
    if (!validProducts(data.products) || typeof data.version !== "string")
      throw Error("Google Sheets devolvió datos inválidos.");
    return { products: data.products, version: data.version };
  } catch (e) {
    if (e instanceof TypeError || e instanceof DOMException)
      throw Error(
        "No se pudo confirmar la conexión. Revisá Internet y la implementación; actualizá desde Sheets antes de reintentar una escritura.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

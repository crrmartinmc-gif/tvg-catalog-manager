import { SaleError, validSale, type Sale } from "./sales-model";
export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  description?: string;
  color?: string;
  size?: string;
  productType?: string;
  price: number;
  cost?: number;
  stock: number;
  active: boolean;
  image: string;
};
export type Connection = {
  url: string;
  version: string;
  supportsCost?: boolean;
  supportsSales?: boolean;
};
export type Snapshot = {
  products: Product[];
  version: string;
  supportsCost: boolean;
  supportsSales: boolean;
  sales: Sale[];
};
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
        ["description", "color", "size", "productType"].every(
          (key) =>
            p[key] === undefined ||
            (typeof p[key] === "string" &&
              p[key].length <= (key === "description" ? 2000 : 80)),
        ) &&
        (p.cost === undefined ||
          (typeof p.cost === "number" &&
            Number.isFinite(p.cost) &&
            p.cost >= 0 &&
            Number.isSafeInteger(Math.round(p.cost * 100)) &&
            Math.round(p.cost * 100) / 100 === p.cost)) &&
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
  connection: Pick<Connection, "url" | "supportsCost">,
  action: "read" | "write",
  version?: string,
  products?: Product[],
): Promise<Snapshot> {
  const hasCosts = products?.some((p) => p.cost !== undefined);
  if (action === "write" && hasCosts && !connection.supportsCost)
    throw Error(
      "Para guardar precios de costo, actualizá Código.gs y publicá una nueva versión de la implementación. Los cambios del formulario se conservaron.",
    );
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
    if (![2, 3, 4].includes(data.schema))
      throw Error(
        "Actualizá el Código.gs y su implementación a la versión con descripción, color, talle y tipo antes de continuar.",
      );
    if (!validProducts(data.products) || typeof data.version !== "string")
      throw Error("Google Sheets devolvió datos inválidos.");
    if (action === "write" && hasCosts && data.schema < 3)
      throw Error(
        "La implementación de Sheets no confirmó los costos. Actualizá Código.gs y volvé a leer el catálogo antes de continuar.",
      );
    return {
      products: data.products,
      version: data.version,
      supportsCost: data.schema >= 3,
      supportsSales: data.schema === 4,
      sales:
        data.schema === 4 &&
        Array.isArray(data.sales) &&
        data.sales.every(validSale)
          ? data.sales
          : [],
    };
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

export async function submitSale(
  connection: Connection,
  request: import("./sales-model").SaleRequest,
): Promise<{ snapshot: Snapshot; sale: import("./sales-model").Sale }> {
  if (!connection.supportsSales)
    throw new SaleError(
      "Para confirmar ventas, actualizá Código.gs y su implementación. El carrito se conserva.",
      false,
    );
  const url = new URL(connection.url);
  if (
    url.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)
  )
    throw new SaleError("URL de Google Sheets inválida.", false);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
      body: JSON.stringify({ ...request, action: "sale" }),
    });
    if (!response.ok)
      throw new SaleError(
        "No se pudo confirmar la venta. Reintentá la confirmación para consultar la misma operación.",
        true,
      );
    const data = await response.json();
    if (!data.ok)
      throw new SaleError(
        data.error || "No se pudo confirmar la venta.",
        !["REJECTED", "CONFLICT"].includes(data.code),
      );
    if (
      data.schema !== 4 ||
      !validProducts(data.products) ||
      typeof data.version !== "string" ||
      !validSale(data.sale) ||
      !Array.isArray(data.sales) ||
      !data.sales.every(validSale)
    )
      throw new SaleError(
        "La respuesta de venta no se pudo verificar. Reintentá la confirmación de la misma operación.",
        true,
      );
    return {
      sale: data.sale,
      snapshot: {
        products: data.products,
        version: data.version,
        supportsCost: true,
        supportsSales: true,
        sales: data.sales,
      },
    };
  } catch (e) {
    if (e instanceof SaleError) throw e;
    throw new SaleError(
      "No se recibió confirmación. La venta podría haberse guardado: reintentá la misma operación para evitar duplicarla.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

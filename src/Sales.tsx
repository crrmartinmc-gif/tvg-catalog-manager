import { useState, useRef, useEffect, lazy, Suspense } from "react";
import {
  ShoppingCart,
  ScanLine,
  Trash2,
  Plus,
  Minus,
  Receipt,
  RefreshCw,
} from "lucide-react";
import type { Connection, Product } from "./sheets";
import {
  paymentMethods,
  SaleError,
  type PaymentMethod,
  type Sale,
  type SaleLine,
  type SaleRequest,
} from "./sales-model";
import { SaleReceipt } from "./SaleReceipt";
const ScanProduct = lazy(() =>
  import("./ScanProduct").then((m) => ({ default: m.ScanProduct })),
);
const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    n,
  );
const PENDING_KEY = "tvg.sale.pending.v1";
type Pending = { request: SaleRequest; lines: SaleLine[] };
export function getPendingSale(): Pending | null {
  try {
    const data = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    if (
      !data ||
      !data.request ||
      typeof data.request.id !== "string" ||
      typeof data.request.version !== "string" ||
      !Array.isArray(data.request.items) ||
      !Array.isArray(data.lines) ||
      !/^[a-f0-9-]{36}$/i.test(data.request.id) ||
      !Number.isSafeInteger(data.request.expectedTotal) ||
      data.request.expectedTotal < 0 ||
      typeof data.request.customer !== "string" ||
      typeof data.request.document !== "string" ||
      !paymentMethods.includes(data.request.paymentMethod) ||
      !data.request.items.length ||
      !data.request.items.every(
        (i: { productId?: unknown; quantity?: unknown }) =>
          typeof i.productId === "string" &&
          typeof i.quantity === "number" &&
          Number.isSafeInteger(i.quantity) &&
          i.quantity > 0,
      ) ||
      data.lines.length !== data.request.items.length ||
      !data.lines.every(
        (i: SaleLine) =>
          i &&
          typeof i.name === "string" &&
          typeof i.sku === "string" &&
          typeof i.variant === "string" &&
          Number.isFinite(i.unitPrice) &&
          Number.isFinite(i.total) &&
          Number.isSafeInteger(i.quantity),
      )
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
type Props = {
  products: Product[];
  sales: Sale[];
  connection: Connection | null;
  busy: boolean;
  onConfirm: (request: SaleRequest) => Promise<Sale>;
  onRefresh: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
};
export function Sales({
  products,
  sales,
  connection,
  busy,
  onConfirm,
  onRefresh,
  onPendingChange,
}: Props) {
  const [restored] = useState(getPendingSale);
  const [cart, setCart] = useState<{ productId: string; quantity: number }[]>(
    restored?.request.items ?? [],
  );
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState(restored?.request.customer ?? "");
  const [customerDocument, setCustomerDocument] = useState(
    restored?.request.document ?? "",
  );
  const [method, setMethod] = useState<PaymentMethod>(
    restored?.request.paymentMethod ?? "Efectivo",
  );
  const [cash, setCash] = useState(
    restored?.request.cashReceived === undefined
      ? ""
      : String(restored.request.cashReceived),
  );
  const [pending, setPending] = useState<Pending | null>(restored);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [scanning, setScanning] = useState(false);
  const inflight = useRef(false);
  useEffect(() => onPendingChange(!!pending), [pending, onPendingChange]);
  const locked = !!pending || sending;
  const available = products.filter(
    (p) =>
      p.active &&
      p.stock > 0 &&
      [p.name, p.sku, p.color, p.size, p.productType]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const lines: SaleLine[] =
    pending?.lines ??
    cart.map((c) => {
      const p = products.find((p) => p.id === c.productId);
      const cents = Math.round((p?.price ?? 0) * 100);
      return {
        productId: c.productId,
        sku: p?.sku ?? "",
        name: p?.name ?? "Producto no disponible",
        variant: [p?.color, p?.size && `Talle ${p.size}`]
          .filter(Boolean)
          .join(" · "),
        quantity: c.quantity,
        unitPrice: cents / 100,
        total: (cents * c.quantity) / 100,
      };
    });
  const totalCents =
    pending?.request.expectedTotal ??
    lines.reduce((n, i) => n + Math.round(i.unitPrice * 100) * i.quantity, 0);
  const shortage =
    !pending &&
    cart.some((c) => {
      const p = products.find((p) => p.id === c.productId);
      return (
        !p ||
        !p.active ||
        c.quantity > p.stock ||
        !Number.isSafeInteger(c.quantity) ||
        c.quantity < 1
      );
    });
  function add(p: Product): true | string {
    if (locked || busy) return "Esperá a que termine la confirmación.";
    const current = cart.find((c) => c.productId === p.id);
    if (!p.active || p.stock < 1)
      return "Ese producto no tiene stock disponible.";
    if ((current?.quantity ?? 0) >= p.stock)
      return "Ya agregaste todas las unidades disponibles de ese producto.";
    if (!current && cart.length >= 50)
      return "El comprobante admite hasta 50 productos diferentes.";
    setCart((prev) =>
      current
        ? prev.map((c) =>
            c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c,
          )
        : [...prev, { productId: p.id, quantity: 1 }],
    );
    setError("");
    return true;
  }
  function quantity(id: string, next: number) {
    if (locked) return;
    const p = products.find((p) => p.id === id);
    if (!p || !Number.isSafeInteger(next) || next < 1 || next > p.stock) {
      setError("La cantidad debe ser un entero entre 1 y el stock disponible.");
      return;
    }
    setCart((prev) =>
      prev.map((c) => (c.productId === id ? { ...c, quantity: next } : c)),
    );
    setError("");
  }
  async function confirmSale() {
    if (inflight.current || busy) return;
    if (!pending && (shortage || !cart.length)) {
      setError("Revisá los productos y las cantidades antes de confirmar.");
      return;
    }
    if (!connection?.supportsSales) {
      setError(
        "Actualizá Código.gs y su implementación para confirmar ventas. El carrito se conserva.",
      );
      return;
    }
    if (
      !pending &&
      cash !== "" &&
      method === "Efectivo" &&
      (!Number.isFinite(Number(cash)) ||
        Math.round(Number(cash) * 100) / 100 !== Number(cash) ||
        Number(cash) * 100 < totalCents)
    ) {
      setError(
        "El efectivo recibido debe cubrir el total y tener hasta dos decimales.",
      );
      return;
    }
    const attempt = pending ?? {
      request: {
        id: crypto.randomUUID(),
        version: connection.version,
        items: cart,
        customer: customer.trim(),
        document: customerDocument.trim(),
        paymentMethod: method,
        cashReceived:
          method === "Efectivo" && cash !== "" ? Number(cash) : undefined,
        expectedTotal: totalCents,
      },
      lines,
    };
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(attempt));
    } catch {
      setError(
        "El navegador no permite conservar la confirmación. Habilitá el almacenamiento para registrar la venta sin riesgo de duplicarla.",
      );
      return;
    }
    inflight.current = true;
    setPending(attempt);
    setSending(true);
    setError("");
    try {
      const saved = await onConfirm(attempt.request);
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {
        /* Replaying this ID remains safe if storage removal is unavailable. */
      }
      setPending(null);
      setCart([]);
      setCustomer("");
      setCustomerDocument("");
      setCash("");
      setReceipt(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar.");
      if (e instanceof SaleError && !e.uncertain) {
        try {
          localStorage.removeItem(PENDING_KEY);
        } catch {
          /* Retaining the rejected ID is safer than losing an uncertain operation. */
        }
        setPending(null);
      }
    } finally {
      inflight.current = false;
      setSending(false);
    }
  }
  return (
    <section className="sales-page">
      <div className="heading">
        <div>
          <div className="eyebrow">TU NEGOCIO, EN MOVIMIENTO</div>
          <h1>Vender</h1>
          <p>Armá la venta, registrá el pago y entregá el comprobante.</p>
        </div>
        <button disabled={busy || locked} onClick={() => void onRefresh()}>
          <RefreshCw size={16} />
          Actualizar catálogo
        </button>
      </div>
      {!connection?.supportsSales && (
        <div className="sale-info">
          Para registrar ventas y descontar stock, actualizá el{" "}
          <a
            href="https://github.com/crrmartinmc-gif/tvg-catalog-manager/tree/main/integrations/google-sheets"
            target="_blank"
            rel="noreferrer"
          >
            script de Google Sheets
          </a>
          . Podés preparar el carrito mientras tanto.
        </div>
      )}
      {pending && (
        <div className="sale-info" role="status">
          Hay una confirmación pendiente por{" "}
          {money(pending.request.expectedTotal / 100)}. Reintentá esta misma
          operación; no se volverá a descontar el stock si ya fue registrada.
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="sale-layout">
        <div className="panel sale-products">
          <div className="paneltitle">
            <h2>Elegir productos</h2>
            <button
              disabled={locked || busy || !connection}
              onClick={() => setScanning(true)}
            >
              <ScanLine size={16} />
              Escanear para vender
            </button>
          </div>
          <label className="sale-search">
            Buscar producto o SKU
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, código, color o talle"
            />
          </label>
          <div className="sale-product-list">
            {!available.length ? (
              <p className="sale-empty">
                No hay productos disponibles para esta búsqueda.
              </p>
            ) : (
              available.slice(0, 100).map((p) => (
                <article className="sale-product" key={p.id}>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {p.sku} ·{" "}
                      {[p.color, p.size && `Talle ${p.size}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    <small>{p.stock} unidades disponibles</small>
                  </div>
                  <strong>{money(p.price)}</strong>
                  <button
                    aria-label={"Agregar " + p.name}
                    disabled={locked || busy}
                    onClick={() => {
                      const outcome = add(p);
                      if (outcome !== true) setError(outcome);
                    }}
                  >
                    <Plus size={17} />
                  </button>
                </article>
              ))
            )}
          </div>
          {available.length > 100 && (
            <p className="sale-empty">
              Mostrando los primeros 100 productos. Refiná la búsqueda.
            </p>
          )}
        </div>
        <div className="panel sale-checkout">
          <div className="paneltitle">
            <h2>
              <ShoppingCart size={17} />
              Venta actual
            </h2>
          </div>
          {!lines.length ? (
            <p className="sale-empty">Agregá un producto para comenzar.</p>
          ) : (
            <div className="cart-lines">
              {lines.map((i) => (
                <article key={i.productId}>
                  <div className="cart-line-title">
                    <div>
                      <b>{i.name}</b>
                      <small>
                        {i.sku}
                        {i.variant && ` · ${i.variant}`}
                      </small>
                    </div>
                    <button
                      disabled={locked}
                      aria-label={"Quitar " + i.name}
                      onClick={() => {
                        setCart(
                          cart.filter((c) => c.productId !== i.productId),
                        );
                        setError("");
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="cart-line-bottom">
                    <div className="quantity-controls">
                      <button
                        disabled={locked || i.quantity <= 1}
                        aria-label={"Restar " + i.name}
                        onClick={() => quantity(i.productId, i.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        aria-label={"Cantidad de " + i.name}
                        type="number"
                        min={1}
                        step={1}
                        value={i.quantity}
                        disabled={locked}
                        onChange={(e) =>
                          quantity(i.productId, e.target.valueAsNumber)
                        }
                      />
                      <button
                        disabled={locked}
                        aria-label={"Sumar " + i.name}
                        onClick={() => quantity(i.productId, i.quantity + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span>{money(i.unitPrice)} c/u</span>
                    <strong>{money(i.total)}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
          {shortage && (
            <div className="error">
              Hay productos sin stock suficiente o que dejaron de estar
              disponibles. Revisá las cantidades.
            </div>
          )}
          <div className="sale-fields">
            <label>
              Cliente (opcional)
              <input
                maxLength={120}
                disabled={locked}
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Consumidor final"
              />
            </label>
            <label>
              DNI / documento (opcional)
              <input
                maxLength={40}
                disabled={locked}
                value={customerDocument}
                onChange={(e) => setCustomerDocument(e.target.value)}
              />
            </label>
            <label>
              Medio de pago
              <select
                value={method}
                disabled={locked}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {paymentMethods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {method === "Efectivo" && (
              <label>
                Efectivo recibido (ARS, opcional)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={locked}
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                />
              </label>
            )}
            {method === "Efectivo" &&
              cash !== "" &&
              Number(cash) * 100 >= totalCents && (
                <p>
                  Vuelto:{" "}
                  {money((Math.round(Number(cash) * 100) - totalCents) / 100)}
                </p>
              )}
          </div>
          <div className="sale-total">
            <span>Total</span>
            <strong>{money(totalCents / 100)}</strong>
          </div>
          <p className="receipt-note">
            Comprobante interno imprimible. No es una factura fiscal de ARCA.
          </p>
          <button
            className="primary confirm-sale"
            disabled={
              busy ||
              sending ||
              !connection?.supportsSales ||
              (!pending && (!cart.length || shortage))
            }
            onClick={() => void confirmSale()}
          >
            <Receipt size={17} />
            {sending
              ? "Confirmando…"
              : pending
                ? "Reintentar confirmación"
                : "Confirmar venta y emitir comprobante"}
          </button>
        </div>
      </div>
      <div className="panel sale-history">
        <div className="paneltitle">
          <h2>Últimas ventas</h2>
          <small>Hasta 100 operaciones recientes</small>
        </div>
        {!sales.length ? (
          <p className="sale-empty">Todavía no hay ventas registradas.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>COMPROBANTE</th>
                  <th>FECHA</th>
                  <th>CLIENTE</th>
                  <th>PAGO</th>
                  <th>TOTAL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.number}</td>
                    <td>
                      {new Intl.DateTimeFormat("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "America/Argentina/Buenos_Aires",
                      }).format(new Date(s.createdAt))}
                    </td>
                    <td>{s.customer}</td>
                    <td>{s.paymentMethod}</td>
                    <td>{money(s.total)}</td>
                    <td>
                      <button
                        aria-label={"Ver comprobante " + s.number}
                        onClick={() => setReceipt(s)}
                      >
                        Ver / imprimir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {receipt && (
        <SaleReceipt sale={receipt} onClose={() => setReceipt(null)} />
      )}
      <Suspense
        fallback={
          <div className="overlay">
            <div className="barcode-dialog">Cargando escáner…</div>
          </div>
        }
      >
        {scanning && (
          <ScanProduct
            mode="sale"
            onClose={() => setScanning(false)}
            onFind={(code) => {
              const p = products.find(
                (p) => p.sku.toLowerCase() === code.toLowerCase(),
              );
              if (!p)
                return "Ese código no corresponde a un producto del catálogo.";
              const result = add(p);
              if (result === true) setScanning(false);
              return result;
            }}
          />
        )}
      </Suspense>
    </section>
  );
}

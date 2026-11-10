import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Package,
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  X,
  LayoutDashboard,
  Boxes,
  ScanLine,
  Barcode,
} from "lucide-react";
import "./style.css";
import tvgLogo from "./assets/logo-tvg.png";
const BarcodeLabel = lazy(() =>
  import("./BarcodeLabel").then((m) => ({ default: m.BarcodeLabel })),
);
const ScanProduct = lazy(() =>
  import("./ScanProduct").then((m) => ({ default: m.ScanProduct })),
);
import {
  DEFAULT_SHEETS_ENDPOINT,
  sheetsRequest,
  type Product,
  type Connection,
} from "./sheets";

const empty = (): Product => ({
  id: crypto.randomUUID(),
  name: "",
  sku:
    "TVG-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
  category: "General",
  description: "",
  color: "",
  size: "",
  productType: "",
  price: 0,
  stock: 0,
  active: true,
  image: "",
});
const money = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(n);
function App() {
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState<false | "lookup" | "capture">(false);
  const [label, setLabel] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Product | null>(null);
  const [view, setView] = useState("catalog");
  const [notice, setNotice] = useState("");
  const [upload, setUpload] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const pending = useRef(false);
  const interactionOpen = useRef(false);
  interactionOpen.current = !!draft || !!scanning || !!label;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  async function refresh() {
    if (pending.current || interactionOpen.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const data = await sheetsRequest(
        { url: DEFAULT_SHEETS_ENDPOINT },
        "read",
      );
      setProducts(data.products);
      setConnection({
        url: DEFAULT_SHEETS_ENDPOINT,
        version: data.version,
        supportsCost: data.supportsCost,
      });
      setSyncError(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  refreshRef.current = refresh;
  useEffect(() => {
    const update = () => {
      if (!document.hidden) void refreshRef.current();
    };
    update();
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  async function persist(next: Product[]) {
    if (pending.current || busy || syncError || !connection) return false;
    if (!connection.supportsCost && next.some((p) => p.cost !== undefined)) {
      setError(
        "Para guardar precios de costo, actualizá Código.gs y publicá una nueva versión de la implementación. Los cambios del formulario se conservaron.",
      );
      return false;
    }
    pending.current = true;
    setBusy(true);
    try {
      const data = await sheetsRequest(
        connection,
        "write",
        connection.version,
        next,
      );
      setProducts(data.products);
      setConnection({
        ...connection,
        version: data.version,
        supportsCost: data.supportsCost,
      });
      setError("");
      return true;
    } catch (e) {
      if (connection) setSyncError(true);
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Revisá el espacio disponible.",
      );
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function remove(p: Product) {
    if (
      confirm(
        "¿Eliminar “" + p.name + "”? Esta acción no se puede deshacer.",
      ) &&
      (await persist(products.filter((x) => x.id !== p.id)))
    )
      setNotice("Producto eliminado.");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (
      !draft.name.trim() ||
      !draft.sku.trim() ||
      !draft.category.trim() ||
      (draft.cost !== undefined &&
        (!Number.isFinite(draft.cost) ||
          draft.cost < 0 ||
          !Number.isSafeInteger(Math.round(draft.cost * 100)))) ||
      !Number.isFinite(draft.price) ||
      draft.price < 0 ||
      (draft.cost !== undefined &&
        Math.round(draft.cost * 100) / 100 !== draft.cost) ||
      !Number.isInteger(draft.stock) ||
      draft.stock < 0
    ) {
      setError("Completá los campos con valores válidos.");
      return;
    }
    if (!/^[\x20-\x7e]+$/.test(draft.sku.trim())) {
      setError(
        "Usá un SKU con letras sin acentos, números o guiones para generar su código de barras.",
      );
      return;
    }
    if (
      products.some(
        (p) =>
          p.id !== draft.id &&
          p.sku.toLowerCase() === draft.sku.trim().toLowerCase(),
      )
    ) {
      setError("Ya existe un producto con ese SKU.");
      return;
    }
    const p = {
      ...draft,
      name: draft.name.trim(),
      sku: draft.sku.trim(),
      category: draft.category.trim(),
      description: (draft.description || " ").trim(),
      color: (draft.color || " ").trim(),
      size: (draft.size || " ").trim(),
      productType: (draft.productType || " ").trim(),
    };
    if (
      await persist(
        products.some((x) => x.id === p.id)
          ? products.map((x) => (x.id === p.id ? p : x))
          : [...products, p],
      )
    ) {
      const isNew = !products.some((x) => x.id === p.id);
      setDraft(null);
      if (isNew) setLabel(p);
      setNotice("Producto guardado correctamente.");
    }
  }
  async function image(file?: File) {
    if (!file || !draft) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Elegí una imagen JPG, PNG o WebP de hasta 2 MB.");
      return;
    }
    setUpload(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(Error("No se pudo leer la imagen."));
        r.readAsDataURL(file);
      });
      setDraft((d) => (d ? { ...d, image: data } : d));
    } catch {
      setError("No se pudo cargar la imagen.");
    } finally {
      setUpload(false);
    }
  }
  const filtered = products.filter(
    (p) =>
      [p.name, p.sku, p.description, p.color, p.size, p.productType]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!category || p.category === category) &&
      (!status ||
        (status === "active"
          ? p.active
          : status === "inactive"
            ? !p.active
            : p.stock <= 5)),
  );
  const missingCosts = products.filter(
    (p) => p.stock > 0 && p.cost === undefined,
  ).length;
  function csv() {
    const cell = (v: string | number) =>
      '"' +
      String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const data = [
      [
        "Nombre",
        "SKU",
        "Categoría",
        "Descripción",
        "Color",
        "Talle",
        "Tipo",
        "Precio de venta ARS",
        "Costo unitario ARS",
        "Stock",
        "Estado",
      ],
      ...filtered.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.description || "",
        p.color || "",
        p.size || "",
        p.productType || "",
        p.price,
        p.cost ?? "",
        p.stock,
        p.active ? "Activo" : "Inactivo",
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + data], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogo-tvg.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Catálogo exportado.");
  }
  return (
    <div className="layout">
      <aside>
        <a
          className="brand"
          href="#"
          aria-label="Te Va a Gustar Lencería — inicio"
        >
          <img
            src={tvgLogo}
            alt="TVG — Te Va a Gustar Lencería"
            width={1138}
            height={648}
          />
        </a>
        <div className="workspace">
          <span className="avatar">TVG</span>
          <div>
            Te Va a Gustar<small>Lencería · Catálogo</small>
          </div>
        </div>
        <div className="navlabel">PRINCIPAL</div>
        <button
          className={view === "dashboard" ? "nav selected" : "nav"}
          onClick={() => setView("dashboard")}
        >
          <LayoutDashboard size={19} />
          Resumen
        </button>
        <button
          className={view === "catalog" ? "nav selected" : "nav"}
          onClick={() => setView("catalog")}
        >
          <Boxes size={19} />
          Catálogo <span className="count">{products.length}</span>
        </button>
        <div className="local">
          <i />{" "}
          {connection
            ? "Conectado a Google Sheets"
            : "Conectando a Google Sheets"}
          <small>
            {connection ? "Catálogo compartido" : "Sincronización automática"}
          </small>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Mi negocio <b>/</b> {view === "catalog" ? "Catálogo" : "Resumen"}
          </span>
          <a
            className="header-brand"
            href="#"
            aria-label="Te Va a Gustar Lencería — inicio"
          >
            <img
              src={tvgLogo}
              alt="TVG — Te Va a Gustar Lencería"
              width={1138}
              height={648}
            />
          </a>
        </header>
        <section>
          <div className="syncbar">
            <span>
              {busy
                ? "Sincronizando…"
                : connection
                  ? "Google Sheets · actualización automática cada 1 minuto"
                  : "Esperando conexión con Google Sheets"}
            </span>
            <button disabled={busy || !!draft} onClick={() => void refresh()}>
              Actualizar ahora
            </button>
          </div>
          {syncError && (
            <div className="error" role="alert">
              La última escritura no se pudo confirmar. Cerrá el formulario y
              actualizá desde Sheets antes de seguir editando.
            </div>
          )}
          <div className="heading">
            <div>
              <div className="eyebrow">TU NEGOCIO, EN ORDEN</div>
              <h1>
                {view === "catalog"
                  ? "Catálogo de productos"
                  : "Resumen del negocio"}
              </h1>
              <p>Todo lo que vendés, en un solo lugar.</p>
            </div>
            <div className="heading-actions">
              <button
                disabled={!connection || busy || syncError}
                onClick={() => setScanning("lookup")}
              >
                <ScanLine size={18} />
                Escanear producto
              </button>
              <button
                className="primary"
                disabled={busy || syncError || !connection}
                onClick={() => {
                  setError("");
                  setDraft(empty());
                }}
              >
                <Plus size={18} />
                Nuevo producto
              </button>
            </div>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stats">
            <article>
              <span>
                Productos en catálogo
                <Package size={18} />
              </span>
              <strong>{products.length}</strong>
              <small>Tu inventario completo</small>
            </article>
            <article>
              <span>
                Productos activos
                <i className="green" />
              </span>
              <strong>{products.filter((p) => p.active).length}</strong>
              <small>Disponibles para vender</small>
            </article>
            <article>
              <span>
                Stock bajo
                <i className="orange" />
              </span>
              <strong>{products.filter((p) => p.stock <= 5).length}</strong>
              <small>Con 5 unidades o menos</small>
            </article>
            <article>
              <span>
                Valor del inventario<span>$</span>
              </span>
              <strong className="value">
                {money(products.reduce((n, p) => n + p.stock * p.price, 0))}
              </strong>
              <small>A precio de venta</small>
            </article>
            <article className="cost-total">
              <span>
                Costo total del inventario<span>$</span>
              </span>
              <strong className="value">
                {money(
                  products.reduce(
                    (total, p) =>
                      total + Math.round((p.cost ?? 0) * 100) * p.stock,
                    0,
                  ) / 100,
                )}
              </strong>
              <small>
                {connection && !connection.supportsCost
                  ? "Actualizá GS para guardar costos"
                  : `${missingCosts} ${missingCosts === 1 ? "producto" : "productos"} en stock sin costo cargado`}
              </small>
              <small>Costo unitario × unidades en stock</small>
            </article>
          </div>
          <div className="panel">
            <div className="paneltitle">
              <h2>
                {view === "catalog"
                  ? "Todos los productos"
                  : "Inventario actual"}{" "}
                <span>{products.length}</span>
              </h2>
              <button onClick={csv}>
                <Download size={16} />
                Exportar CSV
              </button>
            </div>
            <div className="filters">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Buscar productos"
                  placeholder="Buscar por nombre, SKU, color, talle o tipo…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Categoría"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Todas las categorías</option>
                {[...new Set(products.map((p) => p.category))]
                  .sort()
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
              <select
                aria-label="Estado"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="low">Stock bajo</option>
              </select>
            </div>
            {filtered.length ? (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>PRODUCTO</th>
                      <th>CATEGORÍA</th>
                      <th>PRECIO DE VENTA</th>
                      <th>COSTO UNITARIO</th>
                      <th>STOCK</th>
                      <th>ESTADO</th>
                      <th>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="product">
                            {p.image ? (
                              <img src={p.image} alt="" />
                            ) : (
                              <span className="placeholder">
                                <Package size={23} />
                              </span>
                            )}
                            <div>
                              <b>{p.name}</b>
                              <small>{p.sku}</small>
                              {(p.color || p.size || p.productType) && (
                                <small className="attributes">
                                  {[
                                    p.productType,
                                    p.color,
                                    p.size && `Talle ${p.size}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              )}
                              {p.description && (
                                <small className="description">
                                  {p.description}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td className="price">{money(p.price)}</td>
                        <td className="price">
                          {p.cost === undefined ? (
                            <span className="cost-missing">Sin cargar</span>
                          ) : (
                            money(p.cost)
                          )}
                        </td>
                        <td>
                          <span
                            className={p.stock <= 5 ? "stock low" : "stock"}
                          >
                            {p.stock} unidades
                          </span>
                        </td>
                        <td>
                          <span
                            className={p.active ? "badge" : "badge inactive"}
                          >
                            {p.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              aria-label={"Código de barras de " + p.name}
                              onClick={() => setLabel(p)}
                            >
                              <Barcode size={18} />
                            </button>
                            <button
                              aria-label={"Editar " + p.name}
                              disabled={busy || syncError || !connection}
                              onClick={() => {
                                setError("");
                                setDraft({ ...p });
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              aria-label={"Eliminar " + p.name}
                              disabled={busy || syncError || !connection}
                              onClick={() => void remove(p)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span>
                  <Package size={36} />
                </span>
                <h3>
                  {products.length
                    ? "No encontramos productos"
                    : "Tu catálogo empieza acá"}
                </h3>
                <p>
                  {products.length
                    ? "Probá otra búsqueda o cambiá los filtros."
                    : "Agregá tu primer producto y empezá a organizar tu negocio."}
                </p>
                <button
                  disabled={busy || syncError || !connection}
                  onClick={() => {
                    if (products.length) {
                      setQuery("");
                      setCategory("");
                      setStatus("");
                    } else setDraft(empty());
                  }}
                >
                  {products.length
                    ? "Limpiar filtros"
                    : "+ Agregar mi primer producto"}
                </button>
              </div>
            )}
            <footer>
              {filtered.length} de {products.length} productos{" "}
              <span>
                {connection ? "Datos en Google Sheets" : "Esperando conexión"}
              </span>
            </footer>
          </div>
          <div className="footnote">
            TVG Catalog Manager <span>Hecho para acompañar tu negocio.</span>
          </div>
        </section>
      </main>
      {draft && (
        <div
          className="overlay"
          style={scanning === "capture" ? { display: "none" } : undefined}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setDraft(null);
              setError("");
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onSubmit={save}
          >
            <div className="modalhead">
              <h2 id="modal-title">
                {products.some((p) => p.id === draft.id)
                  ? "Editar producto"
                  : "Nuevo producto"}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  if (!syncError) setError("");
                }}
              >
                <X />
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <label>
              Nombre
              <input
                autoFocus
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <p className="sku-help">
              El SKU se genera automáticamente. Si el producto ya tiene un
              código de barras, escanealo para usarlo como SKU. También podés
              personalizarlo.
            </p>
            <button
              type="button"
              className="capture-barcode"
              disabled={busy || upload}
              onClick={() => setScanning("capture")}
            >
              <ScanLine size={17} />
              Escanear código de barras
            </button>
            <div className="formrow">
              <label>
                SKU
                <input
                  required
                  maxLength={60}
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                />
              </label>
              <label>
                Categoría
                <input
                  required
                  maxLength={60}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Descripción
              <textarea
                aria-label="Descripción"
                maxLength={2000}
                rows={3}
                placeholder="Material, características, cuidados y otros detalles…"
                value={draft.description || ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <div className="formrow">
              <label>
                Color
                <input
                  maxLength={80}
                  placeholder="Ej.: Negro, blanco, estampado"
                  value={draft.color || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value })
                  }
                />
              </label>
              <label>
                Talle / medida
                <input
                  maxLength={80}
                  placeholder="Ej.: M, 42, 20 × 30 cm"
                  value={draft.size || ""}
                  onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                />
              </label>
            </div>
            <label>
              Tipo de producto
              <input
                maxLength={80}
                placeholder="Ej.: Remera, pantalón, accesorio"
                value={draft.productType || ""}
                onChange={(e) =>
                  setDraft({ ...draft, productType: e.target.value })
                }
              />
            </label>
            <label>
              Precio de costo (ARS)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Costo por unidad"
                value={draft.cost ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost:
                      e.target.value === ""
                        ? undefined
                        : e.target.valueAsNumber,
                  })
                }
              />
            </label>
            {connection && !connection.supportsCost && (
              <p className="cost-help">
                Para guardar costos, primero actualizá el{" "}
                <a
                  href="https://github.com/crrmartinmc-gif/tvg-catalog-manager/tree/main/integrations/google-sheets"
                  target="_blank"
                  rel="noreferrer"
                >
                  script de Google Sheets
                </a>
                . Podés seguir usando el catálogo sin costo cargado.
              </p>
            )}
            <div className="formrow">
              <label>
                Precio de venta (ARS)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price}
                  onChange={(e) =>
                    setDraft({ ...draft, price: e.target.valueAsNumber })
                  }
                />
              </label>
              <label>
                Stock
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={draft.stock}
                  onChange={(e) =>
                    setDraft({ ...draft, stock: e.target.valueAsNumber })
                  }
                />
              </label>
            </div>
            <label>
              Imagen · JPG, PNG o WebP, hasta 2 MB
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void image(e.target.files?.[0])}
              />
            </label>
            {draft.image && (
              <div className="imagepreview">
                <img src={draft.image} alt="Vista previa" />
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, image: "" })}
                >
                  Quitar imagen
                </button>
              </div>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Producto activo
            </label>
            <div className="modalbuttons">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  if (!syncError) setError("");
                }}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={upload || busy || syncError || !connection}
                type="submit"
              >
                {busy
                  ? "Guardando…"
                  : upload
                    ? "Cargando imagen…"
                    : "Guardar producto"}
              </button>
            </div>
          </form>
        </div>
      )}
      <Suspense
        fallback={
          <div className="overlay">
            <div className="barcode-dialog" role="status">
              Cargando…
            </div>
          </div>
        }
      >
        {label && (
          <BarcodeLabel product={label} onClose={() => setLabel(null)} />
        )}
        {scanning && (
          <ScanProduct
            mode={scanning === "capture" ? "capture" : "lookup"}
            onClose={() => setScanning(false)}
            onFind={(code) => {
              if (scanning === "capture") {
                if (!draft) return "Abrí primero el formulario de producto.";
                if (code.length > 60 || !/^[\x20-\x7e]+$/.test(code))
                  return "El código debe tener hasta 60 caracteres: letras sin acentos, números o símbolos simples.";
                if (
                  products.some(
                    (p) =>
                      p.id !== draft.id &&
                      p.sku.toLowerCase() === code.toLowerCase(),
                  )
                )
                  return "Ese código ya está asignado a otro producto. Cada producto debe tener un SKU diferente.";
                setDraft((current) =>
                  current ? { ...current, sku: code } : current,
                );
                setScanning(false);
                setError("");
                setNotice(
                  "Código copiado al SKU. Completá los datos y guardá el producto.",
                );
                return true;
              }
              const found = products.find(
                (p) => p.sku.toLowerCase() === code.toLowerCase(),
              );
              if (!found) return false;
              setScanning(false);
              setQuery("");
              setCategory("");
              setStatus("");
              setError("");
              setDraft({ ...found });
              setNotice("Producto identificado: " + found.name);
              return true;
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

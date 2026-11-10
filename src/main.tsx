import React, { useState } from "react";
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
} from "lucide-react";
import "./style.css";
import { SheetConnection } from "./SheetConnection";
import {
  sheetsRequest,
  validProducts,
  type Product,
  type Connection,
} from "./sheets";

const KEY = "tvg.catalog.v1";
function read(): Product[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!validProducts(data)) throw Error("Datos inválidos");
  return data;
}
const empty = (): Product => ({
  id: crypto.randomUUID(),
  name: "",
  sku: "",
  category: "General",
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
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      return read();
    } catch {
      return [];
    }
  });
  const [storageBroken] = useState(() => {
    try {
      read();
      return false;
    } catch {
      return true;
    }
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Product | null>(null);
  const [view, setView] = useState("catalog");
  const [notice, setNotice] = useState("");
  const [upload, setUpload] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [endpoint] = useState(() => {
    try {
      return localStorage.getItem("tvg.sheets.url") || "";
    } catch {
      return "";
    }
  });
  async function connect(url: string, password: string) {
    setBusy(true);
    try {
      const data = await sheetsRequest({ url, password }, "read");
      setConnection({ url, password, version: data.version });
      setProducts(data.products);
      setSyncError(false);
      setError("");
      setSettings(false);
      setNotice("Conectado. Se cargó el catálogo de Google Sheets.");
      try {
        localStorage.setItem("tvg.sheets.url", url);
      } catch {
        /* Connection still works without local preferences. */
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!connection || busy) return;
    setBusy(true);
    try {
      const data = await sheetsRequest(connection, "read");
      setProducts(data.products);
      setConnection({ ...connection, version: data.version });
      setSyncError(false);
      setError("");
      setNotice("Catálogo actualizado desde Google Sheets.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  }
  async function persist(next: Product[]) {
    if (busy || syncError) return false;
    setBusy(true);
    try {
      if (connection) {
        const data = await sheetsRequest(
          connection,
          "write",
          connection.version,
          next,
        );
        setProducts(data.products);
        setConnection({ ...connection, version: data.version });
      } else {
        if (storageBroken)
          throw Error(
            "El almacenamiento contiene datos que no se pudieron leer. Respaldalos antes de restablecerlo.",
          );
        localStorage.setItem(KEY, JSON.stringify(next));
        setProducts(next);
      }
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
      !Number.isFinite(draft.price) ||
      draft.price < 0 ||
      !Number.isInteger(draft.stock) ||
      draft.stock < 0
    ) {
      setError("Completá los campos con valores válidos.");
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
    };
    if (
      await persist(
        products.some((x) => x.id === p.id)
          ? products.map((x) => (x.id === p.id ? p : x))
          : [...products, p],
      )
    ) {
      setDraft(null);
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
      (p.name + " " + p.sku).toLowerCase().includes(query.toLowerCase()) &&
      (!category || p.category === category) &&
      (!status ||
        (status === "active"
          ? p.active
          : status === "inactive"
            ? !p.active
            : p.stock <= 5)),
  );
  function csv() {
    const cell = (v: string | number) =>
      '"' +
      String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const data = [
      ["Nombre", "SKU", "Categoría", "Precio ARS", "Stock", "Estado"],
      ...filtered.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.price,
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
        <a className="brand" href="#">
          <span>
            tvg<span className="dot">.</span>
          </span>
          <small>CATALOG MANAGER</small>
        </a>
        <div className="workspace">
          <span className="avatar">TV</span>
          <div>
            Mi negocio<small>Espacio de trabajo</small>
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
            : "Guardado en este dispositivo"}
          <small>
            {connection
              ? "Catálogo compartido"
              : "Tus productos, siempre a mano."}
          </small>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Mi negocio <b>/</b> {view === "catalog" ? "Catálogo" : "Resumen"}
          </span>
          <span className="avatar">TV</span>
        </header>
        <section>
          <div className="syncbar">
            <span>
              {connection ? "Google Sheets conectado" : "Catálogo local"}
            </span>
            <div>
              {connection && (
                <button
                  disabled={busy || !!draft}
                  onClick={() => void refresh()}
                >
                  {busy ? "Sincronizando…" : "Actualizar desde Sheets"}
                </button>
              )}
              <button
                disabled={busy || !!draft}
                onClick={() => setSettings(true)}
              >
                {connection ? "Configurar conexión" : "Conectar Google Sheets"}
              </button>
            </div>
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
            <button
              className="primary"
              disabled={busy || syncError}
              onClick={() => {
                setError("");
                setDraft(empty());
              }}
            >
              <Plus size={18} />
              Nuevo producto
            </button>
          </div>
          {storageBroken && (
            <div role="alert" className="error">
              No se pudieron leer los datos guardados. Se conservaron sin
              cambios. Revisá el almacenamiento del navegador antes de
              continuar.
            </div>
          )}
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
                  placeholder="Buscar por nombre o SKU…"
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
                      <th>PRECIO</th>
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
                            </div>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td className="price">{money(p.price)}</td>
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
                              aria-label={"Editar " + p.name}
                              disabled={busy || syncError}
                              onClick={() => {
                                setError("");
                                setDraft({ ...p });
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              aria-label={"Eliminar " + p.name}
                              disabled={busy || syncError}
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
                {connection
                  ? "Datos en Google Sheets"
                  : "Datos almacenados localmente"}
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
            <div className="formrow">
              <label>
                Precio (ARS)
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
                disabled={upload || busy || syncError}
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
      {settings && (
        <SheetConnection
          busy={busy}
          connected={!!connection}
          initialUrl={connection?.url || endpoint}
          onConnect={connect}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

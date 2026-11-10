import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { X, Download, Printer } from "lucide-react";
import type { Product } from "./sheets";
export function BarcodeLabel({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      if (!/^[\x20-\x7e]+$/.test(product.sku))
        throw Error(
          "Para generar una etiqueta, usá un SKU con letras sin acentos, números y guiones.",
        );
      JsBarcode(svg.current, product.sku, {
        format: "CODE128",
        width: 2,
        height: 70,
        displayValue: true,
        fontSize: 16,
        margin: 20,
        background: "#ffffff",
        lineColor: "#000000",
      });
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo generar el código.",
      );
    }
  }, [product.sku]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  function download() {
    if (!svg.current || error) return;
    const copy = svg.current.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = URL.createObjectURL(
      new Blob([copy.outerHTML], { type: "image/svg+xml;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `codigo-${product.sku.replace(/[^a-zA-Z0-9_-]/g, "_")}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="overlay">
      <div
        className="barcode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-title"
      >
        <div className="modalhead">
          <h2 id="barcode-title">Código de barras del producto</h2>
          <button aria-label="Cerrar etiqueta" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="print-label">
          <h3>{product.name}</h3>
          <p>
            {[product.color, product.size && `Talle ${product.size}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {!error && (
            <svg
              ref={svg}
              aria-label={`Código de barras ${product.sku}`}
              role="img"
            />
          )}
        </div>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : (
          <p>
            Imprimí esta etiqueta y pegala en el producto. El código identifica
            su SKU: si lo cambiás, necesitás una etiqueta nueva.
          </p>
        )}
        <div className="modalbuttons">
          <button disabled={!!error} onClick={download}>
            <Download size={16} />
            Descargar etiqueta
          </button>
          <button
            className="primary"
            disabled={!!error}
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import logo from "./assets/logo-tvg.png";
import type { Sale } from "./sales-model";
const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    n,
  );
export function SaleReceipt({
  sale,
  onClose,
}: {
  sale: Sale;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return createPortal(
    <div className="overlay receipt-overlay">
      <div
        className="receipt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <div className="receipt-toolbar">
          <h2 id="receipt-title">Comprobante de venta</h2>
          <button onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir / PDF
          </button>
          <button aria-label="Cerrar comprobante" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="receipt-print">
          <div className="receipt-brand">
            <img src={logo} alt="TVG — Te Va a Gustar Lencería" />
            <div>
              <h2>Comprobante de venta</h2>
              <div className="receipt-reference">
                <strong>{sale.number}</strong>
                <p>
                  {new Intl.DateTimeFormat("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Argentina/Buenos_Aires",
                  }).format(new Date(sale.createdAt))}
                </p>
              </div>
            </div>
          </div>
          <p className="internal-receipt">
            Documento interno · No válido como factura fiscal
          </p>
          <dl className="receipt-customer">
            <div>
              <dt>Cliente</dt>
              <dd>{sale.customer}</dd>
            </div>
            {sale.document && (
              <div>
                <dt>Documento</dt>
                <dd>{sale.document}</dd>
              </div>
            )}
            <div>
              <dt>Medio de pago</dt>
              <dd>{sale.paymentMethod}</dd>
            </div>
          </dl>
          <table className="receipt-items">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio unit.</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((i) => (
                <tr key={i.productId}>
                  <td>
                    <b>{i.name}</b>
                    <small>
                      {i.sku}
                      {i.variant && ` · ${i.variant}`}
                    </small>
                  </td>
                  <td>{i.quantity}</td>
                  <td>{money(i.unitPrice)}</td>
                  <td>{money(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-total">
            Total<strong>{money(sale.total)}</strong>
          </div>
          {sale.cashReceived !== undefined && (
            <div className="cash-details">
              <p>Recibido: {money(sale.cashReceived)}</p>
              <p>Vuelto: {money(sale.change ?? 0)}</p>
            </div>
          )}
          <p className="receipt-thanks">Gracias por elegir Te Va a Gustar.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

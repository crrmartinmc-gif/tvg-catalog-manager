import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Product } from "./sheets";
export function PhotoViewer({
  product,
  onClose,
}: {
  product: Pick<Product, "name" | "sku" | "image" | "color" | "size">;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const target = dialog.current;
    if (!target) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    target.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (target.open) target.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-labelledby="photo-viewer-title"
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < box.left ||
          e.clientX > box.right ||
          e.clientY < box.top ||
          e.clientY > box.bottom
        )
          close.current();
      }}
    >
      <div className="photo-viewer-heading">
        <h2 id="photo-viewer-title">{product.name || "Foto del producto"}</h2>
        <button
          type="button"
          autoFocus
          aria-label="Cerrar foto ampliada"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      {failed ? (
        <p role="alert" className="error">
          No se pudo cargar la foto del producto.
        </p>
      ) : (
        <img
          className="photo-viewer-image"
          src={product.image}
          alt={`Foto ampliada de ${product.name || "producto"}`}
          onError={() => setFailed(true)}
        />
      )}
      <p className="photo-viewer-caption">
        {[product.sku, product.color, product.size && `Talle ${product.size}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

export function ProductCamera({ onCapture, onClose }: {
  onCapture: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const target = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    target?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      target?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let owned: MediaStream | undefined;
    setReady(false);
    setError("");
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("La cámara no está disponible. Abrí la app con HTTPS en un navegador compatible.");
        owned = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        });
        if (cancelled) { owned.getTracks().forEach(t => t.stop()); return; }
        stream.current = owned;
        const target = video.current;
        if (target) {
          target.srcObject = owned;
          await target.play();
          if (!cancelled) setReady(target.videoWidth > 0 && target.videoHeight > 0);
        }
      } catch (e) {
        owned?.getTracks().forEach(t => t.stop());
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        setError(name === "NotAllowedError"
          ? "Permití el acceso a la cámara en el navegador y volvé a intentar."
          : name === "NotFoundError"
            ? "No encontramos una cámara en este dispositivo."
            : name === "NotReadableError"
              ? "La cámara está ocupada. Cerrá otras aplicaciones que la estén usando y volvé a intentar."
              : e instanceof Error ? e.message : "No se pudo abrir la cámara.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      owned?.getTracks().forEach(t => t.stop());
      if (stream.current === owned) stream.current = null;
      const target = video.current;
      if (target && target.srcObject === owned) target.srcObject = null;
    };
  }, [attempt]);

  async function takePhoto() {
    const target = video.current;
    if (capturing || !ready || !target?.videoWidth || !target.videoHeight) return;
    setCapturing(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1600 / Math.max(target.videoWidth, target.videoHeight));
      canvas.width = Math.round(target.videoWidth * scale);
      canvas.height = Math.round(target.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la foto. Volvé a intentar.");
      context.drawImage(target, 0, 0, canvas.width, canvas.height);
      let photo: Blob | null = null;
      for (const quality of [0.85, 0.7, 0.5]) {
        photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (photo && photo.size <= 2 * 1024 * 1024) break;
      }
      if (!photo || photo.size > 2 * 1024 * 1024) throw new Error("No se pudo preparar una foto de hasta 2 MB. Volvé a intentar.");
      await onCapture(new File([photo], "producto-" + Date.now() + ".jpg", { type: "image/jpeg" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sacar la foto.");
      setCapturing(false);
    }
  }

  return (
    <dialog ref={dialog} className="product-camera" aria-labelledby="product-camera-title"
      onCancel={e => { e.preventDefault(); if (!capturing) onClose(); }}>
      <div className="modalhead">
        <h2 id="product-camera-title">Sacar foto del producto</h2>
        <button type="button" autoFocus aria-label="Cerrar cámara" disabled={capturing} onClick={onClose}><X /></button>
      </div>
      <p>Apuntá al producto y buscá buena luz.</p>
      <video ref={video} muted playsInline autoPlay aria-label="Cámara del producto" />
      {error ? <p className="error" role="alert">{error}</p> : <p role="status">{ready ? "Cámara lista para sacar la foto." : "Abriendo cámara…"}</p>}
      <div className="product-camera-actions">
        <button type="button" disabled={capturing} onClick={onClose}>Cancelar</button>
        {error && <button type="button" disabled={capturing} onClick={() => setAttempt(n => n + 1)}>Volver a intentar</button>}
        <button type="button" className="primary" disabled={!ready || capturing} onClick={() => void takePhoto()}><Camera size={18} />{capturing ? "Preparando foto…" : "Sacar foto"}</button>
      </div>
    </dialog>
  );
}

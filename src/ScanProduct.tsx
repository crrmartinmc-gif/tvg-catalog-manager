import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { X, ScanLine } from "lucide-react";
export function ScanProduct({
  onFind,
  onClose,
}: {
  onFind: (code: string) => boolean;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const findRef = useRef(onFind);
  findRef.current = onFind;
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  function find(code: string) {
    const value = code.trim();
    if (!value) return;
    controls.current?.stop();
    setReady(false);
    setManual(value);
    if (!findRef.current(value))
      setError(
        `No encontramos un producto con el código “${value}”. Revisá el SKU o actualizá el catálogo.`,
      );
  }
  const handleRef = useRef(find);
  handleRef.current = find;
  useEffect(() => {
    let cancelled = false;
    let scanner: IScannerControls | undefined;
    let detected = false;
    let ownedStream: MediaStream | undefined;
    setError("");
    setReady(false);
    const reader = new BrowserMultiFormatReader();
    const target = video.current;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error(
            "Cámara no disponible. Abrí la app con HTTPS o ingresá el código manualmente.",
          );
        if (!target) return;
        ownedStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          ownedStream.getTracks().forEach((track) => track.stop());
          return;
        }
        scanner = await reader.decodeFromStream(
          ownedStream,
          target,
          (result, _, active) => {
            if (cancelled || detected || !result) return;
            detected = true;
            active.stop();
            handleRef.current(result.getText());
          },
        );
        if (cancelled || detected) scanner.stop();
        else {
          controls.current = scanner;
          setReady(true);
        }
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "La cámara no tiene permiso. Habilitala en el navegador o ingresá el código manualmente."
            : name === "NotFoundError"
              ? "No encontramos una cámara. Podés ingresar el código manualmente."
              : e instanceof Error
                ? e.message
                : "No se pudo iniciar la cámara.",
        );
      }
    }
    void Promise.resolve().then(() => {
      if (!cancelled) return start();
    });
    return () => {
      cancelled = true;
      scanner?.stop();
      controls.current?.stop();
      controls.current = null;
      ownedStream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="overlay">
      <div
        className="barcode-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
      >
        <div className="modalhead">
          <h2 id="scan-title">Escanear producto</h2>
          <button aria-label="Cerrar escáner" onClick={onClose}>
            <X />
          </button>
        </div>
        <p>
          Apuntá la cámara al código de barras de la etiqueta. Al reconocerlo,
          se abrirá el producto.
        </p>
        <div className="scan-view">
          <video
            key={attempt}
            ref={video}
            muted
            playsInline
            aria-label="Cámara para escanear códigos"
          />
          <ScanLine className="scan-guide" size={70} />
        </div>
        <p role="status">
          {ready
            ? "Cámara lista. Acercá la etiqueta y buscá buena luz."
            : "Podés usar la cámara o ingresar el código de la etiqueta."}
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button onClick={() => setAttempt((n) => n + 1)}>
          Volver a intentar cámara
        </button>
        <form
          className="manual-scan"
          onSubmit={(e) => {
            e.preventDefault();
            find(manual);
          }}
        >
          <label>
            Código o SKU
            <input
              required
              autoComplete="off"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ej.: REM-NEG-M"
            />
          </label>
          <button className="primary" type="submit">
            Buscar producto
          </button>
        </form>
      </div>
    </div>
  );
}

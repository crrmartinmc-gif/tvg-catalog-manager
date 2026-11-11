import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { X, ScanLine } from "lucide-react";

// Android camera controls are not yet included in TypeScript's DOM types.
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };
async function focusCamera(track: MediaStreamTrack, refocus = false) {
  const modes = (track.getCapabilities?.() as FocusCapabilities | undefined)?.focusMode;
  if (!modes || track.readyState !== "live") return;
  const apply = (focusMode: string) => track.applyConstraints({
    advanced: [{ focusMode } as MediaTrackConstraintSet],
  });
  // One-shot autofocus helps reacquire a label before returning to continuous AF.
  if (refocus && modes.includes("single-shot")) {
    try { await apply("single-shot"); } catch { /* Optional camera control. */ }
  }
  const mode = modes.includes("continuous") ? "continuous"
    : modes.includes("single-shot") ? "single-shot" : undefined;
  if (mode && track.readyState === "live") {
    try { await apply(mode); } catch { /* Keep scanning on unsupported devices. */ }
  }
}
export function ScanProduct({
  onFind,
  onClose,
  mode = "lookup",
}: {
  onFind: (code: string) => boolean | string;
  mode?: "lookup" | "capture" | "sale";
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const findRef = useRef(onFind);
  findRef.current = onFind;
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [canFocus, setCanFocus] = useState(false);
  function find(code: string) {
    const value = code.trim();
    if (!value) return;
    controls.current?.stop();
    setReady(false);
    cameraTrack.current?.stop();
    setManual(value);
    const outcome = findRef.current(value);
    if (outcome !== true)
      setError(
        typeof outcome === "string"
          ? outcome
          : `No encontramos un producto con el código “${value}”. Revisá el SKU o actualizá el catálogo.`,
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
    setCanFocus(false);
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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          ownedStream.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = ownedStream.getVideoTracks()[0];
        cameraTrack.current = track;
        // Configure focus after acquisition; browsers may reject these controls
        // in getUserMedia even when the active camera supports them.
        await focusCamera(track);
        if (cancelled || track.readyState !== "live") return;
        const modes = (track.getCapabilities?.() as FocusCapabilities | undefined)?.focusMode;
        setCanFocus(!!modes?.some(mode => mode === "continuous" || mode === "single-shot"));
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
        ownedStream?.getTracks().forEach((track) => track.stop());
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
      cameraTrack.current = null;
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
          <h2 id="scan-title">
            {mode === "sale"
              ? "Escanear para vender"
              : mode === "capture"
                ? "Escanear código de barras"
                : "Escanear producto"}
          </h2>
          <button aria-label="Cerrar escáner" onClick={onClose}>
            <X />
          </button>
        </div>
        <p>
          {mode === "sale"
            ? "Escaneá el código del producto para agregar una unidad al carrito."
            : mode === "capture"
              ? "Apuntá al código que ya tiene el producto. Lo copiaremos al SKU y podrás completar la descripción, el precio y los demás datos."
              : "Apuntá la cámara al código de barras de la etiqueta. Al reconocerlo, se abrirá el producto."}
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
            ? "Cámara lista. Mantené el código completo a unos 15–25 cm, con buena luz. Si se ve borroso, alejá un poco el celular."
            : "Podés usar la cámara o ingresar el código de la etiqueta."}
        </p>
        {ready && canFocus && (
          <button onClick={() => {
            const track = cameraTrack.current;
            if (track) void focusCamera(track, true);
          }}>
            Reenfocar código
          </button>
        )}
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
              maxLength={60}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ej.: REM-NEG-M"
            />
          </label>
          <button className="primary" type="submit">
            {mode === "sale"
              ? "Agregar al carrito"
              : mode === "capture"
                ? "Usar este código"
                : "Buscar producto"}
          </button>
        </form>
      </div>
    </div>
  );
}

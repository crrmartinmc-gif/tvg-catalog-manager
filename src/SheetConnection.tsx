import { useState } from "react";
import { SHEET_URL, type Connection } from "./sheets";
type Props = {
  busy: boolean;
  connected: boolean;
  initialUrl: string;
  onConnect: (url: string, password: string) => Promise<void>;
  onClose: () => void;
};
export function SheetConnection({
  busy,
  connected,
  initialUrl,
  onConnect,
  onClose,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="overlay">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheets-title"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await onConnect(url.trim(), password);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo conectar.");
          }
        }}
      >
        <div className="modalhead">
          <h2 id="sheets-title">Conectar Google Sheets</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar conexión"
          >
            ×
          </button>
        </div>
        <p>
          Usá la planilla de tu negocio para compartir el catálogo entre
          dispositivos.
        </p>
        <p>
          <a href={SHEET_URL} target="_blank" rel="noreferrer">
            Abrir planilla de destino
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/crrmartinmc-gif/tvg-catalog-manager/tree/main/integrations/google-sheets"
            target="_blank"
            rel="noreferrer"
          >
            Instrucciones y script
          </a>
        </p>
        <label>
          URL de implementación de Apps Script
          <input
            required
            type="url"
            placeholder="https://script.google.com/macros/s/…/exec"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Clave del catálogo
          <input
            required
            type="password"
            minLength={16}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        <p>
          La clave se mantiene en memoria durante esta sesión. Al conectar se
          carga el catálogo de Sheets; tus datos locales se conservan como
          respaldo.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="modalbuttons">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Conectando…" : connected ? "Reconectar" : "Conectar"}
          </button>
        </div>
      </form>
    </div>
  );
}
export type { Connection };

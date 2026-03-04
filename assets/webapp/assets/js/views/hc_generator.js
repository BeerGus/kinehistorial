import { Bridge } from "../bridge.js";
import { toast } from "../ui.js";

function fmtDateYMD(ymd) {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function fmtDTFull(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
}

function escHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function generateHC(patient) {
  // 1. Verificar perfil profesional completo
  const cfg = (await Bridge.call("getConfig")) || {};
  const pro = cfg.professional || {};

  const isComplete = !!(pro.nombre && pro.apellido && pro.titulo && pro.matricula);
  if (!isComplete) {
    const ir = confirm(
      "⚠ El perfil del profesional está incompleto.\n\n" +
      "Necesitás completar nombre, apellido, título y matrícula " +
      "antes de generar la historia clínica.\n\n" +
      "¿Querés ir a completar el perfil ahora?"
    );
    if (ir) location.hash = "#/professional";
    return;
  }

  // 2. Entradas activas ordenadas por eventDate asc
  const allEntries = await Bridge.listEntries(patient.id);
  const entries = (allEntries || [])
    .filter(e => (e.status || "ACTIVE") === "ACTIVE")
    .sort((a, b) => {
      const da = String(a.eventDate || String(a.createdAt || "").slice(0, 10));
      const db = String(b.eventDate || String(b.createdAt || "").slice(0, 10));
      return da.localeCompare(db);
    });

  const generadaEn = fmtDTFull(new Date().toISOString());

  // 3. Construir HTML
  const entryRows = entries.map((e, idx) => {
    const att = Array.isArray(e.attachments) ? e.attachments : [];
    const attLine = att.length > 0
      ? `<div class="att">Adjuntos (${att.length}): ${att.map(a => escHtml(a.name || "archivo")).join(", ")}</div>`
      : `<div class="att muted-att">Sin adjuntos</div>`;

    return `
      <div class="entry ${idx > 0 ? "entry--sep" : ""}">
        <div class="entry-header">
          <span class="entry-date">${escHtml(fmtDateYMD(e.eventDate))}</span>
          <span class="entry-title">${escHtml(e.titulo || "(sin título)")}</span>
        </div>
        <div class="entry-meta">
          Creada: ${escHtml(fmtDTFull(e.createdAt))} &nbsp;·&nbsp;
          Últ. modificación: ${escHtml(fmtDTFull(e.updatedAt))}
        </div>
        <div class="entry-body">${escHtml(e.contenido || "").replaceAll("\n", "<br>")}</div>
        ${attLine}
      </div>
    `;
  }).join("");

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HC – ${escHtml(patient.apellido)} ${escHtml(patient.nombre)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      color: #111;
      background: #fff;
      padding: 24px 32px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 { font-size: 18pt; margin: 0 0 4px; }
    h2 { font-size: 13pt; margin: 0 0 12px; color: #444; font-weight: normal; }
    .header {
      border-bottom: 2px solid #111;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .header-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 14px;
    }
    .label { font-size: 10pt; color: #666; margin-bottom: 2px; }
    .value { font-size: 11pt; font-weight: bold; }
    .section-title {
      font-size: 13pt;
      font-weight: bold;
      margin: 20px 0 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ccc;
    }
    .entry { padding: 14px 0 10px; }
    .entry--sep { border-top: 1px solid #ddd; }
    .entry-header {
      display: flex;
      gap: 14px;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .entry-date {
      font-size: 11pt;
      font-weight: bold;
      white-space: nowrap;
      color: #333;
    }
    .entry-title { font-size: 12pt; font-weight: bold; }
    .entry-meta { font-size: 9pt; color: #666; margin-bottom: 8px; }
    .entry-body {
      font-size: 11pt;
      line-height: 1.55;
      margin-bottom: 6px;
    }
    .att { font-size: 9pt; color: #555; margin-top: 4px; }
    .muted-att { color: #aaa; }
    .footer {
      margin-top: 36px;
      padding-top: 14px;
      border-top: 2px solid #111;
      font-size: 9pt;
      color: #555;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .no-entries { color: #888; font-style: italic; margin: 20px 0; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Historia Clínica</h1>
    <h2>Kinesiología y Fisioterapia</h2>
    <div class="header-grid">
      <div>
        <div class="label">PACIENTE</div>
        <div class="value">${escHtml(patient.apellido || "")} ${escHtml(patient.nombre || "")}</div>
        ${patient.dni       ? `<div>DNI: ${escHtml(patient.dni)}</div>` : ""}
        ${patient.telefono  ? `<div>Tel: ${escHtml(patient.telefono)}</div>` : ""}
        ${patient.email     ? `<div>Email: ${escHtml(patient.email)}</div>` : ""}
      </div>
      <div>
        <div class="label">PROFESIONAL</div>
        <div class="value">${escHtml(pro.titulo || "")} ${escHtml(pro.apellido || "")} ${escHtml(pro.nombre || "")}</div>
        ${pro.matricula  ? `<div>${escHtml(pro.matricula)}</div>` : ""}
        ${pro.documento  ? `<div>DNI: ${escHtml(pro.documento)}</div>` : ""}
      </div>
    </div>
  </div>

  <div class="section-title">Historial de atenciones (${entries.length})</div>

  ${entries.length === 0
    ? `<div class="no-entries">No hay entradas registradas para este paciente.</div>`
    : entryRows
  }

  <div class="footer">
    <div>KineHistorial v3.0.0 – Generada el ${escHtml(generadaEn)}</div>
    <div>Documento de uso profesional. No reemplaza el criterio clínico.</div>
  </div>
</body>
</html>`;

  // 4. Enviar el HTML a Flutter para que lo guarde como archivo temporal y lo abra
  //    con el visor del sistema (igual que los adjuntos). window.open() no funciona
  //    dentro de un InAppWebView de Flutter.
  toast("Generando historia clínica…");
  try {
    const res = await Bridge.call("openHtmlFile", {
      filename: `HC_${patient.apellido}_${patient.nombre}.html`
        .replaceAll(" ", "_")
        .replaceAll(/[^a-zA-Z0-9_\-\.]/g, ""),
      html: htmlContent,
    });

    if (!res || res.ok !== true) {
      toast("No se pudo abrir la HC: " + (res?.error || "error desconocido"));
    }
  } catch (e) {
    console.error(e);
    toast("Error generando HC");
  }
}

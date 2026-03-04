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
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
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

  // 2. Traer entradas activas ordenadas por eventDate asc
  const allEntries = await Bridge.listEntries(patient.id);
  const entries = (allEntries || [])
    .filter(e => (e.status || "ACTIVE") === "ACTIVE")
    .sort((a, b) => {
      const da = String(a.eventDate || String(a.createdAt || "").slice(0, 10));
      const db = String(b.eventDate || String(b.createdAt || "").slice(0, 10));
      return da.localeCompare(db);
    });

  const generadaEn = new Date().toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  // 3. Construir HTML
  const entryRows = entries.map((e, idx) => {
    const att = Array.isArray(e.attachments) ? e.attachments : [];
    const attLine = att.length > 0
      ? `<div class="att">Adjuntos (${att.length}): ${att.map(a => escHtml(a.name || "archivo")).join(", ")}</div>`
      : `<div class="att">Sin adjuntos</div>`;

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

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Historia Clínica – ${escHtml(patient.apellido)} ${escHtml(patient.nombre)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      color: #111;
      background: #fff;
      margin: 0;
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
    .entry-title {
      font-size: 12pt;
      font-weight: bold;
    }
    .entry-meta {
      font-size: 9pt;
      color: #666;
      margin-bottom: 8px;
    }
    .entry-body {
      font-size: 11pt;
      line-height: 1.55;
      white-space: pre-wrap;
      margin-bottom: 6px;
    }
    .att {
      font-size: 9pt;
      color: #555;
      margin-top: 4px;
    }
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
    .no-entries {
      color: #888;
      font-style: italic;
      margin: 20px 0;
    }
    @media print {
      body { padding: 0; }
      .entry--sep { page-break-before: avoid; }
    }
  </style>
</head>
<body>

  <div class="header">
    <h1>Historia Clínica</h1>
    <h2>Kinesiología y Fisioterapia</h2>

    <div class="header-grid">
      <div>
        <div style="font-size:10pt; color:#666; margin-bottom:6px;">PACIENTE</div>
        <div class="value">${escHtml(patient.apellido || "")} ${escHtml(patient.nombre || "")}</div>
        ${patient.dni ? `<div>DNI: ${escHtml(patient.dni)}</div>` : ""}
        ${patient.telefono ? `<div>Tel: ${escHtml(patient.telefono)}</div>` : ""}
        ${patient.email ? `<div>Email: ${escHtml(patient.email)}</div>` : ""}
      </div>
      <div>
        <div style="font-size:10pt; color:#666; margin-bottom:6px;">PROFESIONAL</div>
        <div class="value">${escHtml(pro.titulo || "")} ${escHtml(pro.apellido || "")} ${escHtml(pro.nombre || "")}</div>
        ${pro.matricula ? `<div>${escHtml(pro.matricula)}</div>` : ""}
        ${pro.documento ? `<div>DNI: ${escHtml(pro.documento)}</div>` : ""}
      </div>
    </div>
  </div>

  <div class="section-title">Historial de atenciones (${entries.length})</div>

  ${entries.length === 0
    ? `<div class="no-entries">No hay entradas registradas para este paciente.</div>`
    : entryRows
  }

  <div class="footer">
    <div>KineHistorial – Historia clínica generada el ${escHtml(generadaEn)}</div>
    <div>Documento generado automáticamente. No reemplaza el criterio clínico profesional.</div>
  </div>

</body>
</html>`;

  // 4. Abrir en ventana nueva para imprimir / guardar como PDF
  try {
    const win = window.open("", "_blank");
    if (!win) {
      toast("No se pudo abrir la ventana. Revisá el bloqueador de popups.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Pequeño delay para que el navegador cargue el DOM antes de imprimir
    setTimeout(() => {
      try { win.print(); } catch (_) {}
    }, 400);
  } catch (e) {
    console.error(e);
    toast("Error generando HC");
  }
}

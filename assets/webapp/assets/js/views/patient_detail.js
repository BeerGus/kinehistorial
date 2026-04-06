import { el, fmtDT, escapeHtml, toast } from "../ui.js";
import { Store } from "../store.js";
import { Bridge } from "../bridge.js";
import { generateHC } from "./hc_generator.js";

function fmtDateYMD(ymd) {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

// ── Modal confirmación borrar paciente ────────────────────────────────────────
function showDeletePatientConfirm(patient, onConfirm) {
  if (document.getElementById("deletePatientModal")) return;

  const overlay = document.createElement("div");
  overlay.id = "deletePatientModal";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(11, 34, 51, 0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  const nombre = `${patient.apellido || ""} ${patient.nombre || ""}`.trim();

  overlay.innerHTML = `
    <div style="
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 24px 20px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 12px 40px rgba(10,40,70,0.18);
    ">
      <div style="font-size:18px; font-weight:700; color:#c0392b; margin-bottom:12px;">
        ⚠ Borrar paciente
      </div>
      <div style="font-size:14px; color:var(--text); line-height:1.6; margin-bottom:8px;">
        Estás por borrar permanentemente a <strong>${nombre}</strong> (${patient.id}).
      </div>
      <div style="
        background:#fff3f3; border:1px solid #f5c6c6; border-radius:10px;
        padding:12px 14px; font-size:13px; color:#7a1f1f; margin-bottom:20px; line-height:1.5;
      ">
        Esta acción eliminará el paciente, todas sus entradas clínicas y todos sus adjuntos.
        <strong>No se puede deshacer.</strong>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="deleteCancelBtn" class="btn secondary">Cancelar</button>
        <button id="deleteConfirmBtn" class="btn primary" style="background:#c0392b; border-color:#c0392b;">
          Borrar definitivamente
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#deleteCancelBtn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#deleteConfirmBtn").addEventListener("click", async () => {
    const btn = overlay.querySelector("#deleteConfirmBtn");
    btn.disabled = true;
    btn.textContent = "Borrando...";
    close();
    await onConfirm();
  });

  const onKey = (e) => {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
}
// ─────────────────────────────────────────────────────────────────────────────

export async function renderPatientDetail({ id }) {
  await Store.refreshPatients();
  const p = Store.getPatient(id);
  if (!p) return el(`<div class="card">Paciente no encontrado.</div>`);

  const entriesRaw = await Store.refreshEntries(id);

  // Orden: eventDate desc, createdAt desc
  const entriesSorted = [...(entriesRaw || [])].sort((a, b) => {
    const da = String(a.eventDate || (a.createdAt ? String(a.createdAt).slice(0, 10) : ""));
    const db = String(b.eventDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : ""));
    if (db !== da) return db.localeCompare(da);
    const ca = String(a.createdAt || "");
    const cb = String(b.createdAt || "");
    return cb.localeCompare(ca);
  });

  const entries = entriesSorted.filter(e => (e.status || "ACTIVE") === "ACTIVE");
  const n = entries.length;

  // Entradas con dx en el título (orden cronológico inverso, ya están ordenadas)
  const dxEntries = entries.filter(e => /dx/i.test(e.titulo || ""));

  // HTML de la lista de dx
  const dxHtml = dxEntries.length > 0
    ? dxEntries.map(e => `
        <div style="font-size:13px; padding:2px 0;">
          <span class="muted" style="margin-right:6px;">${fmtDateYMD(e.eventDate || (e.createdAt ? String(e.createdAt).slice(0, 10) : ""))}</span>
          <span style="font-weight:600;">${escapeHtml(e.titulo || "")}</span>
        </div>`).join("")
    : `<div class="muted" style="font-size:13px; font-style:italic;">Sin diagnósticos registrados</div>`;

  const root = el(`
    <section class="stack">
      <div class="card">

        <!-- Nombre clickeable para expandir datos personales -->
        <div id="headerRow" style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;">
          <h1 class="h1" style="margin:0;">
            ${escapeHtml(p.apellido || "")} ${escapeHtml(p.nombre || "")}
            <span class="badge">${escapeHtml(p.id || "")}</span>
          </h1>
          <span id="chevron" style="font-size:16px; color:var(--muted); transition:transform 0.2s; margin-top:2px;">▸</span>
        </div>

        <!-- Datos personales expandibles -->
        <div id="datosPersonales" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
          <div class="muted">DNI: ${escapeHtml(p.dni || "-")} · Tel: ${escapeHtml(p.telefono || "-")} · Email: ${escapeHtml(p.email || "-")}</div>
          <div class="muted" style="margin-top:4px;">Creada: ${escapeHtml(p.createdAt ? fmtDT(p.createdAt) : "-")} · Últ modif: ${escapeHtml(p.updatedAt ? fmtDT(p.updatedAt) : "-")}</div>
        </div>

        <!-- Diagnósticos en lugar de datos personales -->
        <div style="margin-top:10px;">
          ${dxHtml}
        </div>

        <div class="hr"></div>

        <div class="row">
          <a class="btn" href="#/patient/${escapeHtml(p.id)}/new-entry">Nueva entrada</a>
          <button class="btn secondary" id="btnGenHC">Generar HC</button>
          <a class="btn secondary" href="#/patients">Volver</a>
          <button class="btn danger" id="btnDeletePatient">Borrar paciente</button>
        </div>
      </div>

      <div class="card">
        <h2 class="h2">Historial (${n})</h2>
        <div class="list" id="list"></div>
      </div>
    </section>
  `);

  // ── Toggle datos personales ───────────────────────────────────────────────
  let expanded = false;
  const $headerRow = root.querySelector("#headerRow");
  const $datosPersonales = root.querySelector("#datosPersonales");
  const $chevron = root.querySelector("#chevron");

  $headerRow.addEventListener("click", () => {
    expanded = !expanded;
    $datosPersonales.style.display = expanded ? "block" : "none";
    $chevron.style.transform = expanded ? "rotate(90deg)" : "rotate(0deg)";
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Render historial ──────────────────────────────────────────────────────
  const $list = root.querySelector("#list");
  $list.innerHTML = "";

  for (const e of entries) {
    const att = Array.isArray(e.attachments) ? e.attachments : [];
    const createdAt = e.createdAt ? fmtDT(e.createdAt) : "-";
    const updatedAt = e.updatedAt ? fmtDT(e.updatedAt) : "-";
    const eventDate = fmtDateYMD(e.eventDate || (e.createdAt ? String(e.createdAt).slice(0, 10) : ""));
    const ver = Number.isFinite(+e.version) ? +e.version : 0;

    $list.appendChild(el(`
      <div class="item" style="align-items:flex-start">
        <div style="width:100%">
          <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
            <div>
              <div><b>${escapeHtml(e.titulo || "(sin título)")}</b></div>
              <div class="muted">Fecha: ${escapeHtml(eventDate)}</div>
              <div class="muted small">
                Creada: ${escapeHtml(createdAt)} | Últ modif: ${escapeHtml(updatedAt)} | Modifs: ${ver}
              </div>
              <div class="muted">Adjuntos (${att.length})</div>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <a class="btn secondary" href="#/patient/${p.id}/entry/${e.id}/edit?mode=view">Ver</a>
              <a class="btn" href="#/patient/${escapeHtml(p.id)}/entry/${escapeHtml(e.id)}/edit">Editar</a>
              <button class="btn danger" data-act="elim" data-eid="${escapeHtml(e.id)}">Anular</button>
            </div>
          </div>
        </div>
      </div>
    `));
  }

  if (entries.length === 0) {
    $list.appendChild(el(`<div class="muted">Todavía no hay entradas.</div>`));
  }
  // ─────────────────────────────────────────────────────────────────────────

  root.querySelector("#btnGenHC").addEventListener("click", () => generateHC(p));

  // ── Borrar paciente ───────────────────────────────────────────────────────
  root.querySelector("#btnDeletePatient").addEventListener("click", () => {
    showDeletePatientConfirm(p, async () => {
      try {
        const res = await Bridge.call("deletePatient", { patientId: p.id });
        if (!res || res.ok !== true) {
          toast("No se pudo borrar el paciente");
          console.error("[DELETE PATIENT ERROR]", res);
          return;
        }
        toast("Paciente borrado");
        await Store.refreshPatients();
        location.hash = "#/patients";
      } catch (e) {
        console.error(e);
        toast("Error al borrar el paciente");
      }
    });
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Anular entrada ────────────────────────────────────────────────────────
  root.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button[data-act='elim']");
    if (!btn) return;
    const entryId = btn.getAttribute("data-eid");
    if (!entryId) return;

    const ok = confirm("¿Anular esta entrada? No se borra: solo queda oculta.");
    if (!ok) return;

    try {
      const res = await Bridge.eliminateEntry(p.id, entryId);
      if (!res || res.ok !== true) {
        toast("No se pudo anular");
        console.error("[ELIMINATE ERROR]", res);
        return;
      }
      toast("Entrada anulada");
      await Store.refreshEntries(p.id);
      await window.__RENDER__?.();
    } catch (e) {
      console.error(e);
      toast("Error anulando");
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  return root;
}

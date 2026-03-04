import { el, fmtDT, escapeHtml, toast } from "../ui.js";
import { Store } from "../store.js";
import { Bridge } from "../bridge.js";

function fmtDateYMD(ymd) {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export async function renderPatientDetail({ id }) {
  await Store.refreshPatients();
  const p = Store.getPatient(id);
  if (!p) return el(`<div class="card">Paciente no encontrado.</div>`);

  const entriesRaw = await Store.refreshEntries(id);

  // Orden: eventDate desc (YYYY-MM-DD), si empata -> updatedAt desc -> createdAt desc
  const entriesSorted = [...(entriesRaw || [])].sort((a, b) => {
    const da = String(a.eventDate || (a.createdAt ? String(a.createdAt).slice(0, 10) : ""));
    const db = String(b.eventDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : ""));
    if (db !== da) return db.localeCompare(da);

    const ua = String(a.updatedAt || "");
    const ub = String(b.updatedAt || "");
    if (ub !== ua) return ub.localeCompare(ua);

    const ca = String(a.createdAt || "");
    const cb = String(b.createdAt || "");
    return cb.localeCompare(ca);
  });

  // Por defecto: NO mostramos eliminadas
  const entries = entriesSorted.filter(e => (e.status || "ACTIVE") === "ACTIVE");
  const n = entries.length;

  const root = el(`
    <section class="stack">
      <div class="card">
        <h1 class="h1">${escapeHtml(p.apellido || "")} ${escapeHtml(p.nombre || "")} <span class="badge">${escapeHtml(p.id || "")}</span></h1>
        <div class="muted">DNI: ${escapeHtml(p.dni || "-")} · Tel: ${escapeHtml(p.telefono || "-")} · Email: ${escapeHtml(p.email || "-")}</div>
        <div class="hr"></div>
        <div class="muted">Creada: ${escapeHtml(p.createdAt ? fmtDT(p.createdAt) : "-")} · Últ modif: ${escapeHtml(p.updatedAt ? fmtDT(p.updatedAt) : "-")}</div>
        <div class="hr"></div>
        <div class="row">
          <a class="btn" href="#/patient/${escapeHtml(p.id)}/new-entry">Nueva entrada</a>
          <a class="btn secondary" href="#/patients">Volver</a>
        </div>
      </div>

      <div class="card">
        <h2 class="h2">Historial (${n})</h2>
        <div class="list" id="list"></div>
      </div>
    </section>
  `);

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

  // Handler anular desde listado
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
      /*location.hash = `#/patient/${p.id}`;*/
      await Store.refreshEntries(p.id);
      await window.__RENDER__?.();
    } catch (e) {
      console.error(e);
      toast("Error anulando");
    }
  });

  return root;
}
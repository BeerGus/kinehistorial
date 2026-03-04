import { el, toast, escapeHtml, fileToBase64, fmtDT } from "../ui.js";
import { Store } from "../store.js";
import { Bridge } from "../bridge.js";

function isoToYMD(iso) {
  if (!iso) return "";
  try { return String(iso).slice(0, 10); } catch { return ""; }
}

function isViewMode() {
  const h = String(location.hash || "");
  return h.includes("mode=view");
}

export async function renderEntryEdit(patientId, entryId) {
  const viewMode = isViewMode();

  const entries = await Store.refreshEntries(patientId);
  const entry = (entries || []).find(e => String(e.id) === String(entryId));

  if (!entry) {
    return el(`
      <section class="card">
        <h1 class="h1">${viewMode ? "Ver entrada" : "Editar entrada"}</h1>
        <div class="muted">No se encontró la entrada.</div>
        <div class="spacer"></div>
        <a class="btn secondary" href="#/patient/${patientId}">Volver</a>
      </section>
    `);
  }

  const currentAtt = Array.isArray(entry.attachments) ? entry.attachments : [];
  const removeSet = new Set();

  const modCount = Math.max(
    0,
    ((entry.audit || []).filter(a => a.action === "MODIFICADA").length)
  );

  const createdAtLabel = entry.createdAt ? fmtDT(entry.createdAt) : "-";
  const updatedAtLabel = entry.updatedAt ? fmtDT(entry.updatedAt) : "-";

  const defaultEventDate = (entry.eventDate && String(entry.eventDate).trim())
    ? String(entry.eventDate).slice(0, 10)
    : isoToYMD(entry.createdAt);

  const existingProNote =
    (typeof entry.proNote === "string" ? entry.proNote : "") ||
    (Array.isArray(entry.proNotes) ? entry.proNotes.join(", ") : "");

  const root = el(`
    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <h1 class="h1">${viewMode ? "Ver entrada" : "Editar entrada"}</h1>
          <div class="muted small">
            Creada: ${escapeHtml(createdAtLabel)} · Últ modif: ${escapeHtml(updatedAtLabel)} | (${modCount} modificaciones)
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          ${viewMode ? `<a class="btn" href="#/patient/${patientId}/entry/${entryId}/edit">Editar</a>` : ``}
          <button class="btn danger" id="btnElim">Anular</button>
          <a class="btn secondary" href="#/patient/${patientId}">Volver</a>
        </div>
      </div>

      <div class="spacer"></div>

      <label class="muted">Fecha *</label>
      <input class="input" id="eventDate" type="date" />

      <div class="spacer"></div>

      <label class="muted">Título *</label>
      <input class="input" id="titulo" />

      <div class="spacer"></div>

      <label class="muted">Detalle</label>
      <textarea class="textarea" id="contenido" rows="8"></textarea>

      <div class="spacer"></div>

      <label class="muted">Notas privadas del profesional (opcional)</label>
      <input class="input" id="proNote" />

      <div class="spacer"></div>

      <label class="muted">Adjuntos actuales (${currentAtt.length})</label>
      <div id="attList" class="stack"></div>

      ${viewMode ? "" : `
        <div class="spacer"></div>
        <label class="muted">Agregar adjuntos (imágenes / pdf / archivos)</label>
        <input class="input" type="file" id="files" multiple />
      `}

      <div class="spacer"></div>

      ${viewMode ? "" : `
        <div class="row" style="flex-wrap:wrap;gap:10px;">
          <button class="btn" id="btnSave">Guardar cambios</button>
          <a class="btn secondary" href="#/patient/${patientId}">Cancelar</a>
        </div>
      `}
    </section>
  `);

  const $eventDate = root.querySelector("#eventDate");
  const $titulo = root.querySelector("#titulo");
  const $contenido = root.querySelector("#contenido");
  const $proNote = root.querySelector("#proNote");
  const $attList = root.querySelector("#attList");

  $eventDate.value = defaultEventDate || "";
  $titulo.value = entry.titulo || "";
  $contenido.value = entry.contenido || "";
  $proNote.value = existingProNote || "";

  if (viewMode) {
    $eventDate.disabled = true;
    $titulo.disabled = true;
    $contenido.disabled = true;
    $proNote.disabled = true;
  }

  function renderAttList() {
    if (!currentAtt.length) {
      $attList.innerHTML = `<div class="muted">Sin adjuntos</div>`;
      return;
    }

    $attList.innerHTML = currentAtt.map((a) => {
      const rel = (a.relPath || a.path || "").toString();
      const name = (a.name || "archivo").toString();
      const marked = removeSet.has(rel);

      return `
        <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="min-width:180px;">
            <div><strong>${escapeHtml(name)}</strong></div>
            <div class="muted small">${escapeHtml(rel)}</div>
            ${marked ? `<div class="badge warn" style="margin-top:6px;">Marcado para quitar</div>` : ``}
          </div>

          <div class="row" style="gap:8px;flex-wrap:wrap;">
            <button class="btn secondary" data-act="open" data-rel="${escapeHtml(rel)}">Abrir</button>
            ${viewMode ? "" : `
              <button class="btn ${marked ? "secondary" : "danger"}"
                      data-act="toggleRemove"
                      data-rel="${escapeHtml(rel)}">
                ${marked ? "Deshacer" : "Quitar"}
              </button>
            `}
          </div>
        </div>
      `;
    }).join("");
  }

  $attList.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;

    const act = btn.getAttribute("data-act");
    const rel = btn.getAttribute("data-rel") || "";
    if (!rel) return;

    if (act === "open") {
      try {
        await Bridge.openAttachment(rel);
      } catch (e) {
        console.error(e);
        toast("No se pudo abrir el adjunto");
      }
      return;
    }

    if (act === "toggleRemove" && !viewMode) {
      if (removeSet.has(rel)) removeSet.delete(rel);
      else removeSet.add(rel);
      renderAttList();
    }
  });

  renderAttList();

  if (!viewMode) {
    const $btnSave = root.querySelector("#btnSave");
    const $files = root.querySelector("#files");

    $btnSave.addEventListener("click", async () => {
      const eventDate = ($eventDate.value || "").trim();
      const titulo = $titulo.value.trim();
      const contenido = $contenido.value.trim();
      const proNote = $proNote.value.trim();

      if (!eventDate) return toast("Falta la fecha");
      if (!titulo) return toast("Falta el título");

      $btnSave.disabled = true;
      try {
        const files = Array.from($files.files || []);
        const filesBase64 = [];

        for (const f of files) {
          const b64 = await fileToBase64(f);
          filesBase64.push({
            name: f.name,
            mime: f.type || "application/octet-stream",
            base64: b64
          });
        }

        const res = await Bridge.updateEntry(
          {
            id: entry.id,
            patientId: entry.patientId,
            eventDate,
            titulo,
            contenido,
            proNote,
          },
          filesBase64,
          Array.from(removeSet)
        );

        if (!res || res.ok !== true) {
          throw new Error("updateEntry inválido");
        }

        toast("Entrada actualizada");
        location.hash = `#/patient/${patientId}`;
      } catch (e) {
        console.error(e);
        toast("Error actualizando entrada");
      } finally {
        $btnSave.disabled = false;
      }
    });
  }

  root.querySelector("#btnElim").addEventListener("click", async () => {
    const ok = confirm("¿Anular esta entrada? No se borra: solo queda oculta.");
    if (!ok) return;

    try {
      const res = await Bridge.eliminateEntry(patientId, entryId);
      if (!res || res.ok !== true) {
        toast("No se pudo anular");
        return;
      }
      toast("Entrada anulada");
      location.hash = `#/patient/${patientId}`;
    } catch (e) {
      console.error(e);
      toast("Error anulando");
    }
  });

  return root;
}
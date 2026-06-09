import { el, toast, uid } from "../ui.js";
import { Store } from "../store.js";
import { Bridge } from "../bridge.js";
import { showMergeReview } from "./merge_review.js";

let editingId = null;

// ── Normalizar texto para comparación ─────────────────────────────────────────
function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// ── Icono de mergeTag ─────────────────────────────────────────────────────────
function mergeTagIcon(tag) {
  if (tag === "new") return `<span title="Nuevo importado" style="color:#f39c12; margin-left:4px;">⭐</span>`;
  if (tag === "merged") return `<span title="Fusionado" style="color:#e67e22; margin-left:4px;">⚠</span>`;
  if (tag === "unchanged") return `<span title="Sin cambios" style="color:#27ae60; margin-left:4px;">=</span>`;
  return "";
}

// ── Helper: último dx de un paciente ─────────────────────────────────────────
async function getLastDx(patientId) {
  try {
    const entries = await Bridge.listEntries(patientId);
    if (!Array.isArray(entries)) return null;
    const dxEntries = entries
      .filter(e => (e.status || "ACTIVE") === "ACTIVE" && /dx/i.test(e.titulo || ""))
      .sort((a, b) => {
        const da = String(a.eventDate || (a.createdAt ? String(a.createdAt).slice(0, 10) : ""));
        const db = String(b.eventDate || (b.createdAt ? String(b.createdAt).slice(0, 10) : ""));
        if (db !== da) return db.localeCompare(da);
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
    return dxEntries.length > 0 ? dxEntries[0].titulo : null;
  } catch (_) {
    return null;
  }
}

// ── Helper: chequea si paciente tiene dx / ep ─────────────────────────────────
async function getPatientFlags(patientId) {
  try {
    const entries = await Bridge.listEntries(patientId);
    if (!Array.isArray(entries)) return { hasDx: false, hasEp: false };
    const active = entries.filter(e => (e.status || "ACTIVE") === "ACTIVE");
    return {
      hasDx: active.some(e => /dx/i.test(e.titulo || "")),
      hasEp: active.some(e => /epicrisis/i.test(e.titulo || "")),
    };
  } catch (_) {
    return { hasDx: false, hasEp: false };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export async function renderPatients() {
  await Store.refreshPatients();

  // Estado de filtros y modo COMB
  let filterSinDx = false;
  let filterSinEp = false;
  let combSourceId = null; // ID del paciente seleccionado para combinar

  const root = el(`
    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start;">
        <div>
          <h1 class="h1">Pacientes</h1>
          <div class="muted">Total: <span id="count"></span></div>
        </div>
        <button class="btn" id="btnToggleNew">Nuevo paciente</button>
      </div>

      <div class="spacer"></div>

      <!-- Form alta/edición (colapsable) -->
      <div id="newWrap" class="card hidden" style="background:#fafbff;border-style:dashed">
        <h2 class="h2" id="formTitle">Alta de paciente</h2>

        <div class="grid two">
          <div>
            <label class="muted">Apellido *</label>
            <input class="input" id="np_apellido" placeholder="Ej: Pérez" />
          </div>
          <div>
            <label class="muted">Nombre *</label>
            <input class="input" id="np_nombre" placeholder="Ej: Juan" />
          </div>
        </div>

        <div class="spacer"></div>

        <div class="grid two">
          <div>
            <label class="muted">DNI</label>
            <input class="input" id="np_dni" placeholder="Opcional" />
          </div>
          <div>
            <label class="muted">Teléfono</label>
            <input class="input" id="np_tel" placeholder="Opcional" />
          </div>
        </div>

        <div class="spacer"></div>

        <label class="muted">Email</label>
        <input class="input" id="np_email" placeholder="Opcional" />

        <div class="spacer"></div>

        <label class="muted">Notas</label>
        <textarea class="textarea" id="np_notas" placeholder="Opcional (dolencias, observaciones, etc.)"></textarea>

        <div class="spacer"></div>

        <div class="row">
          <button class="btn" id="btnSave">Crear</button>
          <button class="btn secondary" id="btnCancel">Cancelar</button>
        </div>
      </div>

      <div class="spacer"></div>

      <!-- Filtros E -->
      <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <button class="btn secondary" id="btnFilterDx" style="font-size:12px;">P s/ dx</button>
        <button class="btn secondary" id="btnFilterEp" style="font-size:12px;">P s/ ep</button>
      </div>

      <input class="input" id="q" placeholder="Buscar por nombre, apellido, DNI..." />
      <div class="spacer"></div>

      <div class="list" id="list"></div>
    </section>
  `);

  const $list = root.querySelector("#list");
  const $count = root.querySelector("#count");
  const $q = root.querySelector("#q");
  const $newWrap = root.querySelector("#newWrap");
  const $btnToggleNew = root.querySelector("#btnToggleNew");
  const $btnSave = root.querySelector("#btnSave");
  const $btnCancel = root.querySelector("#btnCancel");
  const $formTitle = root.querySelector("#formTitle");
  const $apellido = root.querySelector("#np_apellido");
  const $nombre = root.querySelector("#np_nombre");
  const $dni = root.querySelector("#np_dni");
  const $tel = root.querySelector("#np_tel");
  const $email = root.querySelector("#np_email");
  const $notas = root.querySelector("#np_notas");
  const $btnFilterDx = root.querySelector("#btnFilterDx");
  const $btnFilterEp = root.querySelector("#btnFilterEp");

  const toggleForm = (show) => {
    const wantShow = (typeof show === "boolean") ? show : $newWrap.classList.contains("hidden");
    if (wantShow) $newWrap.classList.remove("hidden");
    else $newWrap.classList.add("hidden");
  };

  const clearForm = () => {
    editingId = null;
    $apellido.value = "";
    $nombre.value = "";
    $dni.value = "";
    $tel.value = "";
    $email.value = "";
    $notas.value = "";
    $btnSave.textContent = "Crear";
    $formTitle.textContent = "Alta de paciente";
  };

  const fillForm = (p) => {
    editingId = p.id;
    $apellido.value = p.apellido || "";
    $nombre.value = p.nombre || "";
    $dni.value = p.dni || "";
    $tel.value = p.telefono || "";
    $email.value = p.email || "";
    $notas.value = p.notas || "";
    $btnSave.textContent = "Guardar cambios";
    $formTitle.textContent = `Editar paciente (${p.id})`;
  };

  // ── Cancelar modo COMB ────────────────────────────────────────────────────
  const cancelComb = () => {
    combSourceId = null;
    draw();
  };

  const draw = async () => {
    const q = ($q.value || "").toLowerCase().trim();

    // Aplicar filtros de texto
    let items = Store.patients.filter(p => {
      const s = `${p.nombre || ""} ${p.apellido || ""} ${p.dni || ""}`.toLowerCase();
      return s.includes(q);
    });

    // Filtros E: si están activos, cargar entradas y filtrar
    if (filterSinDx || filterSinEp) {
      const flags = await Promise.all(items.map(p => getPatientFlags(p.id)));
      items = items.filter((p, i) => {
        if (filterSinDx && flags[i].hasDx) return false;
        if (filterSinEp && flags[i].hasEp) return false;
        return true;
      });
    }

    $count.textContent = String(items.length);
    $list.innerHTML = "";

    if (items.length === 0) {
      $list.appendChild(el(`<div class="muted">Sin resultados.</div>`));
      return;
    }

    const isCombMode = !!combSourceId;

    for (const p of items) {
      const isSource = p.id === combSourceId;
      const tag = p._mergeTag || "";
      const tagIcon = mergeTagIcon(tag);

      // Determinar botón COMB según estado
      let combBtn = "";
      if (isSource) {
        combBtn = `<button class="btn secondary btn-comb-cancel" data-id="${p.id}" style="font-size:11px; color:#c0392b; border-color:#c0392b;">Cancelar</button>`;
      } else if (isCombMode) {
        combBtn = `<button class="btn secondary btn-comb-with" data-id="${p.id}" style="font-size:11px;">COMB. CON</button>`;
      } else {
        combBtn = `<button class="btn secondary btn-comb" data-id="${p.id}" style="font-size:11px;">COMB</button>`;
      }

      const item = el(`
        <div class="item" style="${isSource ? 'background:#fff8e7; border-left:3px solid #f39c12;' : ''}">
          <div style="flex:1; min-width:0;">
            <div>
              <b>${p.apellido || ""} ${p.nombre || ""}</b>
              <span class="badge">${p.id}</span>
              ${tagIcon}
            </div>
            <div class="muted dx-line" style="font-style:italic;">Cargando dx...</div>
          </div>
          <div class="row" style="gap:6px; flex-wrap:wrap;">
            <a class="btn secondary" href="#/patient/${p.id}" style="font-size:12px;">Ver</a>
            ${!isCombMode ? `<button class="btn secondary btn-edit" data-id="${p.id}" style="font-size:12px;">Editar</button>` : ""}
            ${combBtn}
          </div>
        </div>
      `);

      $list.appendChild(item);

      // Dx asíncrono
      const $dx = item.querySelector(".dx-line");
      getLastDx(p.id).then(dx => {
        $dx.textContent = dx ? `Dx: ${dx}` : "Sin diagnóstico registrado";
      });
    }

    // ── Listeners COMB ────────────────────────────────────────────────────
    root.querySelectorAll(".btn-comb").forEach(btn => {
      btn.addEventListener("click", () => {
        combSourceId = btn.getAttribute("data-id");
        draw();
      });
    });

    root.querySelectorAll(".btn-comb-cancel").forEach(btn => {
      btn.addEventListener("click", cancelComb);
    });

    root.querySelectorAll(".btn-comb-with").forEach(btn => {
      btn.addEventListener("click", async () => {
        const targetId = btn.getAttribute("data-id");
        const sourcePatient = Store.getPatient(combSourceId);
        const targetPatient = Store.getPatient(targetId);
        if (!sourcePatient || !targetPatient) return toast("Paciente no encontrado");

        // El más reciente por updatedAt es la base
        const baseIsSource = (sourcePatient.updatedAt || "") >= (targetPatient.updatedAt || "");
        const base = baseIsSource ? sourcePatient : targetPatient;
        const other = baseIsSource ? targetPatient : sourcePatient;

        combSourceId = null;

        // Abrir modal de fusión
        await showMergeReview({
          base,
          other,
          reason: "manual",
          onFusionar: async (mergedFields) => {
            try {
              const res = await Bridge.call("mergePatients", {
                baseId: base.id,
                otherId: other.id,
                mergedFields,
              });
              if (!res || res.ok !== true) return toast("Error al fusionar");
              toast("Pacientes fusionados ✓");
              await Store.refreshPatients();
              draw();
            } catch (e) {
              console.error(e);
              toast("Error al fusionar");
            }
          },
          onCancelar: () => draw(),
        });
      });
    });

    // ── Listeners Editar ──────────────────────────────────────────────────
    root.querySelectorAll(".btn-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const p = Store.getPatient(id);
        if (!p) return toast("Paciente no encontrado");
        fillForm(p);
        toggleForm(true);
        setTimeout(() => $apellido.focus(), 0);
      });
    });
  };

  // ── Filtros E ─────────────────────────────────────────────────────────────
  $btnFilterDx.addEventListener("click", () => {
    filterSinDx = !filterSinDx;
    $btnFilterDx.style.background = filterSinDx ? "#e67e2222" : "";
    $btnFilterDx.style.borderColor = filterSinDx ? "#e67e22" : "";
    $btnFilterDx.style.color = filterSinDx ? "#e67e22" : "";
    draw();
  });

  $btnFilterEp.addEventListener("click", () => {
    filterSinEp = !filterSinEp;
    $btnFilterEp.style.background = filterSinEp ? "#8e44ad22" : "";
    $btnFilterEp.style.borderColor = filterSinEp ? "#8e44ad" : "";
    $btnFilterEp.style.color = filterSinEp ? "#8e44ad" : "";
    draw();
  });

  $q.addEventListener("input", draw);

  $btnToggleNew.addEventListener("click", () => {
    if ($newWrap.classList.contains("hidden")) {
      clearForm();
      toggleForm(true);
      setTimeout(() => $apellido.focus(), 0);
    } else {
      toggleForm(false);
    }
  });

  $btnCancel.addEventListener("click", () => {
    clearForm();
    toggleForm(false);
  });

  $btnSave.addEventListener("click", async () => {
    const apellido = $apellido.value.trim();
    const nombre = $nombre.value.trim();
    if (!apellido) return toast("Falta el apellido");
    if (!nombre) return toast("Falta el nombre");

    const isEdit = !!editingId;

    const patient = {
      id: isEdit ? editingId : uid("P"),
      apellido,
      nombre,
      dni: $dni.value.trim(),
      telefono: $tel.value.trim(),
      email: $email.value.trim(),
      notas: $notas.value.trim(),
      activo: true,
    };

    $btnSave.disabled = true;
    try {
      const res = await Bridge.upsertPatient(patient);
      if (!res || res.ok !== true) {
        throw new Error("upsertPatient devolvió respuesta inválida: " + JSON.stringify(res));
      }
      toast(isEdit ? "Paciente actualizado" : "Paciente creado");
      clearForm();
      toggleForm(false);
      await Store.refreshPatients();
      draw();
      location.hash = `#/patient/${patient.id}`;
    } catch (e) {
      console.error(e);
      toast("Error guardando paciente (ver DEBUG)");
      if (window.__DBG__) window.__DBG__("[SAVE PATIENT ERROR] " + (e?.message || e));
    } finally {
      $btnSave.disabled = false;
    }
  });

  draw();
  return root;
}

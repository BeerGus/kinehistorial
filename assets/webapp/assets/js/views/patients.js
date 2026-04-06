import { el, toast, uid } from "../ui.js";
import { Store } from "../store.js";
import { Bridge } from "../bridge.js";

let editingId = null;

// ── Helper: último dx de un paciente ─────────────────────────────────────────
// Busca en las entradas ACTIVE del paciente la más reciente cuyo título
// contenga 'dx' (case-insensitive). Retorna el título o null.
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
        // Desempate por createdAt completo (con hora)
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
    return dxEntries.length > 0 ? dxEntries[0].titulo : null;
  } catch (_) {
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export async function renderPatients() {
  await Store.refreshPatients();

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

  const draw = async () => {
    const q = ($q.value || "").toLowerCase().trim();

    const items = Store.patients.filter(p => {
      const s = `${p.nombre || ""} ${p.apellido || ""} ${p.dni || ""}`.toLowerCase();
      return s.includes(q);
    });

    $count.textContent = String(items.length);
    $list.innerHTML = "";

    if (items.length === 0) {
      $list.appendChild(el(`<div class="muted">Sin resultados.</div>`));
      return;
    }

    // Renderizar cada paciente con su último dx (carga asíncrona)
    for (const p of items) {
      const item = el(`
        <div class="item">
          <div style="flex:1; min-width:0;">
            <div>
              <b>${p.apellido || ""} ${p.nombre || ""}</b>
              <span class="badge">${p.id}</span>
            </div>
            <div class="muted dx-line" style="font-style:italic;">Cargando dx...</div>
          </div>
          <div class="row">
            <a class="btn secondary" href="#/patient/${p.id}">Ver</a>
            <button class="btn secondary btn-edit" data-id="${p.id}">Editar</button>
          </div>
        </div>
      `);

      $list.appendChild(item);

      // Cargar dx de forma asíncrona para no bloquear el render
      const $dx = item.querySelector(".dx-line");
      getLastDx(p.id).then(dx => {
        $dx.textContent = dx ? `Dx: ${dx}` : "Sin diagnóstico registrado";
      });
    }

    // Listeners de editar
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

  // Eventos UI
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
      console.log("upsertPatient res:", res);

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

  // init
  draw();
  return root;
}

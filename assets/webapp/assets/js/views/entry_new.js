import { el, toast, fileToBase64, uid } from "../ui.js";
import { Bridge } from "../bridge.js";

function isoToYMD(iso) {
  try { return String(iso).slice(0, 10); } catch { return ""; }
}

export function renderEntryNew({ id }) {
  const createdAt = new Date().toISOString();
  const defaultEventDate = isoToYMD(createdAt);

  const root = el(`
    <section class="card">
      <h1 class="h1">Nueva entrada · <span class="badge">${id}</span></h1>

      <div class="spacer"></div>

      <label class="muted">Fecha *</label>
      <input class="input" id="eventDate" type="date" />

      <div class="spacer"></div>

      <label class="muted">Título *</label>
      <input class="input" id="titulo" placeholder="Ej: Sesión 1, Evaluación, Evolución..." />

      <div class="spacer"></div>

      <label class="muted">Detalle</label>
      <textarea class="textarea" id="contenido" placeholder="Texto libre..."></textarea>

      <div class="spacer"></div>

      <!-- ✅ NUEVO (1 línea, texto libre) -->
      <label class="muted">Notas privadas del profesional (opcional)</label>
      <input class="input" id="proNote" placeholder="Notas privadas (no se incluyen en la historia clínica si no querés)..." />

      <div class="spacer"></div>

      <label class="muted">Adjuntos</label>
      <input class="input" type="file" id="files" multiple />

      <div class="spacer"></div>

      <div class="row">
        <button class="btn" id="save">Guardar</button>
        <a class="btn secondary" href="#/patient/${id}">Cancelar</a>
      </div>
    </section>
  `);

  const $eventDate = root.querySelector("#eventDate");
  const $save = root.querySelector("#save");
  $eventDate.value = defaultEventDate;

  $save.addEventListener("click", async () => {
    const eventDate = ($eventDate.value || "").trim();
    const titulo = root.querySelector("#titulo").value.trim();
    const contenido = root.querySelector("#contenido").value.trim();
    const proNote = root.querySelector("#proNote").value.trim();
    const files = Array.from(root.querySelector("#files").files || []);

    if (!eventDate) return toast("Falta la fecha");
    if (!titulo) return toast("Falta el título");

    $save.disabled = true;
    try {
      const filesBase64 = [];
      for (const f of files) {
        const b64 = await fileToBase64(f);
        filesBase64.push({
          name: f.name,
          mime: f.type || "application/octet-stream",
          base64: b64
        });
      }

      const entry = {
        id: uid("E"),
        patientId: id,
        eventDate,
        titulo,
        contenido,
        proNote, // ✅ guardado como string
        attachments: [],
        status: "ACTIVE",
        version: 0,
        createdAt,
        updatedAt: createdAt,
        audit: [{ ts: createdAt, action: "CREADA" }],
        versions: []
      };

      const res = await Bridge.addEntry(entry, filesBase64);
      if (res?.ok) {
        toast("Entrada guardada");
        location.hash = `#/patient/${id}`;
      } else {
        toast("Error al guardar");
      }
    } catch (e) {
      console.error(e);
      toast("Error al guardar");
    } finally {
      $save.disabled = false;
    }
  });

  return root;
}
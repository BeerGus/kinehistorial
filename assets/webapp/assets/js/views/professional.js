import { el, toast, escapeHtml } from "../ui.js";
import { Bridge } from "../bridge.js";

export async function renderProfessional() {
  const cfg = (await Bridge.call("getConfig")) || {};
  const pro = cfg.professional || {};

  const isComplete = !!(pro.nombre && pro.apellido && pro.titulo && pro.matricula);

  const root = el(`
    <section class="card">
      <div class="row" style="justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <h1 class="h1">Datos del profesional</h1>
          <div class="muted">Estos datos se incluyen en la historia clínica exportable y en los snapshots.</div>
        </div>
        <a class="btn secondary" href="#/">Volver</a>
      </div>

      ${!isComplete ? `
        <div style="
          margin: 14px 0 4px;
          background: #fff8e7;
          border: 1px solid #f5c842;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 13px;
          color: #7a5800;
        ">
          ⚠ Perfil incompleto. Completá nombre, apellido, título y matrícula para poder generar historias clínicas.
        </div>
      ` : `
        <div style="
          margin: 14px 0 4px;
          background: #eafaf1;
          border: 1px solid #6fcf97;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 13px;
          color: #1a5c35;
        ">
          ✓ Perfil completo.
        </div>
      `}

      <div class="spacer"></div>

      <div class="grid two">
        <div>
          <label class="muted">Nombre *</label>
          <input class="input" id="pro_nombre" placeholder="Ej: Juan" value="${escapeHtml(pro.nombre || "")}" />
        </div>
        <div>
          <label class="muted">Apellido *</label>
          <input class="input" id="pro_apellido" placeholder="Ej: Pérez" value="${escapeHtml(pro.apellido || "")}" />
        </div>
      </div>

      <div class="spacer"></div>

      <div class="grid two">
        <div>
          <label class="muted">Documento (DNI)</label>
          <input class="input" id="pro_documento" placeholder="Opcional" value="${escapeHtml(pro.documento || "")}" />
        </div>
        <div>
          <label class="muted">Título *</label>
          <input class="input" id="pro_titulo" placeholder="Ej: Lic. en Kinesiología" value="${escapeHtml(pro.titulo || "")}" />
        </div>
      </div>

      <div class="spacer"></div>

      <div>
        <label class="muted">Matrícula *</label>
        <input class="input" id="pro_matricula" placeholder="Ej: Mat. Nac. 12345" value="${escapeHtml(pro.matricula || "")}" />
      </div>

      <div class="spacer"></div>
      <div style="height:1px; background:var(--border);"></div>
      <div class="spacer"></div>

      <div class="muted" style="font-size:13px; margin-bottom:10px;">Información del dispositivo</div>
      <div class="grid two">
        <div>
          <label class="muted">Sistema operativo</label>
          <input class="input" value="${escapeHtml(cfg.device?.os || "-")}" disabled />
        </div>
        <div>
          <label class="muted">Nombre del equipo (detectado)</label>
          <input class="input" value="${escapeHtml(cfg.device?.name || "-")}" disabled />
        </div>
      </div>

      <div class="spacer"></div>

      <div>
        <label class="muted">Alias del dispositivo (opcional)</label>
        <input class="input" id="dev_alias" placeholder="Ej: Consultorio, Notebook casa, Tablet..." value="${escapeHtml(cfg.device?.alias || "")}" />
        <div class="muted" style="font-size:12px; margin-top:4px;">Este alias identifica el equipo en los snapshots exportados.</div>
      </div>

      <div class="spacer"></div>

      <div class="row">
        <button class="btn primary" id="btnSavePro">Guardar datos</button>
        <a class="btn secondary" href="#/">Cancelar</a>
      </div>
    </section>
  `);

  root.querySelector("#btnSavePro").addEventListener("click", async () => {
    const nombre    = root.querySelector("#pro_nombre").value.trim();
    const apellido  = root.querySelector("#pro_apellido").value.trim();
    const documento = root.querySelector("#pro_documento").value.trim();
    const titulo    = root.querySelector("#pro_titulo").value.trim();
    const matricula = root.querySelector("#pro_matricula").value.trim();

    if (!nombre)    return toast("Falta el nombre");
    if (!apellido)  return toast("Falta el apellido");
    if (!titulo)    return toast("Falta el título");
    if (!matricula) return toast("Falta la matrícula");

    const btn = root.querySelector("#btnSavePro");
    btn.disabled = true;
    try {
      const res = await Bridge.call("saveConfig", {
        professional: { nombre, apellido, documento, titulo, matricula },
        deviceAlias: root.querySelector("#dev_alias").value.trim(),
      });
      if (!res || res.ok !== true) throw new Error("saveConfig falló");
      toast("Datos guardados ✓");
      // Recargar la vista para actualizar el indicador
      setTimeout(() => window.__RENDER__?.(), 300);
    } catch (e) {
      console.error(e);
      toast("Error guardando datos");
    } finally {
      btn.disabled = false;
    }
  });

  return root;
}

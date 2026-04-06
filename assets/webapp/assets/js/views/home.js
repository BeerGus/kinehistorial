function isoShort(iso) {
  if (!iso) return "-";
  if (iso.length >= 16) return iso.slice(0, 10) + " " + iso.slice(11, 16);
  return iso;
}

// ── Modal About ──────────────────────────────────────────────────────────────
function showAbout() {
  if (document.getElementById("aboutModal")) return;

  const overlay = document.createElement("div");
  overlay.id = "aboutModal";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(11, 34, 51, 0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 24px 20px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 12px 40px rgba(10,40,70,0.18);
      position: relative;
    ">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:18px;">
        <div>
          <div style="font-size:20px; font-weight:700; color:var(--text);">KineHistorial</div>
          <div style="font-size:13px; color:var(--muted); margin-top:3px;">
            Versión <strong>3.0.5</strong> &nbsp;·&nbsp; Doc funcional <strong>v3.0</strong>
          </div>
        </div>
        <button id="aboutClose" style="
          background:none; border:none; cursor:pointer;
          font-size:20px; color:var(--muted); padding:4px 8px;
          border-radius:8px; line-height:1;
        " aria-label="Cerrar">✕</button>
      </div>

      <div style="
        background: var(--primary-2);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 14px;
        font-size: 13px;
        color: var(--text);
        line-height: 1.5;
        margin-bottom: 16px;
      ">
        <div style="font-weight:600; margin-bottom:6px;">⚕ Uso profesional</div>
        Esta aplicación es una herramienta de apoyo para profesionales de la salud.
        No reemplaza el criterio clínico del profesional ni constituye un sistema de salud
        certificado. El profesional es responsable del uso y resguardo de la información
        ingresada.
      </div>

      <div style="font-size:13px; color:var(--muted); line-height:1.6;">
        <div>Desarrollado para uso en consultorio, sin conexión a internet.</div>
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
          © 2025 – KineHistorial
        </div>
      </div>

      <div style="margin-top:18px; text-align:right;">
        <button id="aboutCloseBtn" class="btn primary" style="min-width:90px;">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#aboutClose").addEventListener("click", close);
  overlay.querySelector("#aboutCloseBtn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

// ── Modal Confirmar Restaurar ─────────────────────────────────────────────────
function showRestoreConfirm(onConfirm) {
  if (document.getElementById("restoreModal")) return;

  const overlay = document.createElement("div");
  overlay.id = "restoreModal";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(11, 34, 51, 0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 24px 20px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 12px 40px rgba(10,40,70,0.18);
    ">
      <div style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:12px;">
        Restaurar datos anteriores
      </div>
      <div style="font-size:14px; color:var(--text); line-height:1.6; margin-bottom:20px;">
        ¿Deseás restaurar los datos al estado previo a la última importación?<br><br>
        <span style="color:var(--muted); font-size:13px;">
          Esta acción reemplazará los datos actuales con el backup generado antes del merge.
        </span>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="restoreCancel" class="btn secondary">Cancelar</button>
        <button id="restoreConfirm" class="btn primary" style="background:#c0392b; border-color:#c0392b;">Restaurar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#restoreCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#restoreConfirm").addEventListener("click", async () => {
    const btn = overlay.querySelector("#restoreConfirm");
    btn.disabled = true;
    btn.textContent = "Restaurando...";
    close();
    await onConfirm();
  });

  const onKey = (e) => {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
}

// ── Vista Home ────────────────────────────────────────────────────────────────
export function renderHome() {
  const root = document.createElement("div");

  const card = document.createElement("section");
  card.className = "card";

  const h = document.createElement("h2");
  h.className = "h2";
  h.textContent = "Inicio";

  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = "Historial médico de kinesiología (offline).";

  const metaBox = document.createElement("div");
  metaBox.className = "muted";
  metaBox.style.cssText = "margin-top:8px; display:grid; gap:4px;";

  const lineExport = document.createElement("div");
  const lineImport = document.createElement("div");
  lineExport.textContent = "Última exportación: -";
  lineImport.textContent = "Última importación: -";
  metaBox.appendChild(lineExport);
  metaBox.appendChild(lineImport);

  // Fila del botón restaurar — oculta por defecto, visible solo si hay backup de merge
  const restoreRow = document.createElement("div");
  restoreRow.style.cssText = "margin-top:6px; display:none;";
  const btnRestore = document.createElement("button");
  btnRestore.className = "btn secondary";
  btnRestore.type = "button";
  btnRestore.style.cssText = "font-size:12px; padding:4px 12px; color:#c0392b; border-color:#c0392b;";
  btnRestore.textContent = "↩ Restaurar datos anteriores al merge";
  restoreRow.appendChild(btnRestore);
  metaBox.appendChild(restoreRow);

  (async () => {
    try {
      const callHandler = window.flutter_inappwebview?.callHandler;
      if (!callHandler) return;
      const meta = await callHandler("getMeta");
      if (!meta) return;

      lineExport.textContent = `Última exportación: ${isoShort(meta.lastExportAt)}`;

      if (meta.lastImportAt) {
        const snap = meta.lastImportedSnapshot || {};
        lineImport.textContent =
          `Última importación: ${isoShort(meta.lastImportAt)} | ` +
          `Contenido: ${snap.patientsCount ?? "?"} pacientes, ${snap.entriesCount ?? "?"} entradas | ` +
          `De fecha: ${isoShort(snap.exportedAt)} | Origen: ${snap.deviceName || "desconocido"} (${snap.deviceType || "dispositivo desconocido"})`;

        // Mostrar restaurar solo si el último import fue un merge con backup disponible
        if (snap.mergeMode === "merge" && snap.backupPath) {
          restoreRow.style.display = "block";
          btnRestore.addEventListener("click", () => {
            showRestoreConfirm(async () => {
              try {
                const res = await callHandler("restoreBackup", { backupPath: snap.backupPath });
                if (res?.ok) {
                  window.__RENDER__?.();
                } else {
                  alert("No se pudo restaurar. El archivo de backup puede haber sido eliminado.");
                }
              } catch (e) {
                console.error(e);
                alert("Error al restaurar: " + (e?.message || e));
              }
            });
          });
        }
      } else {
        lineImport.textContent = "Última importación: -";
      }
    } catch (_) {}
  })();

  const actions = document.createElement("div");
  actions.className = "row";
  actions.style.cssText = "gap:10px; flex-wrap:wrap; margin-top:14px;";

  const btnPacientes = document.createElement("button");
  btnPacientes.className = "btn primary";
  btnPacientes.type = "button";
  btnPacientes.textContent = "Ir a pacientes";
  btnPacientes.addEventListener("click", () => { location.hash = "#/patients"; });

  const btnAbout = document.createElement("button");
  btnAbout.className = "btn secondary";
  btnAbout.type = "button";
  btnAbout.textContent = "Acerca de";
  btnAbout.addEventListener("click", showAbout);

  actions.appendChild(btnPacientes);
  actions.appendChild(btnAbout);

  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(metaBox);
  card.appendChild(actions);
  root.appendChild(card);

  return root;
}

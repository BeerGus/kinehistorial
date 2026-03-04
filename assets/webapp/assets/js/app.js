import { renderHome } from "./views/home.js";
import { renderPatients } from "./views/patients.js";
import { renderPatientDetail } from "./views/patient_detail.js";
import { renderEntryNew } from "./views/entry_new.js";
import { renderEntryEdit } from "./views/entry_edit.js";
import { renderProfessional } from "./views/professional.js";
import { parseRoute } from "./router.js";

console.log("[SMOKE] app.js ejecutó");
console.log("[BOOT] app.js cargó");

const app = document.getElementById("app");

function dbg(msg) {
  try { if (window.__DBG__) window.__DBG__(msg); } catch {}
}

// ✅ Token para evitar renders en paralelo (race condition)
let renderToken = 0;

async function render() {
  const token = ++renderToken;

  try {
    dbg("[BOOT] render...");

    // Limpio al inicio (OK)
    app.innerHTML = "";
    // #/patient/<pid>/entry/<eid>/edit
    const mEdit = location.hash.match(/^#\/patient\/([^/]+)\/entry\/([^/]+)\/edit(?:\?.*)?$/);
    if (mEdit) {
      const patientId = mEdit[1];
      const entryId = mEdit[2];
      const view = await renderEntryEdit(patientId, entryId);

      if (token !== renderToken) return;

      app.replaceChildren(view);
      return;
    }

    const route = parseRoute(location.hash);
    dbg(`[ROUTE] ${route.name}`);

    let view;

    if (route.name === "home") view = renderHome();
    else if (route.name === "patients") view = await renderPatients();
    else if (route.name === "patient_detail") view = await renderPatientDetail(route.params);
    else if (route.name === "entry_new") view = renderEntryNew(route.params);
    else if (route.name === "professional") view = await renderProfessional();
    else view = renderHome();

    if (token !== renderToken) return;
    app.replaceChildren(view);
  } catch (e) {
    console.error(e);
    dbg("[RENDER ERROR] " + (e?.message || e));
    app.innerHTML = `<div class="card">Error: ${String(e?.message || e)}</div>`;
  }
}

window.addEventListener("hashchange", render);
window.__RENDER__ = render; // ✅ para refrescar sin cambiar hash
render();
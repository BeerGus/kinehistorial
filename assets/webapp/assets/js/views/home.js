function isoShort(iso) {
  if (!iso) return "-";
  if (iso.length >= 16) return iso.slice(0, 10) + " " + iso.slice(11, 16);
  return iso;
}

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
  metaBox.style.marginTop = "8px";
  metaBox.style.display = "grid";
  metaBox.style.gap = "4px";

  const lineExport = document.createElement("div");
  const lineImport = document.createElement("div");

  lineExport.textContent = "Última exportación: -";
  lineImport.textContent = "Última importación: -";

  metaBox.appendChild(lineExport);
  metaBox.appendChild(lineImport);

  // Carga async
  (async () => {
    try {
      const callHandler = window.flutter_inappwebview?.callHandler;
      if (!callHandler) return;

      const meta = await callHandler("getMeta");
      if (!meta) return;

      const exAt = isoShort(meta.lastExportAt);

      lineExport.textContent = `Última exportación: ${exAt}`;

      if (meta.lastImportAt) {
        const imAt = isoShort(meta.lastImportAt);
        const snap = meta.lastImportedSnapshot || {};
        const snapExpAt = isoShort(snap.exportedAt);
        const snapDev = snap.deviceName || "desconocido";
        const snapP = snap.patientsCount ?? "?";
        const snapE = snap.entriesCount ?? "?";

        lineImport.textContent =
          `Última importación: ${imAt} | Zip: ${snapP} pacientes, ${snapE} entradas | Exportado: ${snapExpAt} | Origen: ${snapDev}`;
      } else {
        lineImport.textContent = "Última importación: -";
      }
    } catch (_) {
      // silencioso
    }
  })();

  const actions = document.createElement("div");
  actions.className = "row";
  actions.style.gap = "10px";
  actions.style.flexWrap = "wrap";

  const btn = document.createElement("button");
  btn.className = "btn primary";
  btn.type = "button";
  btn.textContent = "Ir a pacientes";
  btn.addEventListener("click", () => {
    location.hash = "#/patients";
  });

  actions.appendChild(btn);

  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(metaBox);
  card.appendChild(actions);

  root.appendChild(card);

  return root;
}
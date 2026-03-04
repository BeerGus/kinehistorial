export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> t.classList.add("hidden"), 2200);
}

export function uid(prefix="P") {
  // simple: P + 4 dígitos (después lo hacemos mejor si querés)
  const n = Math.floor(Math.random()*9000)+1000;
  return `${prefix}${n}`;
}

export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i=0; i<bytes.length; i+=chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  }
  return btoa(binary);
}
export function fmtDT(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function auditPanel({ createdAt, updatedAt, audit }) {
  const last3 = (audit || []).slice(-3).reverse();

  const chips = last3.map(e => {
    const action = e.action || "?";
    const ts = fmtDT(e.ts);
    const fields = (e.fields && e.fields.length) ? ` · ${e.fields.join(", ")}` : "";
    return `<div class="chip">${action} · ${ts}${fields}</div>`;
  }).join("");

  return `
    <div class="card" style="background:#fafbff;border-style:dashed">
      <div class="grid two">
        <div><div class="muted">Creado</div><div><b>${fmtDT(createdAt)}</b></div></div>
        <div><div class="muted">Últ. modificación</div><div><b>${fmtDT(updatedAt)}</b></div></div>
      </div>
      <div class="spacer"></div>
      <div class="muted">Últimas 3 acciones</div>
      <div class="chips">${chips || "<div class='muted'>Sin historial</div>"}</div>
    </div>
  `;
}
export function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function auditPanelSimple({ createdAt, updatedAt, audit }) {
  const last3 = (audit || []).slice(-3).reverse();

  const chips = last3.map(e => {
    const action = e.action || "?";
    const ts = fmtDT(e.ts);
    return `<div class="chip">${action} · ${ts}</div>`;
  }).join("");

  return `
    <div class="card" style="background:#fafbff;border-style:dashed">
      <div class="grid two">
        <div><div class="muted">Creado</div><div><b>${fmtDT(createdAt)}</b></div></div>
        <div><div class="muted">Últ. modificación</div><div><b>${fmtDT(updatedAt)}</b></div></div>
      </div>
      <div class="spacer"></div>
      <div class="muted">Últimas 3 acciones</div>
      <div class="chips">${chips || "<div class='muted'>Sin historial</div>"}</div>
    </div>
  `;
}

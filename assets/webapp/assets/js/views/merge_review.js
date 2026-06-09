// ── merge_review.js ───────────────────────────────────────────────────────────
// Modal de revisión de duplicados. Usado tanto en el merge automático del
// import como en la combinación manual desde la lista de pacientes.
//
// Parámetros:
//   base        — paciente base (el que conserva el ID)
//   other       — paciente a fusionar/ignorar
//   reason      — "auto" (viene del import) | "manual" (acción del usuario)
//   onFusionar  — async (mergedFields) => void
//   onIgnorar   — async () => void  (solo para reason="auto")
//   onAmbos     — async () => void  (solo para reason="auto")
//   onCancelar  — () => void        (solo para reason="manual")
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from "../ui.js";

const FIELDS = [
  { key: "apellido",  label: "Apellido" },
  { key: "nombre",    label: "Nombre" },
  { key: "dni",       label: "DNI" },
  { key: "telefono",  label: "Teléfono" },
  { key: "email",     label: "Email" },
  { key: "notas",     label: "Notas" },
];

export function showMergeReview({
  base,
  other,
  reason = "auto",
  onFusionar,
  onIgnorar,
  onAmbos,
  onCancelar,
}) {
  return new Promise((resolve) => {
    if (document.getElementById("mergeReviewModal")) return resolve();

    const overlay = document.createElement("div");
    overlay.id = "mergeReviewModal";
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9500;
      background: rgba(11, 34, 51, 0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; overflow-y: auto;
    `;

    // Estado de selección por campo: "base" o "other"
    const selected = {};
    for (const f of FIELDS) {
      // Por defecto gana el que tiene valor; si ambos tienen, gana base
      const bVal = (base[f.key] || "").trim();
      const oVal = (other[f.key] || "").trim();
      selected[f.key] = (oVal && !bVal) ? "other" : "base";
    }

    const renderFields = () => {
      return FIELDS.map(f => {
        const bVal = (base[f.key] || "").trim() || "-";
        const oVal = (other[f.key] || "").trim() || "-";
        const same = bVal === oVal;

        const selBase = selected[f.key] === "base";
        const selOther = selected[f.key] === "other";

        if (same) {
          return `
            <div style="margin-bottom:10px;">
              <div style="font-size:12px; color:var(--muted); margin-bottom:3px;">${f.label}</div>
              <div style="font-size:13px; padding:6px 10px; background:#f0f7f0; border-radius:8px; color:#2d6a2d;">
                ${escapeHtml(bVal)} <span style="color:#aaa; font-size:11px;">(igual en ambos)</span>
              </div>
            </div>`;
        }

        return `
          <div style="margin-bottom:10px;">
            <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">${f.label}</div>
            <div style="display:flex; gap:8px;">
              <button class="field-btn" data-field="${f.key}" data-side="base" style="
                flex:1; padding:6px 8px; border-radius:8px; font-size:12px; text-align:left; cursor:pointer;
                border:2px solid ${selBase ? "#2E5E8E" : "#ddd"};
                background:${selBase ? "#e8f0f8" : "#fafafa"};
                color:${selBase ? "#1a3a5c" : "#555"};
              ">
                <div style="font-size:10px; color:var(--muted); margin-bottom:2px;">Local</div>
                ${escapeHtml(bVal)}
              </button>
              <button class="field-btn" data-field="${f.key}" data-side="other" style="
                flex:1; padding:6px 8px; border-radius:8px; font-size:12px; text-align:left; cursor:pointer;
                border:2px solid ${selOther ? "#e67e22" : "#ddd"};
                background:${selOther ? "#fff3e0" : "#fafafa"};
                color:${selOther ? "#7a3c00" : "#555"};
              ">
                <div style="font-size:10px; color:var(--muted); margin-bottom:2px;">Importado</div>
                ${escapeHtml(oVal)}
              </button>
            </div>
          </div>`;
      }).join("");
    };

    const buildContent = () => `
      <div style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 28px 24px 20px;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 12px 40px rgba(10,40,70,0.18);
      ">
        <div style="font-size:17px; font-weight:700; color:var(--text); margin-bottom:4px;">
          Posible duplicado detectado
        </div>
        <div style="font-size:13px; color:var(--muted); margin-bottom:16px;">
          ${reason === "auto"
            ? "Se encontró un paciente similar en el snapshot importado. Elegí qué hacer:"
            : "Seleccioná qué valor conservar en cada campo para fusionar estos pacientes:"}
        </div>

        <div id="fieldsContainer">
          ${renderFields()}
        </div>

        <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
          <div style="font-size:12px; color:var(--muted); margin-bottom:10px;">
            Las entradas clínicas de ambos pacientes se unificarán en el resultado.
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            ${reason === "auto" ? `
              <button id="btnAmbos" class="btn secondary" style="font-size:13px;">Continuar con ambos</button>
              <button id="btnIgnorar" class="btn secondary" style="font-size:13px;">Ignorar importado</button>
            ` : `
              <button id="btnCancelar" class="btn secondary" style="font-size:13px;">Cancelar</button>
            `}
            <button id="btnFusionar" class="btn primary" style="font-size:13px;">Fusionar</button>
          </div>
        </div>
      </div>
    `;

    overlay.innerHTML = buildContent();
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); resolve(); };

    // Delegación de clicks en los field-btn
    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest(".field-btn");
      if (btn) {
        const field = btn.getAttribute("data-field");
        const side = btn.getAttribute("data-side");
        selected[field] = side;
        // Re-render solo el contenedor de campos
        overlay.querySelector("#fieldsContainer").innerHTML = renderFields();
        return;
      }

      if (e.target === overlay) close();
    });

    overlay.querySelector("#btnFusionar").addEventListener("click", async () => {
      const mergedFields = {};
      for (const f of FIELDS) {
        mergedFields[f.key] = selected[f.key] === "base"
          ? (base[f.key] || "")
          : (other[f.key] || "");
      }
      close();
      await onFusionar?.(mergedFields);
    });

    if (reason === "auto") {
      overlay.querySelector("#btnIgnorar")?.addEventListener("click", async () => {
        close();
        await onIgnorar?.();
      });
      overlay.querySelector("#btnAmbos")?.addEventListener("click", async () => {
        close();
        await onAmbos?.();
      });
    } else {
      overlay.querySelector("#btnCancelar")?.addEventListener("click", () => {
        close();
        onCancelar?.();
      });
    }

    const onKey = (e) => {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);
  });
}

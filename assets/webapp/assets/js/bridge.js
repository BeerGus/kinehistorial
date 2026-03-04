// Bridge -> Flutter. Si no estás dentro de la app, hace mock para probar en navegador.
export const Bridge = {
  async call(name, payload = {}) {
    const w = window;
    if (w.flutter_inappwebview?.callHandler) {
      return await w.flutter_inappwebview.callHandler(name, payload);
    }
    console.warn(`[MOCK Bridge] ${name}`, payload);
    return await mockBridge(name, payload);
  },

  listPatients() { return this.call("listPatients"); },
  upsertPatient(patient) { return this.call("upsertPatient", { patient }); },

  listEntries(patientId) { return this.call("listEntries", { patientId }); },

  addEntry(entry, filesBase64 = []) {
    return this.call("addEntry", { entry, files: filesBase64 });
  },

  // ✅ vuelve a soportar adjuntos nuevos + quitar adjuntos existentes
  updateEntry(entry, filesBase64 = [], removeRelPaths = []) {
    return this.call("updateEntry", { entry, files: filesBase64, removeRelPaths });
  },

  exportSnapshotZip() { return this.call("exportSnapshotZip"); },
  importSnapshotZip() { return this.call("importSnapshotZip"); },

  openAttachment(relOrAbsPath) {
    return this.call("openAttachment", { relPath: relOrAbsPath });
  },

  openPath(path) {
    return this.call("openPath", { path });
  },

  getConfig() { return this.call("getConfig"); },
  saveConfig(data) { return this.call("saveConfig", data); },

  async eliminateEntry(patientId, entryId) {
    const entries = await this.listEntries(patientId);
    const e = (entries || []).find(x => String(x.id) === String(entryId));
    if (!e) return { ok: false, error: "Entry no encontrada" };

    const now = new Date().toISOString();
    const nextVersion = Number.isFinite(+e.version) ? (+e.version + 1) : 1;

    const patched = {
      ...e,
      status: "ELIMINATED",
      updatedAt: now,
      version: nextVersion,
      audit: Array.isArray(e.audit)
        ? [...e.audit, { ts: now, action: "ELIMINATED" }]
        : [{ ts: now, action: "ELIMINATED" }],
    };

    return await this.updateEntry(patched, [], []);
  },
};

// ---- Mock mínimo ----
let _patients = [];
let _entries = [];

async function mockBridge(name, payload) {
  if (name === "listPatients") return _patients;

  if (name === "upsertPatient") {
    const p = payload.patient;
    const i = _patients.findIndex(x => x.id === p.id);
    if (i >= 0) _patients[i] = p; else _patients.push(p);
    return { ok: true };
  }

  if (name === "listEntries") {
    return _entries.filter(e => e.patientId === payload.patientId);
  }

  if (name === "addEntry") {
    _entries.push(payload.entry);
    return { ok: true };
  }

  if (name === "updateEntry") {
    const e = payload.entry;
    const i = _entries.findIndex(x => x.id === e.id);
    if (i >= 0) _entries[i] = { ..._entries[i], ...e };
    return { ok: true };
  }

  if (name === "getConfig") return { professional: {}, device: { os: "MOCK", name: "dev" } };
  if (name === "saveConfig") return { ok: true };

  if (name === "openAttachment") return { ok: true };
  if (name === "openPath") return { ok: true };
  if (name === "exportSnapshotZip") return { ok: true, path: "MOCK.zip" };
  if (name === "importSnapshotZip") return { ok: true };

  return { ok: true };
}
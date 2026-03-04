import { Bridge } from "./bridge.js";

export const Store = {
  patients: [],
  entriesByPatient: new Map(),

  async refreshPatients() {
    this.patients = await Bridge.listPatients();
    this.patients.sort((a,b)=> (a.apellido||"").localeCompare(b.apellido||""));
    return this.patients;
  },

  async refreshEntries(patientId) {
    const entries = await Bridge.listEntries(patientId);
    entries.sort((a,b)=> (b.fechaHora||"").localeCompare(a.fechaHora||""));
    this.entriesByPatient.set(patientId, entries);
    return entries;
  },

  getPatient(id){ return this.patients.find(p => p.id === id); },
};

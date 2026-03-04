export function parseRoute(hash) {
  const h = (hash || "#/").replace(/^#/, "");
  const parts = h.split("/").filter(Boolean); // ["patient","P0001"]
  if (parts.length === 0) return { name: "home", params: {} };

  if (parts[0] === "patients") return { name: "patients", params: {} };
  if (parts[0] === "patient" && parts[1] && parts[2] === "new-entry") {
    return { name: "entry_new", params: { id: parts[1] } };
  }
  if (parts[0] === "patient" && parts[1]) {
    return { name: "patient_detail", params: { id: parts[1] } };
  }
  return { name: "home", params: {} };
}

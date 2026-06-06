import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rciaqovopajrkdtuhkdo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F1wn2SYtPbldAoCV2j9f9w_-2ZqSf8C";
const SEASON = "2026";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
};

let currentUser = null;
let varieties = [];
let plantings = [];
let harvests = [];
let recipes = [];
let feedings = [];
let recipeVarietyIds = [];

const authView = $("#auth-view");
const appView = $("#app-view");
const authForm = $("#auth-form");
const authMsg = $("#auth-msg");

function showAuth() { authView.hidden = false; appView.hidden = true; }
async function showApp() {
  const { data: allowed } = await sb.rpc("is_allowed");
  if (!allowed) {
    await sb.auth.signOut();
    showAuth();
    authMsg.textContent = "Det här kontot har inte behörighet till appen ännu. Kontakta administratören.";
    authMsg.classList.add("error");
    return;
  }
  authView.hidden = true;
  appView.hidden = false;
  await loadAll();
}

authForm.addEventListener("submit", (e) => e.preventDefault());
authForm.querySelector('[data-action="login"]').addEventListener("click", async () => {
  authMsg.textContent = "";
  const { error } = await sb.auth.signInWithPassword({
    email: $("#email").value,
    password: $("#password").value,
  });
  if (error) { authMsg.textContent = error.message; authMsg.classList.add("error"); }
});
authForm.querySelector('[data-action="signup"]').addEventListener("click", async () => {
  authMsg.textContent = "";
  const { error } = await sb.auth.signUp({
    email: $("#email").value,
    password: $("#password").value,
  });
  if (error) { authMsg.textContent = error.message; authMsg.classList.add("error"); }
  else { authMsg.textContent = "Konto skapat — du är inloggad."; authMsg.classList.remove("error"); }
});
$("#logout").addEventListener("click", async () => { await sb.auth.signOut(); });

$("#export-btn").addEventListener("click", () => {
  const data = {
    app: "Evas odling",
    exported_at: new Date().toISOString(),
    varieties,
    plantings,
    harvests,
    recipes,
    feedings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `evas-odling-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  if (session) showApp();
  else showAuth();
});

// ---------------- TABS ----------------
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    $$(".tab-panel").forEach((p) => (p.hidden = true));
    $(`#tab-${btn.dataset.tab}`).hidden = false;
  });
});

// ---------------- LOAD ----------------
async function loadAll() {
  await Promise.all([loadVarieties(), loadPlantings(), loadHarvests(), loadRecipes(), loadFeedings()]);
  renderAll();
}
async function loadVarieties() {
  const { data, error } = await sb.from("tomato_varieties").select("*").order("name");
  if (error) return console.error(error);
  varieties = data;
}
async function loadPlantings() {
  const { data, error } = await sb
    .from("user_tomatoes")
    .select("*")
    .eq("season", SEASON)
    .order("created_at", { ascending: false });
  if (error) return console.error(error);
  plantings = data;
}
async function loadHarvests() {
  const { data, error } = await sb.from("harvests").select("*").order("harvested_at", { ascending: false });
  if (error) return console.error(error);
  harvests = data;
}
async function loadRecipes() {
  const { data, error } = await sb.from("recipes").select("*").order("name");
  if (error) return console.error(error);
  recipes = data;
}
async function loadFeedings() {
  const { data, error } = await sb
    .from("feedings")
    .select("*")
    .eq("season", SEASON)
    .order("fed_on", { ascending: false });
  if (error) return console.error(error);
  feedings = data;
}

function renderAll() {
  renderStats();
  renderLibrary();
  populatePlantingLocationFilter();
  renderPlantings();
  renderFeedings();
  renderHarvests();
  renderRecipes();
  populateVarietySelects();
}

// ---------------- STATS ----------------
function plantsForVariety(varietyId) {
  return plantings.filter((p) => p.variety_id === varietyId);
}
function plantCountAt(varietyId, locationPredicate) {
  return plantsForVariety(varietyId)
    .filter((p) => locationPredicate(p.location))
    .reduce((sum, p) => sum + (p.plant_count || 0), 0);
}
function totalPlants(varietyId) {
  return plantsForVariety(varietyId).reduce((sum, p) => sum + (p.plant_count || 0), 0);
}
function renderStats() {
  const total = plantings.reduce((s, p) => s + (p.plant_count || 0), 0);
  const pot = plantings.filter((p) => p.location === "Kruka").reduce((s, p) => s + (p.plant_count || 0), 0);
  const gh = plantings.filter((p) => p.location === "Växthus").reduce((s, p) => s + (p.plant_count || 0), 0);
  const box = plantings.filter((p) => p.location === "Planteringslåda").reduce((s, p) => s + (p.plant_count || 0), 0);
  const field = plantings.filter((p) => p.location === "Friland").reduce((s, p) => s + (p.plant_count || 0), 0);
  const rem = plantings.filter((p) => p.location === "Ej placerad").reduce((s, p) => s + (p.plant_count || 0), 0);
  $("#stat-total").textContent = total;
  $("#stat-pot").textContent = pot;
  $("#stat-greenhouse").textContent = gh;
  $("#stat-box").textContent = box;
  $("#stat-field").textContent = field;
  $("#stat-remaining").textContent = rem;
}

// ---------------- VARIETIES (Sorter) ----------------
const CATEGORY_PINK = new Set(["Bifftomat", "Körsbär", "Cocktail", "Plommon", "Körsbär/Cocktail", "Chili"]);
function tag(label, kind = "outline") {
  return el("span", { className: `tag ${kind}`, textContent: label });
}
function varietyIcon(v) {
  const n = (v.name || "").toLowerCase();
  if (v.category === "Chili") return "🌶️";
  if (n.includes("blåbär")) return "🫐";
  if (n.includes("vinbär")) return "🍇";
  return "🍅";
}
function heightText(v) {
  if (v.height_min_cm && v.height_max_cm) return `${v.height_min_cm}-${v.height_max_cm} cm`;
  if (v.height_min_cm) return `${v.height_min_cm} cm`;
  if (v.height_max_cm) return `${v.height_max_cm} cm`;
  return null;
}
function plantingSummary(v) {
  const total = totalPlants(v.id);
  if (total === 0) return null;
  const pot = plantCountAt(v.id, (l) => l === "Kruka");
  const gh = plantCountAt(v.id, (l) => l === "Växthus");
  const parts = [`${total} ${total === 1 ? "planta" : "plantor"}`];
  if (pot) parts.push(`${pot} i kruka`);
  if (gh) parts.push(`${gh} i växthus`);
  return parts.join(" · ");
}
function varietyCard(v) {
  const card = el("li", { className: "card" });
  const head = el("div", { className: "card-head" });
  head.append(el("h3", {}, el("span", { className: "tomato-icon", textContent: varietyIcon(v) }), v.name));
  card.append(head);

  const tags = el("div", { className: "tags" });
  if (v.category) tags.append(tag(v.category, CATEGORY_PINK.has(v.category) ? "pink" : "green"));
  if (v.growth_type) tags.append(tag(v.growth_type, "outline"));
  if (tags.children.length) card.append(tags);

  const meta = el("div", { className: "meta-list" });
  if (v.default_location) meta.append(metaRow("📍", v.default_location));
  const h = heightText(v);
  if (h) meta.append(metaRow("📏", h));
  if (v.pruning) meta.append(metaRow("✂️", v.pruning));
  const psum = plantingSummary(v);
  if (psum) meta.append(metaRow("🌱", psum));
  if (meta.children.length) card.append(meta);

  if (v.use_tags?.length) {
    const ut = el("div", { className: "use-tags" });
    for (const t of v.use_tags) ut.append(tag(t, "beige"));
    card.append(ut);
  }

  if (v.category === "Bär" && v.notes) {
    card.append(el("p", { className: "card-notes", textContent: v.notes }));
  }

  card.addEventListener("click", () => openVarietyDialog(v));
  return card;
}
function metaRow(icon, text) {
  const row = el("div", { className: "meta-row" });
  row.append(el("span", { className: "meta-icon", textContent: icon }));
  row.append(el("span", { textContent: text }));
  return row;
}
function renderLibrary(filter = "") {
  const list = $("#variety-list");
  list.replaceChildren();
  const f = filter.toLowerCase();
  const filtered = f
    ? varieties.filter((v) => `${v.name} ${v.category || ""} ${v.growth_type || ""} ${(v.use_tags || []).join(" ")} ${v.notes || ""}`.toLowerCase().includes(f))
    : varieties;
  $("#sorter-heading").textContent = `Sorter · ${filtered.length} st`;
  for (const v of filtered) list.append(varietyCard(v));
}
$("#library-search").addEventListener("input", (e) => renderLibrary(e.target.value.trim()));

// ---------------- VARIETY DIALOG ----------------
$("#add-variety-btn").addEventListener("click", () => openVarietyDialog(null));
function openVarietyDialog(v) {
  const form = $("#variety-form");
  form.reset();
  $("#variety-dialog-title").textContent = v ? "Redigera sort" : "Ny sort";
  $("#variety-delete").hidden = !v;
  if (v) {
    form.elements.id.value = v.id;
    form.elements.name.value = v.name || "";
    form.elements.category.value = v.category || "";
    form.elements.growth_type.value = v.growth_type || "";
    form.elements.height_min_cm.value = v.height_min_cm ?? "";
    form.elements.height_max_cm.value = v.height_max_cm ?? "";
    form.elements.pruning.value = v.pruning || "";
    form.elements.default_location.value = v.default_location || "";
    form.elements.use_tags.value = (v.use_tags || []).join(", ");
    form.elements.pruning_notes.value = v.pruning_notes || "";
    form.elements.notes.value = v.notes || "";
  } else {
    form.elements.id.value = "";
  }
  $("#variety-dialog").showModal();
}
$("#variety-form").addEventListener("submit", async (e) => {
  const action = e.submitter?.value;
  if (action === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get("id");
  if (action === "delete") {
    if (!confirm("Ta bort denna sort?")) return;
    const { error } = await sb.from("tomato_varieties").delete().eq("id", id);
    if (error) return alert(error.message);
    $("#variety-dialog").close();
    await loadAll();
    return;
  }
  const useTags = (fd.get("use_tags") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const row = {
    name: fd.get("name"),
    category: fd.get("category") || null,
    growth_type: fd.get("growth_type") || null,
    height_min_cm: fd.get("height_min_cm") ? Number(fd.get("height_min_cm")) : null,
    height_max_cm: fd.get("height_max_cm") ? Number(fd.get("height_max_cm")) : null,
    pruning: fd.get("pruning") || null,
    default_location: fd.get("default_location") || null,
    use_tags: useTags,
    pruning_notes: fd.get("pruning_notes") || null,
    notes: fd.get("notes") || null,
  };
  let error;
  if (id) {
    ({ error } = await sb.from("tomato_varieties").update(row).eq("id", id));
  } else {
    row.created_by = currentUser.id;
    ({ error } = await sb.from("tomato_varieties").insert(row));
  }
  if (error) return alert(error.message);
  $("#variety-dialog").close();
  await loadAll();
});

// ---------------- PLANTINGS (Odling 2026) ----------------
function plantingCard(p) {
  const v = varieties.find((x) => x.id === p.variety_id);
  const card = el("li", { className: "card" });
  const head = el("div", { className: "card-head" });
  head.append(el("h3", { textContent: v?.name || "(okänd sort)" }));
  card.append(head);

  const tags = el("div", { className: "tags" });
  tags.append(tag(p.location, "green"));
  tags.append(tag(`${p.plant_count} st`, "outline"));
  if (v?.category === "Bär") {
    const prunedThisYear = p.pruned_on && new Date(p.pruned_on).getFullYear() === new Date().getFullYear();
    tags.append(tag(prunedThisYear ? "✂️ Beskuren i år" : "✂️ Behöver beskäras i år", prunedThisYear ? "green" : "warn"));
  }
  card.append(tags);

  if (p.planted_date || p.pruned_on) {
    const meta = el("div", { className: "meta-list" });
    if (p.planted_date) meta.append(metaRow("📅", "Planterad " + new Date(p.planted_date).toLocaleDateString("sv-SE")));
    if (p.pruned_on) meta.append(metaRow("✂️", "Beskuren " + new Date(p.pruned_on).toLocaleDateString("sv-SE")));
    card.append(meta);
  }
  if (p.notes) card.append(el("p", { className: "msg", textContent: p.notes }));

  card.addEventListener("click", () => openPlantingDialog(p));
  return card;
}
function populatePlantingLocationFilter() {
  const sel = $("#planting-location-filter");
  const prev = sel.value;
  const locs = [...new Set(plantings.map((p) => p.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
  sel.replaceChildren(el("option", { value: "", textContent: "Alla platser" }));
  for (const l of locs) sel.append(el("option", { value: l, textContent: l }));
  sel.value = locs.includes(prev) ? prev : "";
}
function renderPlantings() {
  const list = $("#planting-list");
  list.replaceChildren();
  const f = $("#planting-search").value.trim().toLowerCase();
  const loc = $("#planting-location-filter").value;
  const filtered = plantings.filter((p) => {
    if (loc && p.location !== loc) return false;
    if (!f) return true;
    const v = varieties.find((x) => x.id === p.variety_id);
    return `${v?.name || ""} ${p.location || ""} ${p.notes || ""}`.toLowerCase().includes(f);
  });
  const empty = $("#planting-empty");
  empty.hidden = filtered.length > 0;
  empty.textContent = plantings.length === 0
    ? "Inga plantor inlagda än. Lägg till från en sort eller via knappen ovan."
    : "Inga plantor matchar filtret.";
  for (const p of filtered) list.append(plantingCard(p));
}
$("#planting-search").addEventListener("input", renderPlantings);
$("#planting-location-filter").addEventListener("change", renderPlantings);
$("#add-planting-btn").addEventListener("click", () => openPlantingDialog(null));
function openPlantingDialog(p) {
  const form = $("#planting-form");
  form.reset();
  $("#planting-dialog-title").textContent = p ? "Redigera plantor" : "Lägg till plantor";
  $("#planting-delete").hidden = !p;
  if (p) {
    form.elements.id.value = p.id;
    form.elements.variety_id.value = p.variety_id || "";
    form.elements.location.value = p.location || "";
    form.elements.plant_count.value = p.plant_count ?? 1;
    form.elements.planted_date.value = p.planted_date || "";
    form.elements.pruned_on.value = p.pruned_on || "";
    form.elements.notes.value = p.notes || "";
  } else {
    form.elements.id.value = "";
  }
  $("#planting-dialog").showModal();
}
$("#planting-form").addEventListener("submit", async (e) => {
  const action = e.submitter?.value;
  if (action === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get("id");
  if (action === "delete") {
    if (!confirm("Ta bort dessa plantor?")) return;
    const { error } = await sb.from("user_tomatoes").delete().eq("id", id);
    if (error) return alert(error.message);
    $("#planting-dialog").close();
    await loadAll();
    return;
  }
  const row = {
    variety_id: fd.get("variety_id"),
    location: fd.get("location"),
    plant_count: Number(fd.get("plant_count")) || 1,
    planted_date: fd.get("planted_date") || null,
    pruned_on: fd.get("pruned_on") || null,
    notes: fd.get("notes") || null,
    season: SEASON,
  };
  let error;
  if (id) {
    ({ error } = await sb.from("user_tomatoes").update(row).eq("id", id));
  } else {
    row.user_id = currentUser.id;
    ({ error } = await sb.from("user_tomatoes").insert(row));
  }
  if (error) return alert(error.message);
  $("#planting-dialog").close();
  await loadAll();
});

// ---------------- FEEDING (Växtnäring per plats) ----------------
function placedLocations() {
  const set = new Set(plantings.map((p) => p.location).filter((l) => l && l !== "Ej placerad"));
  return [...set].sort((a, b) => a.localeCompare(b, "sv"));
}
function feedingCard(location) {
  const card = el("li", { className: "card static" });
  const list = feedings.filter((f) => f.location === location);

  const head = el("div", { className: "card-head" });
  head.append(el("h3", {}, el("span", { className: "tomato-icon", textContent: "💧" }), location));
  card.append(head);

  const latest = list[0];
  const daysSince = latest ? Math.floor((Date.now() - new Date(latest.fed_on)) / 86400000) : null;
  const overdue = daysSince === null || daysSince > 14;
  card.append(el("p", {
    className: `feeding-latest${overdue ? " overdue" : ""}`,
    textContent: latest
      ? `Senast gödslat: ${new Date(latest.fed_on).toLocaleDateString("sv-SE")}`
      : "Senast gödslat: aldrig",
  }));

  if (list.length) {
    const tags = el("div", { className: "tags" });
    for (const f of list) {
      const label = new Date(f.fed_on).toLocaleDateString("sv-SE") + (f.notes ? ` · ${f.notes}` : "");
      const t = tag(label, "green");
      t.classList.add("clickable");
      t.addEventListener("click", () => openFeedingDialog(location, f));
      tags.append(t);
    }
    card.append(tags);
  }

  const add = el("button", { type: "button", className: "primary add-date", textContent: "+ Datum" });
  add.addEventListener("click", () => openFeedingDialog(location, null));
  card.append(add);
  return card;
}
function renderFeedings() {
  const list = $("#feeding-list");
  list.replaceChildren();
  const locs = placedLocations();
  $("#feeding-empty").hidden = locs.length > 0;
  for (const loc of locs) list.append(feedingCard(loc));
}
function openFeedingDialog(location, f) {
  const form = $("#feeding-form");
  form.reset();
  $("#feeding-dialog-title").textContent = (f ? "Redigera näring · " : "Ny näring · ") + location;
  $("#feeding-delete").hidden = !f;
  form.elements.location.value = location;
  form.elements.fed_on.value = f?.fed_on || new Date().toISOString().slice(0, 10);
  if (f) {
    form.elements.id.value = f.id;
    form.elements.notes.value = f.notes || "";
  } else {
    form.elements.id.value = "";
  }
  $("#feeding-dialog").showModal();
}
$("#feeding-form").addEventListener("submit", async (e) => {
  const action = e.submitter?.value;
  if (action === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get("id");
  if (action === "delete") {
    if (!confirm("Ta bort detta datum?")) return;
    const { error } = await sb.from("feedings").delete().eq("id", id);
    if (error) return alert(error.message);
    $("#feeding-dialog").close();
    await loadAll();
    return;
  }
  const row = {
    location: fd.get("location"),
    fed_on: fd.get("fed_on"),
    notes: fd.get("notes") || null,
    season: SEASON,
  };
  let error;
  if (id) {
    ({ error } = await sb.from("feedings").update(row).eq("id", id));
  } else {
    row.user_id = currentUser.id;
    ({ error } = await sb.from("feedings").insert(row));
  }
  if (error) return alert(error.message);
  $("#feeding-dialog").close();
  await loadAll();
});

// ---------------- HARVEST (Skörd) ----------------
function harvestCard(h) {
  const v = varieties.find((x) => x.id === h.variety_id);
  const card = el("li", { className: "card" });
  const head = el("div", { className: "card-head" });
  head.append(el("h3", { textContent: v?.name || "(ingen sort)" }));
  card.append(head);

  const tags = el("div", { className: "tags" });
  if (h.weight_g) tags.append(tag(`${h.weight_g} g`, "green"));
  tags.append(tag(new Date(h.harvested_at).toLocaleDateString("sv-SE"), "outline"));
  card.append(tags);

  if (h.notes) card.append(el("p", { className: "msg", textContent: h.notes }));
  card.addEventListener("click", () => openHarvestDialog(h));
  return card;
}
function renderHarvests() {
  const list = $("#harvest-list");
  list.replaceChildren();
  $("#harvest-empty").hidden = harvests.length > 0;
  for (const h of harvests) list.append(harvestCard(h));

  const sum = $("#harvest-summary");
  sum.replaceChildren();
  if (harvests.length === 0) { sum.hidden = true; return; }
  sum.hidden = false;
  const totalKg = (harvests.reduce((s, h) => s + (h.weight_g || 0), 0) / 1000).toFixed(2);
  sum.append(stat("Totalt", `${totalKg} kg`));
  sum.append(stat("Antal skördar", harvests.length));
  const varietyCount = new Set(harvests.map((h) => h.variety_id).filter(Boolean)).size;
  sum.append(stat("Antal sorter", varietyCount));
}
function stat(label, value) {
  const wrap = el("div", { className: "ks" });
  wrap.append(el("span", { className: "ks-label", textContent: label }));
  wrap.append(el("span", { className: "ks-value", textContent: value }));
  return wrap;
}
$("#add-harvest-btn").addEventListener("click", () => openHarvestDialog(null));
function openHarvestDialog(h) {
  const form = $("#harvest-form");
  form.reset();
  $("#harvest-delete").hidden = !h;
  form.elements.harvested_at.value = h?.harvested_at || new Date().toISOString().slice(0, 10);
  if (h) {
    form.elements.id.value = h.id;
    form.elements.variety_id.value = h.variety_id || "";
    form.elements.weight_g.value = h.weight_g ?? "";
    form.elements.notes.value = h.notes || "";
  } else {
    form.elements.id.value = "";
  }
  $("#harvest-dialog").showModal();
}
$("#harvest-form").addEventListener("submit", async (e) => {
  const action = e.submitter?.value;
  if (action === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get("id");
  if (action === "delete") {
    if (!confirm("Ta bort denna skörd?")) return;
    const { error } = await sb.from("harvests").delete().eq("id", id);
    if (error) return alert(error.message);
    $("#harvest-dialog").close();
    await loadAll();
    return;
  }
  const row = {
    variety_id: fd.get("variety_id") || null,
    harvested_at: fd.get("harvested_at"),
    weight_g: fd.get("weight_g") ? Number(fd.get("weight_g")) : null,
    notes: fd.get("notes") || null,
  };
  let error;
  if (id) {
    ({ error } = await sb.from("harvests").update(row).eq("id", id));
  } else {
    row.user_id = currentUser.id;
    ({ error } = await sb.from("harvests").insert(row));
  }
  if (error) return alert(error.message);
  $("#harvest-dialog").close();
  await loadAll();
});

// ---------------- RECIPES ----------------
function recipeCard(r) {
  const card = el("li", { className: "card" });

  if (r.image_url) {
    card.classList.add("recipe-card");
    card.append(el("img", { className: "recipe-cover", src: r.image_url, alt: r.name, loading: "lazy" }));
    card.append(el("h3", { className: "recipe-cover-title", textContent: r.name }));
    card.addEventListener("click", () => openRecipeDialog(r));
    return card;
  }

  const head = el("div", { className: "card-head" });
  head.append(el("h3", { textContent: r.name }));
  card.append(head);

  if (r.variety_ids?.length) {
    const tags = el("div", { className: "tags" });
    for (const vid of r.variety_ids) {
      const v = varieties.find((x) => x.id === vid);
      if (v) tags.append(tag(v.name, "beige"));
    }
    card.append(tags);
  }
  if (r.body) {
    const snippet = r.body.length > 140 ? r.body.slice(0, 140) + "…" : r.body;
    card.append(el("p", { className: "msg", textContent: snippet }));
  }
  card.addEventListener("click", () => openRecipeDialog(r));
  return card;
}
function renderRecipes() {
  const list = $("#recipe-list");
  list.replaceChildren();
  $("#recipe-empty").hidden = recipes.length > 0;
  for (const r of recipes) list.append(recipeCard(r));
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
$("#recipe-print").addEventListener("click", () => {
  const form = $("#recipe-form");
  const name = form.elements.name.value || "Recept";
  const body = form.elements.body.value || "";
  const sorter = recipeVarietyIds.map((id) => varieties.find((v) => v.id === id)?.name).filter(Boolean);
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) { alert("Tillåt popup-fönster för att kunna skriva ut."); return; }
  w.document.write(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #2a2a2a; max-width: 17cm; margin: 2cm auto; padding: 0 1cm; line-height: 1.5; }
  h1 { font-size: 1.8rem; margin: 0 0 .2rem; }
  .sorter { color: #6b6b6b; font-style: italic; margin: 0 0 1rem; }
  .body { white-space: pre-wrap; font-size: 1.05rem; }
  @media print { body { margin: 1.2cm; } }
</style></head><body onload="window.print()">
  <h1>🍅 ${escapeHtml(name)}</h1>
  ${sorter.length ? `<p class="sorter">Passar bra med: ${escapeHtml(sorter.join(", "))}</p>` : ""}
  <div class="body">${escapeHtml(body)}</div>
</body></html>`);
  w.document.close();
  w.focus();
});
$("#add-recipe-btn").addEventListener("click", () => openRecipeDialog(null));
function renderRecipeVarieties() {
  const chips = $("#recipe-variety-chips");
  chips.replaceChildren();
  if (!recipeVarietyIds.length) {
    chips.append(el("span", { className: "msg", textContent: "Inga sorter valda än." }));
  }
  for (const id of recipeVarietyIds) {
    const v = varieties.find((x) => x.id === id);
    if (!v) continue;
    const chip = el("span", { className: "tag beige" });
    chip.append(v.name + " ");
    const x = el("button", { type: "button", className: "chip-x", textContent: "✕", title: "Ta bort" });
    x.addEventListener("click", () => {
      recipeVarietyIds = recipeVarietyIds.filter((i) => i !== id);
      renderRecipeVarieties();
    });
    chip.append(x);
    chips.append(chip);
  }
  const add = $("#recipe-variety-add");
  add.replaceChildren(el("option", { value: "", textContent: "+ Lägg till sort…" }));
  for (const v of varieties) {
    if (!recipeVarietyIds.includes(v.id)) add.append(el("option", { value: v.id, textContent: v.name }));
  }
}
$("#recipe-variety-add").addEventListener("change", (e) => {
  const id = e.target.value;
  if (id && !recipeVarietyIds.includes(id)) {
    recipeVarietyIds.push(id);
    renderRecipeVarieties();
  }
  e.target.value = "";
});
function openRecipeDialog(r) {
  const form = $("#recipe-form");
  form.reset();
  $("#recipe-delete").hidden = !r;
  $("#recipe-print").hidden = !r;
  const dlgImg = $("#recipe-dialog-image");
  if (r?.image_url) {
    dlgImg.src = r.image_url;
    dlgImg.alt = r.name || "";
    dlgImg.hidden = false;
  } else {
    dlgImg.hidden = true;
    dlgImg.removeAttribute("src");
  }
  recipeVarietyIds = r?.variety_ids ? [...r.variety_ids] : [];
  renderRecipeVarieties();
  if (r) {
    form.elements.id.value = r.id;
    form.elements.name.value = r.name || "";
    form.elements.body.value = r.body || "";
  } else {
    form.elements.id.value = "";
  }
  $("#recipe-dialog").showModal();
}
$("#recipe-form").addEventListener("submit", async (e) => {
  const action = e.submitter?.value;
  if (action === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get("id");
  if (action === "delete") {
    if (!confirm("Ta bort detta recept?")) return;
    const { error } = await sb.from("recipes").delete().eq("id", id);
    if (error) return alert(error.message);
    $("#recipe-dialog").close();
    await loadAll();
    return;
  }
  const row = {
    name: fd.get("name"),
    body: fd.get("body") || null,
    variety_ids: recipeVarietyIds,
  };
  let error;
  if (id) {
    ({ error } = await sb.from("recipes").update(row).eq("id", id));
  } else {
    row.user_id = currentUser.id;
    ({ error } = await sb.from("recipes").insert(row));
  }
  if (error) return alert(error.message);
  $("#recipe-dialog").close();
  await loadAll();
});

// ---------------- SELECTS ----------------
function populateVarietySelects() {
  for (const id of ["#planting-variety-select", "#harvest-variety-select"]) {
    const sel = $(id);
    sel.replaceChildren();
    sel.append(el("option", { value: "", textContent: "—" }));
    for (const v of varieties) sel.append(el("option", { value: v.id, textContent: v.name }));
  }
}

// ---------------- BOOTSTRAP ----------------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;
  if (session) showApp();
  else showAuth();
})();

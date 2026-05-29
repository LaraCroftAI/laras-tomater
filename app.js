import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rciaqovopajrkdtuhkdo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F1wn2SYtPbldAoCV2j9f9w_-2ZqSf8C";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
};

const authView = $("#auth-view");
const appView = $("#app-view");
const authForm = $("#auth-form");
const authMsg = $("#auth-msg");

let varieties = [];
let mine = [];

async function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
}

async function showApp() {
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
  if (error) {
    authMsg.textContent = error.message;
    authMsg.classList.add("error");
  }
});

authForm.querySelector('[data-action="signup"]').addEventListener("click", async () => {
  authMsg.textContent = "";
  const { error } = await sb.auth.signUp({
    email: $("#email").value,
    password: $("#password").value,
  });
  authMsg.classList.remove("error");
  if (error) {
    authMsg.textContent = error.message;
    authMsg.classList.add("error");
  } else {
    authMsg.textContent = "Konto skapat — du är inloggad.";
  }
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp();
  else showAuth();
});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
    $(`#tab-${btn.dataset.tab}`).hidden = false;
  });
});

$("#library-search").addEventListener("input", (e) => renderLibrary(e.target.value.trim().toLowerCase()));

$("#add-variety-btn").addEventListener("click", () => $("#variety-dialog").showModal());

$("#variety-form").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  const fd = new FormData(e.target);
  const { data: { user } } = await sb.auth.getUser();
  const row = {
    name: fd.get("name"),
    type: fd.get("type") || null,
    color: fd.get("color") || null,
    growth_habit: fd.get("growth_habit") || null,
    maturity_days: fd.get("maturity_days") ? Number(fd.get("maturity_days")) : null,
    needs_pruning: fd.get("needs_pruning") === "on",
    height_cm: fd.get("height_cm") ? Number(fd.get("height_cm")) : null,
    notes: fd.get("notes") || null,
    created_by: user.id,
  };
  const { error } = await sb.from("tomato_varieties").insert(row);
  if (error) return alert(error.message);
  e.target.reset();
  await loadVarieties();
  renderLibrary();
});

$("#mine-form").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  const fd = new FormData(e.target);
  const { data: { user } } = await sb.auth.getUser();
  const row = {
    user_id: user.id,
    variety_id: fd.get("variety_id"),
    planted_date: fd.get("planted_date") || null,
    location: fd.get("location") || null,
    plant_count: fd.get("plant_count") ? Number(fd.get("plant_count")) : null,
    notes: fd.get("notes") || null,
  };
  const { error } = await sb.from("user_tomatoes").insert(row);
  if (error) return alert(error.message);
  e.target.reset();
  await loadMine();
  renderMine();
});

async function loadAll() {
  await Promise.all([loadVarieties(), loadMine()]);
  renderLibrary();
  renderMine();
}

async function loadVarieties() {
  const { data, error } = await sb.from("tomato_varieties").select("*").order("name");
  if (error) return console.error(error);
  varieties = data;
}

async function loadMine() {
  const { data, error } = await sb
    .from("user_tomatoes")
    .select("*, tomato_varieties(*)")
    .order("created_at", { ascending: false });
  if (error) return console.error(error);
  mine = data;
}

function traitPill(label) {
  return el("span", { className: "trait", textContent: label });
}

function varietyCard(v, { onAddToMine } = {}) {
  const card = el("li", { className: "card" });
  card.append(el("h3", { textContent: v.name }));
  const meta = el("div", { className: "meta" });
  const metaParts = [v.type, v.color].filter(Boolean).join(" · ");
  if (metaParts) meta.textContent = metaParts;
  card.append(meta);

  const traits = el("div", { className: "traits" });
  if (v.growth_habit) traits.append(traitPill(v.growth_habit));
  if (v.maturity_days) traits.append(traitPill(`${v.maturity_days} dgr`));
  if (v.height_cm) traits.append(traitPill(`${v.height_cm} cm`));
  if (v.needs_pruning != null) traits.append(traitPill(v.needs_pruning ? "Tjuva" : "Tjuva ej"));
  if (traits.children.length) card.append(traits);

  if (v.notes) card.append(el("p", { className: "meta", textContent: v.notes, style: "margin-top:.5rem" }));

  if (onAddToMine) {
    const actions = el("div", { className: "actions" });
    const btn = el("button", { textContent: "+ Min lista", onclick: () => onAddToMine(v) });
    actions.append(btn);
    card.append(actions);
  }
  return card;
}

function renderLibrary(filter = "") {
  const list = $("#variety-list");
  list.replaceChildren();
  const filtered = filter
    ? varieties.filter((v) => (v.name + " " + (v.type || "") + " " + (v.color || "")).toLowerCase().includes(filter))
    : varieties;
  for (const v of filtered) {
    list.append(varietyCard(v, { onAddToMine: openMineDialog }));
  }
}

function openMineDialog(v) {
  const form = $("#mine-form");
  form.reset();
  form.elements.variety_id.value = v.id;
  $("#mine-variety-name").textContent = v.name;
  $("#mine-dialog").showModal();
}

function renderMine() {
  const list = $("#mine-list");
  list.replaceChildren();
  $("#mine-empty").hidden = mine.length > 0;
  for (const m of mine) {
    const v = m.tomato_varieties;
    const card = el("li", { className: "card" });
    card.append(el("h3", { textContent: v?.name || "(okänd sort)" }));
    const parts = [m.location, m.plant_count ? `${m.plant_count} st` : null, m.planted_date].filter(Boolean);
    if (parts.length) card.append(el("div", { className: "meta", textContent: parts.join(" · ") }));
    if (m.notes) card.append(el("p", { className: "meta", textContent: m.notes, style: "margin-top:.5rem" }));
    const actions = el("div", { className: "actions" });
    const removeBtn = el("button", {
      textContent: "Ta bort",
      onclick: async () => {
        if (!confirm(`Ta bort ${v?.name || "denna"} från din lista?`)) return;
        const { error } = await sb.from("user_tomatoes").delete().eq("id", m.id);
        if (error) return alert(error.message);
        await loadMine();
        renderMine();
      },
    });
    removeBtn.style.background = "var(--card)";
    removeBtn.style.color = "var(--ink)";
    removeBtn.style.border = "1px solid var(--line)";
    actions.append(removeBtn);
    card.append(actions);
    list.append(card);
  }
}

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) showApp();
  else showAuth();
})();

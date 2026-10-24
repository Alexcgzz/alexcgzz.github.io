import { CONFIG_PATH, STATUSES, safeUrl, fetchPublicRepos, isValidGithubName, isValidRepoName, h } from "../js/shared.js";

const $ = (sel, root = document) => root.querySelector(sel);
const AUTH_KEY = "portfolio-admin";

const state = {
  conn: null,        // { owner, repo, branch, token } or null in offline mode
  sha: null,         // blob sha of config.json, required by the GitHub API to update it
  cfg: null,
  repos: [],
};

// ---------- base64 <-> UTF-8 (config has accents, em dashes, arrows…) ----------

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

// ---------- GitHub API ----------

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${state.conn.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `GitHub API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const contentsPath = () => {
  const { owner, repo } = state.conn;
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${CONFIG_PATH}`;
};

async function fetchRemoteConfig() {
  const file = await gh(`${contentsPath()}?ref=${encodeURIComponent(state.conn.branch)}`);
  state.sha = file.sha;
  return JSON.parse(fromBase64(file.content));
}

async function pushConfig(cfg) {
  const res = await gh(contentsPath(), {
    method: "PUT",
    body: JSON.stringify({
      message: "chore(portfolio): update config from admin",
      content: toBase64(JSON.stringify(cfg, null, 2) + "\n"),
      sha: state.sha,
      branch: state.conn.branch,
    }),
  });
  state.sha = res.content.sha;
}

// ---------- session ----------

function guessConnection() {
  const host = location.hostname;
  const m = host.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return { owner: "alexcgzz", repo: "alexcgzz.github.io", branch: "main" };
  const first = location.pathname.split("/").filter(Boolean)[0];
  const repo = first && first !== "admin" ? first : `${m[1]}.github.io`;
  return { owner: m[1], repo, branch: "main" };
}

function readSaved() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const v = JSON.parse(store.getItem(AUTH_KEY) || "null");
      if (v?.token) return v;
    } catch { /* ignore */ }
  }
  return null;
}

function saveSession(conn, remember) {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(conn));
  } catch { /* storage blocked: session lasts for this page only */ }
}

function clearSession() {
  try { sessionStorage.removeItem(AUTH_KEY); localStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
}

// ---------- messages ----------

function say(text, kind = "") {
  const msg = $("#msg");
  msg.textContent = text;
  msg.dataset.kind = kind;
}

function connectError(text) {
  let p = $("#connect-error");
  if (!p) {
    p = h("p", { id: "connect-error", class: "error", role: "alert" });
    $("#connect-form").after(p);
  }
  p.textContent = text;
}

// ---------- simple bound fields ----------

function bindFields() {
  for (const input of document.querySelectorAll("[data-bind]")) {
    const key = input.dataset.bind;
    if (input.type === "checkbox") input.checked = !!state.cfg[key];
    else input.value = state.cfg[key] ?? "";
  }
  $("#learning").value = (state.cfg.learning || []).join("\n");
}

function collectFields() {
  for (const input of document.querySelectorAll("[data-bind]")) {
    const key = input.dataset.bind;
    state.cfg[key] = input.type === "checkbox" ? input.checked : input.value.trim();
  }
  state.cfg.learning = lines($("#learning").value);
}

const lines = (text) => text.split("\n").map((s) => s.trim()).filter(Boolean);

// ---------- list editors (links, projects, stages) ----------

function moveItem(list, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

// Renders `items` into `container` with a template; edits write straight back into the item objects.
function renderList(container, tplId, items, fill, onChange) {
  const tpl = $(tplId);
  container.replaceChildren(...items.map((item, i) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    fill(node, item, i);
    node.addEventListener("input", (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      item[k] = k === "tags" ? e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
        : k === "items" ? lines(e.target.value)
        : e.target.value;
      if (k === "url") validateUrl(e.target);
    });
    node.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "remove") items.splice(i, 1);
      if (act === "up") moveItem(items, i, -1);
      if (act === "down") moveItem(items, i, 1);
      onChange();
    });
    return node;
  }));
}

function validateUrl(input) {
  const ok = !input.value.trim() || safeUrl(input.value);
  input.setCustomValidity(ok ? "" : "Usa https://, mailto: o una ruta relativa");
  input.classList.toggle("invalid", !ok);
}

function renderLinks() {
  state.cfg.links ||= [];
  renderList($("#links"), "#tpl-link", state.cfg.links, (node, link) => {
    $('[data-k="label"]', node).value = link.label || "";
    const url = $('[data-k="url"]', node);
    url.value = link.url || "";
    validateUrl(url);
  }, renderLinks);
}

function renderStages() {
  state.cfg.pipeline ||= [];
  renderList($("#stages"), "#tpl-stage", state.cfg.pipeline, (node, stage, i) => {
    $(".stage-num", node).textContent = String(i + 1).padStart(2, "0");
    $('[data-k="stage"]', node).value = stage.stage || "";
    $('[data-k="items"]', node).value = (stage.items || []).join("\n");
  }, renderStages);
}

function renderProjects() {
  state.cfg.projects ||= [];
  renderList($("#shown"), "#tpl-project", state.cfg.projects, (node, p) => {
    const repo = state.repos.find((r) => r.name.toLowerCase() === p.repo.toLowerCase());
    const name = $(".repo-name", node);
    name.textContent = p.repo;
    if (state.repos.length && !repo) name.append(h("span", { class: "warn" }, " · no encontrado / privado"));
    $('[data-k="status"]', node).value = STATUSES.includes(p.status) ? p.status : "passed";
    $('[data-k="title"]', node).value = p.title || "";
    $('[data-k="title"]', node).placeholder = p.repo;
    $('[data-k="tags"]', node).value = (p.tags || []).join(", ");
    $('[data-k="tags"]', node).placeholder = [...(repo?.topics || []), repo?.language?.toLowerCase()].filter(Boolean).join(", ") || "python, s3, athena";
    $('[data-k="description"]', node).value = p.description || "";
    $('[data-k="description"]', node).placeholder = repo?.description || "Descripción del repo en GitHub";
  }, () => { renderProjects(); renderAvailable(); });
  if (!state.cfg.projects.length) {
    $("#shown").append(h("li", { class: "empty" }, "Ninguno seleccionado: el sitio mostrará tus 3 repos más recientes."));
  }
}

function renderAvailable() {
  const q = $("#repo-search").value.trim().toLowerCase();
  const forks = $("#show-forks").checked;
  const shown = new Set(state.cfg.projects.map((p) => p.repo.toLowerCase()));
  const list = state.repos.filter((r) =>
    !shown.has(r.name.toLowerCase()) && (forks || !r.fork) && (!q || r.name.toLowerCase().includes(q)));

  $("#available").replaceChildren(...list.map((r) => h("li", {},
    h("button", {
      type: "button",
      class: "repo",
      onclick: () => {
        state.cfg.projects.push({ repo: r.name, status: "passed", title: "", description: "", tags: [] });
        renderProjects();
        renderAvailable();
      },
    },
      h("span", { class: "repo__add", "aria-hidden": "true" }, "+"),
      h("span", { class: "repo__name mono" }, r.name, r.fork ? h("em", {}, " fork") : null),
      h("span", { class: "repo__desc" }, r.description || "sin descripción"),
      h("span", { class: "repo__meta mono" }, [r.language, r.pushed_at?.slice(0, 10)].filter(Boolean).join(" · ")),
    ))));
  if (!list.length) $("#available").append(h("li", { class: "empty" }, state.repos.length ? "Sin resultados." : "Cargando repos…"));
}

async function loadRepos() {
  const user = $('[data-bind="githubUser"]').value.trim();
  state.repos = [];
  renderAvailable();
  if (!isValidGithubName(user)) return say("Usuario de GitHub inválido.", "error");
  try {
    state.repos = await fetchPublicRepos(user);
  } catch (err) {
    say(`No se pudieron cargar los repos: ${err.message}`, "error");
  }
  renderProjects();
  renderAvailable();
}

// ---------- editor lifecycle ----------

function openEditor(cfg) {
  state.cfg = cfg;
  $("#connect-panel").hidden = true;
  $("#editor").hidden = false;
  $("#logout").hidden = !state.conn;
  $("#save").hidden = !state.conn;
  bindFields();
  renderLinks();
  renderStages();
  renderProjects();
  loadRepos();
  say(state.conn
    ? `Conectado a ${state.conn.owner}/${state.conn.repo} (${state.conn.branch}).`
    : "Modo sin conexión: al terminar, descarga el JSON y súbelo a data/config.json.");
}

function buildConfig() {
  collectFields();
  const cfg = structuredClone(state.cfg);
  cfg.links = cfg.links.filter((l) => l.label?.trim() && safeUrl(l.url)).map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
  cfg.pipeline = cfg.pipeline.filter((s) => s.stage?.trim()).map((s) => ({ stage: s.stage.trim(), items: s.items || [] }));
  cfg.projects = cfg.projects.filter((p) => isValidRepoName(p.repo)).map((p) => ({
    repo: p.repo,
    status: STATUSES.includes(p.status) ? p.status : "passed",
    title: (p.title || "").trim(),
    description: (p.description || "").trim(),
    tags: p.tags || [],
  }));
  cfg.updatedAt = new Date().toISOString();
  return cfg;
}

async function connect(conn, remember) {
  state.conn = conn;
  try {
    const cfg = await fetchRemoteConfig();
    saveSession(conn, remember);
    openEditor(cfg);
  } catch (err) {
    state.conn = null;
    const hint = err.status === 401 ? "Token inválido o expirado."
      : err.status === 404 ? `No se encontró ${CONFIG_PATH} en ${conn.owner}/${conn.repo}@${conn.branch}, o el token no tiene acceso a ese repo.`
      : err.message;
    connectError(hint);
    clearSession();
  }
}

// ---------- events ----------

$("#connect-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  connect({
    owner: f.get("owner").trim(),
    repo: f.get("repo").trim(),
    branch: f.get("branch").trim(),
    token: f.get("token").trim(),
  }, f.get("remember") === "on");
});

$("#offline").addEventListener("click", async () => {
  const res = await fetch(`../${CONFIG_PATH}`, { cache: "no-store" });
  openEditor(await res.json());
});

$("#logout").addEventListener("click", () => {
  clearSession();
  location.reload();
});

$("#add-link").addEventListener("click", () => { state.cfg.links.push({ label: "", url: "" }); renderLinks(); });
$("#add-stage").addEventListener("click", () => { state.cfg.pipeline.push({ stage: "", items: [] }); renderStages(); });
$("#reload-repos").addEventListener("click", loadRepos);
$("#repo-search").addEventListener("input", renderAvailable);
$("#show-forks").addEventListener("change", renderAvailable);

$("#download").addEventListener("click", () => {
  if (!$("#editor").reportValidity()) return;
  const blob = new Blob([JSON.stringify(buildConfig(), null, 2) + "\n"], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: "config.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$("#editor").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.conn || !e.target.reportValidity()) return;
  const btn = $("#save");
  btn.disabled = true;
  say("Guardando…");
  try {
    const cfg = buildConfig();
    await pushConfig(cfg);
    state.cfg = cfg;
    dirty = false;
    say("✓ Guardado. GitHub Pages publica el cambio en ~1 minuto.", "ok");
  } catch (err) {
    say(err.status === 409 || err.status === 422
      ? "El archivo cambió en GitHub desde que lo abriste. Recarga la página y vuelve a aplicar tus cambios."
      : err.status === 403 || err.status === 401
        ? "El token no tiene permiso de escritura (Contents: Read and write) en este repo."
        : `Error al guardar: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
});

// Warn before leaving with unsaved edits.
let dirty = false;
const markDirty = () => { dirty = true; if ($("#msg").dataset.kind === "ok") say(""); };
$("#editor").addEventListener("input", markDirty);
$("#editor").addEventListener("click", (e) => {
  if (e.target.closest("[data-act], .repo, #add-link, #add-stage")) markDirty();
});
window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });

// ---------- boot ----------

const saved = readSaved();
const conn = saved || guessConnection();
const form = $("#connect-form");
form.owner.value = conn.owner;
form.repo.value = conn.repo;
form.branch.value = conn.branch;
if (saved) {
  let remembered = false;
  try { remembered = !!localStorage.getItem(AUTH_KEY); } catch { /* ignore */ }
  connect(saved, remembered);
}

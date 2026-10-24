import { CONFIG_PATH, STATUSES, h, safeUrl, fetchPublicRepos, isValidGithubName } from "./shared.js";

const REPO_CACHE_TTL = 10 * 60 * 1000;
const $ = (id) => document.getElementById(id);

async function loadConfig() {
  const res = await fetch(`${CONFIG_PATH}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`config ${res.status}`);
  return res.json();
}

// Unauthenticated GitHub API allows 60 req/h per IP, so cache per session.
async function loadRepos(user) {
  const key = `repos:${user}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || "null");
    if (cached && Date.now() - cached.at < REPO_CACHE_TTL) return cached.repos;
  } catch { /* storage unavailable */ }

  const repos = (await fetchPublicRepos(user)).map((r) => ({
    name: r.name,
    description: r.description,
    url: r.html_url,
    language: r.language,
    topics: r.topics || [],
    fork: r.fork,
    archived: r.archived,
    pushedAt: r.pushed_at,
  }));
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), repos })); } catch { /* ignore */ }
  return repos;
}

function renderProfile(cfg) {
  $("eyebrow").textContent = [cfg.role, cfg.location].filter(Boolean).join(" · ");
  $("name").textContent = cfg.name || "";
  document.title = [cfg.name, cfg.role].filter(Boolean).join(" · ");

  const status = $("status");
  status.textContent = cfg.openToWork ? cfg.openToWorkText : cfg.notOpenToWorkText;
  status.classList.toggle("is-open", !!cfg.openToWork);
  status.hidden = !status.textContent;

  $("links").replaceChildren(
    ...(cfg.links || []).flatMap((link) => {
      const href = safeUrl(link.url);
      if (!href || !link.label) return [];
      const external = /^https:/.test(href);
      return h("li", {}, h("a", {
        href,
        target: external ? "_blank" : null,
        rel: external ? "noopener noreferrer" : null,
      }, link.label));
    }),
  );

  $("prompt").textContent = cfg.prompt || "";
  $("tagline").textContent = cfg.tagline || "";
}

function renderPipeline(cfg) {
  const stages = (cfg.pipeline || []).slice(0, 6);
  $("stack-title").textContent = cfg.stackTitle || "";
  const list = $("pipeline");
  list.style.setProperty("--stages", Math.max(stages.length, 1));
  list.replaceChildren(
    ...stages.map((s, i) => h("li", { class: `stage${i === 0 ? " is-active" : ""}` },
      h("div", { class: "stage__rail", "aria-hidden": "true" },
        h("span", { class: "stage__node" }), h("span", { class: "stage__line" })),
      h("p", { class: "stage__label" }, h("span", {}, String(i + 1).padStart(2, "0")), s.stage),
      h("ul", { class: "stage__items" }, (s.items || []).map((item) => h("li", {}, item))),
    )),
  );

  // Data "flows" through the stages: move the highlighted node every few seconds.
  if (stages.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let active = 0;
    setInterval(() => {
      const items = list.children;
      items[active]?.classList.remove("is-active");
      active = (active + 1) % items.length;
      items[active]?.classList.add("is-active");
    }, 2200);
  }
}

function skeletonCards(n) {
  return Array.from({ length: n }, () =>
    h("li", { class: "card card--skeleton", "aria-hidden": "true" },
      h("a", {}, h("div", { class: "bar" }), h("div", { class: "bar" }), h("div", { class: "bar" }))));
}

function projectCard(project, repo, index) {
  const status = STATUSES.includes(project.status) ? project.status : "passed";
  const tags = project.tags?.length
    ? project.tags
    : [...(repo?.topics || []), repo?.language?.toLowerCase()].filter(Boolean).slice(0, 4);
  const href = safeUrl(repo?.url) || `https://github.com/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}`;

  return h("li", { class: "card" },
    h("a", { href, target: "_blank", rel: "noopener noreferrer" },
      h("div", { class: "card__meta" },
        h("span", {}, `run_${String(index + 1).padStart(2, "0")}`),
        h("span", { class: "card__run", dataset: { status } }, status)),
      h("h3", { class: "card__title" }, project.title || project.repo),
      h("p", { class: "card__desc" }, project.description || repo?.description || ""),
      tags.length ? h("p", { class: "card__tags" }, tags.join(" · ")) : null,
    ));
}

async function renderProjects(cfg) {
  const user = cfg.githubUser;
  $("projects-title").textContent = cfg.projectsTitle || "";
  const more = $("all-repos");
  more.textContent = cfg.allReposText || "";
  more.href = isValidGithubName(user) ? `https://github.com/${user}?tab=repositories` : "https://github.com";

  const cards = $("cards");
  const selected = (cfg.projects || []).filter((p) => p.repo);
  cards.replaceChildren(...skeletonCards(selected.length || 3));

  let repos = [];
  try {
    repos = await loadRepos(user);
  } catch (err) {
    console.warn("Could not load GitHub repos, falling back to config:", err);
  }
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));

  // No curated list yet: show the most recently pushed original repos.
  const projects = selected.length
    ? selected
    : repos.filter((r) => !r.fork && !r.archived).slice(0, 3).map((r) => ({ repo: r.name, status: "passed" }));

  cards.replaceChildren(
    ...projects.map((p, i) => projectCard({ ...p, owner: user }, byName.get(p.repo.toLowerCase()), i)),
  );
  if (!projects.length) cards.replaceChildren(h("li", { class: "cards__empty" }, "No projects yet."));
}

function renderFooter(cfg) {
  const learning = cfg.learning || [];
  $("learning").replaceChildren(
    learning.length ? `${cfg.learningLabel || ""} ` : "",
    ...learning.flatMap((item, i) => [i ? " · " : "", h("strong", {}, item)]),
  );

  const date = new Date(cfg.updatedAt || document.lastModified);
  const when = isNaN(date) ? "" : date.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toLowerCase();
  $("deploy").textContent = when ? `${cfg.lastDeployLabel || "last deploy"} · ${when}` : "";
}

async function main() {
  const app = $("app");
  try {
    const cfg = await loadConfig();
    renderProfile(cfg);
    renderPipeline(cfg);
    renderFooter(cfg);
    app.removeAttribute("aria-busy");
    await renderProjects(cfg);
  } catch (err) {
    console.error(err);
    app.removeAttribute("aria-busy");
    $("tagline").textContent = "Something went wrong loading this page. Please refresh.";
  }
}

main();

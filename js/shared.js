// Helpers shared by the public site and the admin panel.

export const CONFIG_PATH = "data/config.json";
export const STATUSES = ["passed", "running", "failed"];

// Only allow links that can't execute script: https, mailto, or a relative path.
export function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return null;
  if (/^mailto:[^\s"'<>]+$/i.test(url)) return url;
  if (/^(?:\.{0,2}\/)?[\w\-./]+(?:[?#][\w\-./=&%#]*)?$/.test(url) && !url.includes(":") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

// Tiny DOM builder. Text always goes through textContent, never innerHTML.
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const isValidGithubName = (name) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(name ?? "");
export const isValidRepoName = (name) => /^[A-Za-z0-9._-]{1,100}$/.test(name ?? "");

export async function fetchPublicRepos(user, init = {}) {
  if (!isValidGithubName(user)) throw new Error("Invalid GitHub user");
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&type=owner&sort=pushed`,
    { ...init, headers: { Accept: "application/vnd.github+json", ...(init.headers || {}) } },
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

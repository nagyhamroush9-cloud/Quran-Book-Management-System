const routes = [];

export function register(pattern, loader) {
  routes.push({ pattern, loader });
}

export function parseHash() {
  const raw = (location.hash || "#/dashboard").replace(/^#/, "") || "/dashboard";
  const [path, queryString] = raw.split("?");
  const query = {};
  if (queryString) {
    new URLSearchParams(queryString).forEach((v, k) => {
      query[k] = v;
    });
  }
  return { path, query };
}

export function matchRoute(path) {
  for (const route of routes) {
    const keys = [];
    const rx = new RegExp(`^${route.pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
      keys.push(k);
      return "([^/]+)";
    })}$`);
    const m = path.match(rx);
    if (m) {
      const params = {};
      keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
      return { ...route, params };
    }
  }
  return null;
}

export function navigate(path) {
  if (!path.startsWith("#")) location.hash = path.startsWith("/") ? `#${path}` : `#/${path}`;
  else location.hash = path;
}

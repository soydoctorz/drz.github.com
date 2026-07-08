const STORAGE_KEY = "drzAcademyLogEndpoint";

function normalizeEndpoint(raw) {
  const value = String(raw ?? "").trim();
  if (!value || !/^https?:\/\//i.test(value)) return "";
  return value;
}

function getEndpointFromDom() {
  const el = document.querySelector('meta[name="visitor-log-endpoint"]');
  return el ? normalizeEndpoint(el.getAttribute("content")) : "";
}

function getEndpoint() {
  const fromDom = getEndpointFromDom();
  if (fromDom) return fromDom;
  return normalizeEndpoint(localStorage.getItem(STORAGE_KEY));
}

function normalizePathname(rawPathname) {
  const value = String(rawPathname || "").trim();
  if (!value) return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/") || "/";
}

function sendPayload(endpoint, payload) {
  const body = JSON.stringify(payload);
  if (!endpoint) return false;

  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    mode: "cors",
    credentials: "omit",
  }).catch(() => {});
  return true;
}

export function trackEvent(eventType, details = {}) {
  const endpoint = getEndpoint();
  if (!endpoint) return false;

  return sendPayload(endpoint, {
    eventType,
    timestamp: new Date().toISOString(),
    page: normalizePathname(location.pathname),
    url: location.href,
    referrer: document.referrer || "",
    userAgent: navigator.userAgent || "",
    language: document.documentElement.lang || navigator.language || "",
    details,
  });
}

export function trackPageView(pageName, details = {}) {
  return trackEvent("page_view", { pageName, ...details });
}

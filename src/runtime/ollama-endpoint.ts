// Shared endpoint normalization for inference and catalog discovery.
export function getOllamaBaseUrl(
  configuredHost = process.env.OLLAMA_HOST,
): string {
  const fallback = "http://localhost:11434/v1";
  if (!configuredHost?.trim()) return fallback;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(configuredHost)
      ? configuredHost
      : `http://${configuredHost}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.endsWith("/v1") ? pathname : `${pathname}/v1`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

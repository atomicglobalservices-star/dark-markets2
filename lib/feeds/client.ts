import { feedConfig } from "./config";
export async function engineFetch(
  path: "/snapshot" | "/health" | "/events" | `/history?${string}`,
  signal?: AbortSignal,
) {
  const c = feedConfig();
  if (c.token.length < 32)
    throw new Error("Market engine token not configured");
  return fetch(`http://127.0.0.1:${c.port}${path}`, {
    headers: { Authorization: "Bearer " + c.token },
    cache: "no-store",
    signal: signal || AbortSignal.timeout(8000),
  });
}

import { feedConfig } from "./feeds/config";
import type { ProviderId } from "./feeds/types";
import type { Quote } from "./market";
// Local evaluation is separate from paid commercial derived-analysis permission.
export function nativeAnalysisAllowed(
  q: Quote,
  historyRequired = 0,
  now = Date.now(),
) {
  if (
    q.status !== "realtime" ||
    q.timestampKind === "fixture" ||
    !q.provider ||
    q.provider === "demo" ||
    !Number.isFinite(Date.parse(q.asOf)) ||
    now - Date.parse(q.asOf) > 60000 ||
    Date.parse(q.asOf) > now + 5000 ||
    q.history.length < historyRequired
  )
    return false;
  const config = feedConfig();
  return config.allowed(q.provider as ProviderId, "analysis");
}

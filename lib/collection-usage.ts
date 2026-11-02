import { db } from "./db";
export async function recordUsage(
  provider: string,
  requests = 0,
  cacheHits = 0,
  rateLimits = 0,
) {
  const key = "usage:" + provider + ":" + new Date().toISOString().slice(0, 10);
  await db.$executeRaw`INSERT INTO "Snapshot" ("key","content","status","fetchedAt") VALUES (${key},jsonb_build_object('requests',${requests}::int,'cacheHits',${cacheHits}::int,'rateLimits',${rateLimits}::int),'usage',CURRENT_TIMESTAMP) ON CONFLICT ("key") DO UPDATE SET "content"=jsonb_build_object('requests',COALESCE(("Snapshot"."content"->>'requests')::int,0)+${requests}::int,'cacheHits',COALESCE(("Snapshot"."content"->>'cacheHits')::int,0)+${cacheHits}::int,'rateLimits',COALESCE(("Snapshot"."content"->>'rateLimits')::int,0)+${rateLimits}::int),"fetchedAt"=CURRENT_TIMESTAMP`;
}

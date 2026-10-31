import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { db } from "./db";
import { entitlement } from "./domain";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get("dm_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function requireUser(premium = false, subscription = true) {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please sign in");
  if (subscription && !entitlement(user, premium))
    throw new ApiError(
      403,
      !user.verified
        ? "Verify your email to activate access"
        : "An active " +
            (premium ? "Premium " : "") +
            "subscription is required",
    );
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: digest(token),
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  (await cookies()).set("dm_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https:"),
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function rateLimit(key: string, max: number, windowMs: number) {
  const now = new Date();
  await db.$executeRaw`INSERT INTO "RateLimit" ("key","count","resetsAt") VALUES (${key},1,${new Date(Date.now() + windowMs)}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."resetsAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END, "resetsAt" = CASE WHEN "RateLimit"."resetsAt" <= ${now} THEN ${new Date(Date.now() + windowMs)} ELSE "RateLimit"."resetsAt" END`;
  const limit = await db.rateLimit.findUniqueOrThrow({ where: { key } });
  if (limit.count > max)
    throw new ApiError(
      429,
      "Usage limit reached. Try again after " + limit.resetsAt.toISOString(),
    );
}
export function originCheck(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(process.env.APP_URL || "http://localhost:3000").origin
  )
    throw new ApiError(403, "Invalid request origin");
}
export const safeUser = (
  u: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  verified: u.verified,
  role: u.role,
  plan: u.plan,
  status: u.status,
  trialEndsAt: u.trialEndsAt,
  subscriptionEndsAt: u.subscriptionEndsAt,
  preferences: u.preferences,
  access: entitlement(u),
  premium: entitlement(u, true),
});

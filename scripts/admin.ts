import { db } from "../lib/db";
async function main() {
  const email = process.argv[2];
  if (!email)
    throw new Error("Usage: npx tsx scripts/admin.ts user@example.com");
  const user = await db.user.update({
    where: { email },
    data: { role: "ADMIN" },
  });
  await db.audit.create({
    data: { actorId: "operator-cli", action: "role.admin", detail: user.id },
  });
  console.log("Administrator role granted.");
}
main().finally(() => db.$disconnect());

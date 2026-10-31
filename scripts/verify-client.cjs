const fs = require("node:fs");
const content = fs.readFileSync(
  "node_modules/.prisma/client/index.d.ts",
  "utf8",
);
if (!content.includes("export type User ="))
  throw new Error("Prisma client generation failed");
fs.rmSync("work/prisma-generate.json", { force: true });
console.log("Prisma JavaScript client generated and verified.");

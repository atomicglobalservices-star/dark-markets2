import { setupJobs, tick } from "../lib/jobs";
import { db } from "../lib/db";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  await setupJobs();
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, 5000));
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(JSON.stringify({ event: "worker_failed", type: e.name }));
  process.exit(1);
});

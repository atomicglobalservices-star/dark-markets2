import { db } from "../lib/db";
import { setupJobs } from "../lib/jobs";
import { generateReport } from "../lib/reports";
async function main() {
  await setupJobs();
  if (!(await db.report.count())) {
    const report = await generateReport();
    await db.report.create({
      data: { title: "Global market briefing — demonstration", ...report },
    });
  }
  console.log(
    "Jobs and demonstration report prepared. No default accounts created.",
  );
}
main().finally(() => db.$disconnect());

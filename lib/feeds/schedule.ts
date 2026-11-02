import { z } from "zod";
import { Transport } from "./transport";
import type { Instrument } from "./types";
const responseSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      code: z.string(),
      time_zone: z.string(),
      sessions: z.array(
        z.object({
          open_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
          close_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
          session_name: z.string(),
          session_type: z.string(),
        }),
      ),
    }),
  ),
});
export async function exchangeSchedule(
  instrument: Instrument,
  at: Date,
  key: string,
  transport: Transport,
) {
  if (!instrument.venue) throw new Error("No exact exchange venue configured");
  const date = at.toISOString().slice(0, 19);
  const raw = await transport.get(
    "https://api.twelvedata.com/exchange_schedule?mic_name=" +
      encodeURIComponent(instrument.venue) +
      "&date=" +
      encodeURIComponent(date) +
      "&apikey=" +
      encodeURIComponent(key),
    {},
    3600000,
  );
  const parsed = responseSchema.parse(raw);
  const exact = parsed.data.filter(
    (r) => r.name === instrument.venue || r.code === instrument.venue,
  );
  if (!exact.length) throw new Error("Mismatched exchange calendar");
  // Multi-segment exchanges remain separate; do not guess a single schedule from ambiguous MICs.
  return {
    provider: "twelvedata",
    source: "Twelve Data exchange_schedule",
    requestedAt: at.toISOString(),
    schedules: exact.map((r) => {
      new Intl.DateTimeFormat("en", { timeZone: r.time_zone });
      return r;
    }),
  };
}

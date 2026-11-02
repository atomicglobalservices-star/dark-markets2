import { z } from "zod";
import { marketDirectory } from "./market-directory";

export const workspaceTimeframes = ["1m", "5m", "15m", "1h", "1d"] as const;
export const workspaceLimit = 100;
const instrumentId = z.string().min(1).max(160);
const registered = new Set(
  marketDirectory([], "All markets", "", false).map((row) => row.id),
);
export const workspaceAdd = z
  .object({
    instrumentId: instrumentId.refine(
      (id) => registered.has(id),
      "Unknown market instrument",
    ),
  })
  .strict();
export const workspaceUpdate = z
  .object({
    instrumentId,
    timeframe: z.enum(workspaceTimeframes).optional(),
    notes: z.string().max(4000).optional(),
  })
  .strict()
  .refine(
    (value) => value.timeframe !== undefined || value.notes !== undefined,
    "Choose a timeframe or edit notes",
  );
export const workspaceRemove = z.object({ instrumentId }).strict();
const item = z.object({
  instrumentId,
  timeframe: z.enum(workspaceTimeframes),
  notes: z.string().max(4000),
  updatedAt: z.iso.datetime(),
});
export type WorkspaceItem = z.infer<typeof item>;
export function readWorkspace(preferences: unknown): WorkspaceItem[] {
  const rows = (preferences as { workspace?: unknown } | null)?.workspace;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows
    .flatMap((row) => {
      const parsed = item.safeParse(row);
      if (!parsed.success || seen.has(parsed.data.instrumentId)) return [];
      seen.add(parsed.data.instrumentId);
      return [parsed.data];
    })
    .slice(0, workspaceLimit);
}

export const workspaceNotesUpdate = z
  .object({ workspaceNotes: z.string().max(20000) })
  .strict();
export function readWorkspaceNotes(preferences: unknown): string {
  const saved = (preferences as { workspaceNotes?: unknown } | null)
    ?.workspaceNotes;
  if (typeof saved === "string") return saved;
  return readWorkspace(preferences)
    .filter((item) => item.notes)
    .map((item) => `${item.instrumentId}\n${item.notes}`)
    .join("\n\n");
}

const widgetPosition = z
  .object({
    i: z.string().min(1).max(170),
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0).max(5000),
    w: z.number().int().min(4).max(12),
    h: z.number().int().min(8).max(40),
  })
  .strict()
  .refine((p) => p.x + p.w <= 12, "Widget exceeds grid width");
export const workspaceLayoutUpdate = z
  .object({
    workspaceLayout: z
      .array(widgetPosition)
      .max(201)
      .refine(
        (rows) => new Set(rows.map((p) => p.i)).size === rows.length,
        "Duplicate widget",
      ),
  })
  .strict();
export type WorkspacePosition = z.infer<typeof widgetPosition>;
export function readWorkspaceLayout(preferences: unknown): WorkspacePosition[] {
  const result = workspaceLayoutUpdate.safeParse({
    workspaceLayout:
      (preferences as { workspaceLayout?: unknown } | null)?.workspaceLayout ||
      [],
  });
  return result.success ? result.data.workspaceLayout : [];
}
export function completeWorkspaceLayout(
  ids: string[],
  saved: WorkspacePosition[],
  includeNotes = true,
): WorkspacePosition[] {
  const keys = includeNotes ? [...ids, "workspace-notes"] : ids;
  const kept = saved.filter((p) => keys.includes(p.i));
  let bottom = kept.reduce((n, p) => Math.max(n, p.y + p.h), 0);
  return keys.map(
    (i, index) =>
      kept.find((p) => p.i === i) ||
      (saved.length
        ? {
            i,
            x: 0,
            y: (bottom += 12) - 12,
            w: i === "workspace-notes" ? 12 : 6,
            h: 12,
          }
        : {
            i,
            x: i === "workspace-notes" ? 0 : (index % 2) * 6,
            y:
              i === "workspace-notes"
                ? Math.ceil(ids.length / 2) * 12
                : Math.floor(index / 2) * 12,
            w: i === "workspace-notes" ? 12 : 6,
            h: 12,
          }),
  );
}

export const workspaceWidgetTypes = [
  "Market Chart",
  "Notes",
  "AI Analyst",
  "Trend Pressure",
  "Market News",
  "Economic Calendar",
  "Trading Plan",
  "Risk Calculator",
] as const;
const widgetSettings = z
  .object({
    instrumentId: z.string().max(160).optional(),
    timeframe: z.enum(workspaceTimeframes).optional(),
    text: z.string().max(20000).optional(),
    focus: z.string().max(300).optional(),
    title: z.string().max(100).optional(),
    calendarView: z.enum(["native", "official"]).optional(),
    balance: z.number().finite().min(0).max(1e12).optional(),
    riskPercent: z.number().finite().min(0).max(100).optional(),
    entry: z.number().finite().min(0).max(1e12).optional(),
    stop: z.number().finite().min(0).max(1e12).optional(),
  })
  .strict()
  .refine(
    (s) => !s.instrumentId || registered.has(s.instrumentId),
    "Unknown market instrument",
  );
const savedWidget = z
  .object({
    id: z.string().min(1).max(170),
    type: z.enum(workspaceWidgetTypes),
    settings: widgetSettings,
    hidden: z.boolean(),
  })
  .strict();
export type WorkspaceWidget = z.infer<typeof savedWidget>;
export const workspaceWidgetUpdate = z
  .object({
    widget: z
      .object({
        id: z.string().min(1).max(170).optional(),
        type: z.enum(workspaceWidgetTypes).optional(),
        settings: widgetSettings.optional(),
        hidden: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
export function readWorkspaceWidgets(preferences: unknown): WorkspaceWidget[] {
  const raw = (preferences as { workspaceWidgets?: unknown } | null)
    ?.workspaceWidgets;
  const parsed = z
    .array(savedWidget)
    .max(200)
    .safeParse(raw || []);
  const stored = parsed.success ? parsed.data : [];
  const legacy: WorkspaceWidget[] = readWorkspace(preferences).map((item) => ({
    id: item.instrumentId,
    type: "Market Chart",
    settings: { instrumentId: item.instrumentId, timeframe: item.timeframe },
    hidden: false,
  }));
  legacy.push({
    id: "workspace-notes",
    type: "Notes",
    settings: {},
    hidden: false,
  });
  return [
    ...legacy.filter((w) => !stored.some((s) => s.id === w.id)),
    ...stored,
  ];
}

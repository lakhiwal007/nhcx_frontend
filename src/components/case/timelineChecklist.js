// The audit trail's rail is its filter: one row per lane of the case, so a lane
// with failures shows it before anyone filters. tone: bad | warn | idle.

const eventsGroup = (f) => ({
  id: "events",
  title: "Events",
  rows: [
    { id: "all", name: "All events", tone: "idle", fact: String(f.total) },
    f.failures > 0 && { id: "failures", name: "Failures", tone: "bad", fact: String(f.failures) },
    f.verify > 0 && { id: "verify", name: "To verify", tone: "warn", fact: String(f.verify) },
  ].filter(Boolean),
});

export function buildTimelineChecklist(f) {
  const groups = [eventsGroup(f)];
  if (f.lanes.length > 0) {
    groups.push({
      id: "workflow",
      title: "Workflow",
      rows: f.lanes.map((lane) => ({ id: `wf:${lane.id}`, name: lane.label, tone: lane.failures ? "bad" : "idle", fact: lane.failures ? `${lane.failures} of ${lane.count} failed` : String(lane.count) })),
    });
  }
  if (f.money) groups.push({ id: "money", title: "Money", rows: [{ id: "money", name: "Reconciliation", tone: "idle", fact: f.money }] });
  return groups;
}

export function firstTimelineItem(groups, picked) {
  const rows = groups.flatMap((g) => g.rows);
  return rows.some((r) => r.id === picked) ? picked : "all";
}

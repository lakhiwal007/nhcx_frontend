import path from "node:path";
import ExcelJS from "exceljs";
import { fmtDate, fmtTime, STATUSES } from "./model.mjs";

const FILL = { pass: "FFC6EFCE", fail: "FFFFC7CE", blocked: "FFFFEB9C", skipped: "FFE7E6E6" };

const header = (sheet, columns) => {
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
};

const colour = (cell, value) => {
  const fill = FILL[String(value || "").toLowerCase()];
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
};

export async function writeWorkbook(model, outPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = model.preparedBy;
  wb.created = model.builtAt;

  const summary = wb.addWorksheet("Summary");
  header(summary, [{ header: "Requirement", key: "k", width: 34 }, { header: "Details", key: "v", width: 80 }]);
  const rows = [
    ["Document title", model.title],
    ["Document id", model.docId],
    ["Entity name", model.entity],
    ["Product name", model.product + (model.commit ? ` (build ${model.commit})` : "")],
    ["Workflow", "NHCX provider integration, claim lifecycle"],
    ["Skill and version", model.skill],
    ["Knowledge source and version", model.knowledge],
    ["Test execution dates", model.dates.first ? `${fmtDate(model.dates.first)} to ${fmtDate(model.dates.last)}` : "not recorded"],
    ["Number of days", model.dates.days],
    ["Test executed by", model.preparedBy],
    ["Sandbox", "NHCX sandbox"],
    ["Participant code", model.participantCode || "not recorded"],
    ["Runners", model.runnerLabel],
    ["Browser", model.browsers.join(", ") || "none"],
    ["Report release date", model.builtOn],
  ];
  for (const r of model.runners) for (const s of STATUSES) rows.push([`${r.toUpperCase()} ${s}`, model.summary.byRunner[r][s]]);
  for (const s of STATUSES) rows.push([`All ${s}`, model.summary.total[s]]);
  rows.forEach(([k, v]) => summary.addRow({ k, v }));

  const cases = wb.addWorksheet("Test cases");
  header(cases, [
    { header: "Sr no", key: "sr", width: 7 }, { header: "Test id", key: "id", width: 8 }, { header: "Test title", key: "title", width: 40 },
    { header: "Payer", key: "payer", width: 8 }, { header: "Runner", key: "runner", width: 8 }, { header: "Claim no", key: "claim", width: 18 },
    { header: "Step no", key: "step", width: 8 }, { header: "Step", key: "what", width: 48 }, { header: "Expected result", key: "expected", width: 60 },
    { header: "Actual result", key: "got", width: 40 }, { header: "Status", key: "status", width: 10 }, { header: "Screenshot", key: "shot", width: 44 },
    { header: "Correlation id", key: "corr", width: 38 }, { header: "Ledger ids", key: "ledger", width: 24 }, { header: "Time", key: "time", width: 22 },
    { header: "Attempt", key: "attempt", width: 8 }, { header: "Cause", key: "cause", width: 20 },
  ]);
  let sr = 0;
  for (const t of model.tests) {
    for (const s of t.steps) {
      sr += 1;
      const shots = s.screenshots;
      const row = cases.addRow({
        sr, id: t.id, title: t.title, payer: t.payer.toUpperCase(), runner: t.runner.toUpperCase(), claim: t.claim, step: s.index, what: s.what,
        expected: s.expected, got: s.got, status: s.result, shot: shots.map((x) => x.file).join("\n"),
        corr: s.correlationId || t.correlationIds.join("\n"), ledger: (s.ledgerIds.length ? s.ledgerIds : t.ledgerIds).join("\n"),
        time: fmtTime(s.at), attempt: t.attempts, cause: s.cause || (s.result === "fail" || s.result === "blocked" ? t.cause : ""),
      });
      colour(row.getCell("status"), s.result);
      if (shots.length === 1 && shots[0].exists) {
        row.getCell("shot").value = { text: shots[0].file, hyperlink: `file:///${path.resolve(shots[0].abs).replace(/\\/g, "/")}` };
        row.getCell("shot").font = { color: { argb: "FF0563C1" }, underline: true };
      }
      row.alignment = { vertical: "top", wrapText: true };
    }
  }

  const checks = wb.addWorksheet("Setup checks");
  header(checks, [{ header: "Check", key: "check", width: 30 }, { header: "Runner", key: "runner", width: 10 }, { header: "Result", key: "result", width: 10 }, { header: "Detail", key: "detail", width: 80 }]);
  for (const c of model.setupChecks) {
    const row = checks.addRow({ check: c.check, runner: (c.runner || model.runnerLabel).toUpperCase(), result: c.result, detail: c.detail || "" });
    colour(row.getCell("result"), c.result === "pass" ? "pass" : "fail");
  }

  const decisions = wb.addWorksheet("Payer decisions");
  header(decisions, [
    { header: "Test id", key: "id", width: 8 }, { header: "Runner", key: "runner", width: 8 }, { header: "Case", key: "case", width: 18 }, { header: "Stage", key: "stage", width: 14 },
    { header: "Role", key: "role", width: 18 }, { header: "Action", key: "action", width: 14 }, { header: "Result", key: "result", width: 12 }, { header: "Trail", key: "trail", width: 60 }, { header: "Time", key: "time", width: 22 },
  ]);
  for (const d of model.decisions) {
    const trail = Array.isArray(d.trail) ? d.trail.map((x) => (typeof x === "string" ? x : `${x.role || ""} ${x.action || ""} ${x.result || ""}`.trim())).join(" -> ") : d.trail || "";
    decisions.addRow({ id: d.testId, runner: d.runner.toUpperCase(), case: d.case || d.claim || "", stage: d.stage || "", role: d.role || "", action: d.action || "", result: d.result || "", trail, time: fmtTime(d.at) });
  }

  const tools = wb.addWorksheet("Tools");
  header(tools, [{ header: "S no", key: "sr", width: 7 }, { header: "Name", key: "name", width: 40 }, { header: "Version", key: "version", width: 24 }, { header: "Open source or licensed", key: "licence", width: 22 }]);
  model.tools.forEach((t, i) => tools.addRow({ sr: i + 1, name: t.name, version: t.version || "not recorded", licence: t.licence }));

  await wb.xlsx.writeFile(outPath);
  return { rows: sr };
}

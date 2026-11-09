import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { catalogue, loadRun, buildModel } from "./model.mjs";
import { renderPdf } from "./pdf.mjs";
import { writeWorkbook } from "./workbook.mjs";

const require = createRequire(import.meta.url);
const version = (name) => {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    return "";
  }
};

const USAGE = `nhcx-e2e report [--report <e2e.json>] [--out <dir>] [--title <text>] [--channel chromium|chrome|msedge]
nhcx-e2e skeleton [--out <e2e.json>] [--only irdai|pmjay|T3,T5,...] [--runner gui|cli|both] [--force]

Environment: NHCX_TEST_REPORT, NHCX_TEST_FT_DIR, NHCX_TEST_FT_ENTITY, NHCX_TEST_FT_PRODUCT,
NHCX_TEST_FT_PREPARED_BY, NHCX_TEST_FT_DOC_VERSION, NHCX_TEST_FT_REPORT_TYPE, NHCX_TEST_APP_URL.`;

const parseArgs = (argv) => {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
};

const defaultReportPath = (given) => {
  const candidates = [given, process.env.NHCX_TEST_REPORT, "nhcx-plan/e2e.json", path.join("..", "nhcx-service", "nhcx-plan", "e2e.json")].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return path.resolve(c);
  return path.resolve(candidates[0]);
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function report(args) {
  const reportPath = defaultReportPath(args.report);
  const { run, error } = loadRun(reportPath);
  if (error) {
    console.error(error);
    return 2;
  }
  const outDir = path.resolve(args.out || process.env.NHCX_TEST_FT_DIR || path.join(path.dirname(reportPath), "ft-report"));
  fs.mkdirSync(outDir, { recursive: true });
  const model = buildModel(run, {
    reportPath, title: args.title, playwrightVersion: version("playwright"), exceljsVersion: version("exceljs"), pdfLibVersion: version("pdf-lib"),
  });
  if (model.buildErrors.length) {
    console.error("The report cannot be built: a GUI step marked pass has no screenshot.");
    model.buildErrors.forEach((e) => console.error(`  ${e}`));
    return 1;
  }
  const stem = `FT-report-${today()}`;
  const pdfPath = path.join(outDir, `${stem}.pdf`);
  const xlsxPath = path.join(outDir, `${stem}.xlsx`);
  const pdf = await renderPdf(model, pdfPath, { channel: args.channel });
  const xlsx = await writeWorkbook(model, xlsxPath);
  console.log(`${pdfPath}  (${pdf.pages} pages)`);
  console.log(`${xlsxPath}  (${xlsx.rows} test step rows)`);
  if (!model.guiDriven) console.log("CLI runner only; screens not driven.");
  return 0;
}

function skeleton(args) {
  const outPath = path.resolve(args.out || process.env.NHCX_TEST_REPORT || path.join("..", "nhcx-service", "nhcx-plan", "e2e.json"));
  if (fs.existsSync(outPath) && !args.force) {
    console.error(`${outPath} exists; pass --force to overwrite it.`);
    return 2;
  }
  const only = String(args.only || "").toLowerCase();
  const ids = only.split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^T\d+$/.test(s));
  const picked = catalogue.tests.filter((t) => (ids.length ? ids.includes(t.id) : !only || only === t.payer || only === "all"));
  const runners = args.runner === "both" ? ["gui", "cli"] : [args.runner || "gui"];
  const now = new Date().toISOString();
  const tests = [];
  for (const t of picked) {
    for (const runner of runners) {
      const pmjayBlocked = t.payer === "pmjay";
      tests.push({
        id: t.id, runner, browser: runner === "gui" ? "chromium" : "none", plan_source: t.payer === "pmjay" ? "seed" : "n/a",
        claim: "", correlation_ids: [], ledger_ids: [], decisions: [], started_at: "", ended_at: "",
        artifacts_dir: `nhcx-plan/artifacts/${t.id}/${runner}`,
        steps: t.steps.map((s, i) => ({
          at: "", title: s.what, what: s.what, expected: s.expected, result: "blocked", got: pmjayBlocked ? "" : "not run yet",
          screenshots: [], screenshot_hint: `nhcx-plan/artifacts/${t.id}/${runner}/${String(i + 1).padStart(2, "0")}-${s.slug}-after.png`,
        })),
        result: "blocked", cause: "setup", detail: pmjayBlocked ? "No PMJAY sandbox member id (NHCX_TEST_PMJAY_MEMBER_ID)" : "not run yet", attempts: 0,
      });
    }
  }
  const body = {
    run_at: now,
    config: {
      irdai_payer: catalogue.payers.irdai.code, irdai_member: "", pmjay_payer: catalogue.payers.pmjay.code, pmjay_member: "missing",
      entity: "", product: "Care HMIS (nhcx-service and nhcx_cli)", product_version: "", commit: "", participant_code: "", app_url: "",
      credentials: "set", skill: "nhcx-full 1.11.0", knowledge: "nhcx-docs MCP catalogue 2026.09.16", os: process.platform,
      commands: { gui: "manual walk through the screens, screenshots taken per step", cli: "" },
    },
    setup_checks: [
      { check: "session token", result: "pass", detail: "" },
      { check: "participant record", result: "pass", detail: "" },
      { check: "encryption certificate", result: "pass", detail: "" },
      { check: "registered endpoint", result: "pass", detail: "" },
    ],
    tests,
    summary: { pass: 0, fail: 0, blocked: tests.length, skipped: 0 },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(body, null, 2) + "\n");
  console.log(`${outPath}  (${tests.length} test entries, ${tests.reduce((n, t) => n + t.steps.length, 0)} steps)`);
  console.log("Fill each step's result, got, at and screenshots, then run: npm run ft:report");
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
let code;
if (command === "report") code = await report(args);
else if (command === "skeleton") code = skeleton(args);
else {
  console.log(USAGE);
  code = command ? 2 : 0;
}
process.exit(code);

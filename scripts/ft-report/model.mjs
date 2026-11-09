import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const catalogue = JSON.parse(fs.readFileSync(path.join(here, "tests.json"), "utf8"));
export const testById = Object.fromEntries(catalogue.tests.map((t) => [t.id, t]));
export const STATUSES = ["pass", "fail", "blocked", "skipped"];

const TZ = "Asia/Kolkata";

export function loadRun(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return { error: `No run file at ${reportPath || "(unset)"}.` };
  let run;
  try {
    run = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (err) {
    return { error: `${reportPath} is not valid JSON: ${err.message}` };
  }
  if (!Array.isArray(run.tests) || run.tests.length === 0) return { error: `${reportPath} holds no test entries.` };
  return { run };
}

export const maskTail = (value, keep = 4) => {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (s.length <= keep) return "*".repeat(s.length);
  return "*".repeat(s.length - keep) + s.slice(-keep);
};

export const setOrMissing = (value) => (value === "set" || (value && value !== "missing") ? "set" : "missing");

export const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
};

export const fmtTime = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return iso ? String(iso) : "";
  return `${fmtDate(iso)}, ${d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })} IST`;
};

const isoDay = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

const normalizeStatus = (value, fallback = "blocked") => {
  const s = String(value || "").toLowerCase();
  return STATUSES.includes(s) ? s : fallback;
};

const resolveShot = (file, roots) => {
  if (!file) return null;
  if (path.isAbsolute(file)) return { file, abs: file, exists: fs.existsSync(file) };
  for (const root of roots) {
    const abs = path.resolve(root, file);
    if (fs.existsSync(abs)) return { file, abs, exists: true };
  }
  return { file, abs: path.resolve(roots[0], file), exists: false };
};

const uniq = (list) => Array.from(new Set(list.filter(Boolean)));

const sortIds = (ids) => uniq(ids).sort((a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a.localeCompare(b)));

export function buildModel(run, options = {}) {
  const env = process.env;
  const reportPath = options.reportPath ? path.resolve(options.reportPath) : null;
  const reportDir = reportPath ? path.dirname(reportPath) : process.cwd();
  const roots = uniq([reportDir, path.dirname(reportDir), process.cwd(), options.artifactsRoot && path.resolve(options.artifactsRoot)]);
  const cfg = run.config || {};
  const now = new Date();

  const product = options.product || env.NHCX_TEST_FT_PRODUCT || cfg.product || "Care HMIS (nhcx-service and nhcx_cli)";
  const entity = options.entity || env.NHCX_TEST_FT_ENTITY || cfg.entity || "the facility under test";
  const skill = cfg.skill || "nhcx-full 1.11.0";
  const preparedBy = env.NHCX_TEST_FT_PREPARED_BY || cfg.prepared_by || `nhcx-e2e runner, ${skill}`;
  const docVersion = env.NHCX_TEST_FT_DOC_VERSION || cfg.doc_version || "V1";
  const reportType = env.NHCX_TEST_FT_REPORT_TYPE || cfg.report_type || "First Functional Test Report";

  const tests = run.tests.map((t, index) => {
    const spec = testById[t.id] || { id: t.id, title: t.title || t.id, payer: t.payer || "irdai", steps: [], screens: [], apis: [], callbacks: [], proves: "" };
    const runner = String(t.runner || "cli").toLowerCase();
    const steps = (t.steps || []).map((s, i) => ({
      index: i + 1,
      at: s.at || "",
      what: s.what || spec.steps[i]?.what || `step ${i + 1}`,
      title: s.title || spec.steps[i]?.what || s.what || `Step ${i + 1}`,
      expected: s.expected || spec.steps[i]?.expected || "",
      result: normalizeStatus(s.result, t.result === "skipped" ? "skipped" : "blocked"),
      got: s.got || "",
      correlationId: s.correlation_id || "",
      ledgerIds: s.ledger_ids || [],
      cause: s.cause || "",
      log: s.log || "",
      screenshots: (s.screenshots || []).map((f) => resolveShot(f, roots)).filter(Boolean),
      decisions: (t.decisions || []).filter((d) => d.step === i + 1 || d.after_step === i + 1),
    }));
    const attached = (t.decisions || []).filter((d) => !steps.some((s) => s.decisions.includes(d)));
    return {
      index,
      id: t.id,
      title: spec.title,
      payer: spec.payer,
      proves: spec.proves,
      spec,
      runner,
      browser: t.browser || (runner === "gui" ? "unknown browser" : "none"),
      planSource: t.plan_source || "n/a",
      claim: t.claim || "",
      correlationIds: t.correlation_ids || [],
      ledgerIds: t.ledger_ids || [],
      decisions: (t.decisions || []).map((d) => ({ ...d, screenshot: d.screenshot ? resolveShot(d.screenshot, roots) : null })),
      trailingDecisions: attached,
      startedAt: t.started_at || steps[0]?.at || "",
      endedAt: t.ended_at || steps[steps.length - 1]?.at || "",
      steps,
      result: normalizeStatus(t.result),
      cause: t.cause || "",
      detail: t.detail || "",
      attempts: t.attempts || 1,
    };
  });

  const runners = uniq(tests.map((t) => t.runner));
  const runnerLabel = runners.includes("cli") && runners.includes("gui") ? "CLI and GUI" : runners.includes("gui") ? "GUI only" : "CLI only";
  const guiDriven = tests.some((t) => t.runner === "gui" && t.result !== "blocked");
  const browsers = uniq(tests.filter((t) => t.runner === "gui" && t.result !== "blocked").map((t) => t.browser));

  const stamps = tests.flatMap((t) => [t.startedAt, t.endedAt, ...t.steps.map((s) => s.at)]).map((v) => new Date(v)).filter((d) => !Number.isNaN(d.getTime()));
  const first = stamps.length ? new Date(Math.min(...stamps)) : null;
  const last = stamps.length ? new Date(Math.max(...stamps)) : null;
  const days = first && last ? Math.floor((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000) + 1 : 0;

  const counts = (list) => Object.fromEntries(STATUSES.map((s) => [s, list.filter((t) => t.result === s).length]));
  const summary = { total: counts(tests), byRunner: Object.fromEntries(runners.map((r) => [r, counts(tests.filter((t) => t.runner === r))])) };

  const payers = Object.values(catalogue.payers).map((p) => {
    const mine = tests.filter((t) => t.payer === p.key);
    if (mine.length === 0) return null;
    const code = cfg[`${p.key}_payer`] || p.code;
    const memberRaw = cfg[`${p.key}_member`];
    const member = p.key === "pmjay" ? setOrMissing(memberRaw) : maskTail(memberRaw);
    const specs = uniq(mine.map((t) => t.id)).map((id) => testById[id]).filter(Boolean);
    const planSources = uniq(mine.map((t) => t.planSource).filter((v) => v && v !== "n/a"));
    return {
      ...p,
      code,
      member,
      tests: mine,
      results: runners.map((r) => ({ runner: r, line: mine.filter((t) => t.runner === r).map((t) => `${t.id} ${t.result}`).join(", ") })).filter((x) => x.line),
      claims: uniq(mine.map((t) => t.claim)),
      exchanges: sortIds(specs.flatMap((s) => [...s.apis, ...s.callbacks])),
      url: cfg.app_url || env.NHCX_TEST_APP_URL || "",
      credentials: setOrMissing(cfg.credentials ?? (env.NHCX_TEST_USER && env.NHCX_TEST_PASSWORD ? "set" : cfg.credentials)),
      screenshots: mine.reduce((n, t) => n + t.steps.reduce((m, s) => m + s.screenshots.filter((x) => x.exists).length, 0), 0),
      packageMaster: p.key === "pmjay" ? (planSources.includes("payer") ? "payer's own" : planSources.includes("seed") ? "seed" : "not requested") : "payer's own",
    };
  }).filter(Boolean);

  const inScope = uniq(tests.map((t) => t.id)).map((id) => testById[id]).filter(Boolean);
  const scope = {
    tests: inScope,
    screens: sortIds(inScope.flatMap((s) => s.screens)),
    apis: sortIds(inScope.flatMap((s) => s.apis)),
    callbacks: sortIds(inScope.flatMap((s) => s.callbacks)),
    exchangesLabel: scopeLabel(inScope),
  };

  const buildErrors = [];
  for (const t of tests) {
    if (t.runner !== "gui" || t.result !== "pass") continue;
    for (const s of t.steps) {
      if (s.screenshots.filter((x) => x.exists).length === 0) buildErrors.push(`${t.id} gui step ${s.index} (${s.what}) passed with no screenshot`);
    }
  }

  const runnerRows = runners.map((r) => {
    const mine = tests.filter((t) => t.runner === r);
    const cmd = cfg.commands?.[r] || cfg[`${r}_command`] || "";
    const when = uniq(mine.map((t) => t.startedAt)).filter(Boolean).sort()[0] || run.run_at || "";
    return { runner: r.toUpperCase(), browser: r === "gui" ? browsers.join(", ") || "none" : "none", os: cfg.os || process.platform, skill, command: cmd, when };
  });

  const tools = [
    { name: browsers[0] ? browsers[0].split(" ")[0] : "Browser", version: browsers[0] ? browsers[0].split(" ").slice(1).join(" ") || "" : "none", licence: "Open source" },
    { name: "Playwright", version: options.playwrightVersion || "", licence: "Open source" },
    { name: product, version: cfg.product_version || cfg.commit || "", licence: "Licensed" },
    { name: "Node.js", version: process.version, licence: "Open source" },
    { name: "NHA NHCX skill", version: skill, licence: "Open source" },
    { name: "exceljs", version: options.exceljsVersion || "", licence: "Open source" },
    { name: "pdf-lib", version: options.pdfLibVersion || "", licence: "Open source" },
  ];

  const failures = tests.filter((t) => t.result === "fail" || t.result === "blocked").map((t) => ({ id: t.id, runner: t.runner, result: t.result, cause: t.cause, detail: t.detail || t.steps.find((s) => s.result === t.result)?.got || "" }));

  return {
    product, entity, skill, preparedBy, docVersion, reportType,
    title: options.title || `Functional testing: ${product}, ${entity}`,
    docId: `FT-NHCX-${isoDay(now)}`,
    builtAt: now,
    builtOn: fmtDate(now.toISOString()),
    runAt: run.run_at || "",
    knowledge: cfg.knowledge || "nhcx-docs MCP catalogue 2026.09.16",
    commit: cfg.commit || "",
    participantCode: cfg.participant_code || "",
    url: cfg.app_url || env.NHCX_TEST_APP_URL || "",
    tests, runners, runnerLabel, guiDriven, browsers,
    dates: { first: first ? first.toISOString() : "", last: last ? last.toISOString() : "", days },
    summary, payers, scope, setupChecks: run.setup_checks || [], runnerRows, tools, failures, buildErrors,
    decisions: tests.flatMap((t) => t.decisions.map((d) => ({ ...d, testId: t.id, runner: t.runner }))),
  };
}

function scopeLabel(specs) {
  const ids = specs.map((s) => Number(s.id.slice(1)));
  const parts = [];
  if (ids.some((n) => n === 3 || n === 13)) parts.push("policy search and eligibility");
  if (ids.some((n) => n === 4 || n === 13)) parts.push("insurance plan");
  if (ids.some((n) => [5, 6, 7, 8, 9, 14, 15, 16].includes(n))) parts.push("pre-authorisation");
  if (ids.some((n) => [10, 17].includes(n))) parts.push("claim");
  if (ids.some((n) => [11, 18].includes(n))) parts.push("payment");
  if (ids.some((n) => n === 12)) parts.push("reprocess and release");
  if (ids.some((n) => n === 19)) parts.push("beneficiary verification");
  return parts.length ? parts.join(", ") : "the NHCX exchanges in scope";
}

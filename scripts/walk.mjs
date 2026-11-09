import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const PORT = Number(process.env.WALK_PORT || 5174);
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.WALK_OUT || path.join(repo, ".playwright-mcp", "walk");
const PROVIDER = "1000099999@hcx";
const FACILITY = "City General Hospital";

const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith("--only="))?.slice(7);
const quick = args.has("--quick");

const ROUTES = [
  "/work-queue",
  "/dashboard",
  "/registry",
  "/registry?child_id=12",
  "/registry?child_id=19",
  "/communications",
  "/payments",
  "/payments?view=unlinked",
  "/analytics",
  "/settings",
  "/case/12/payer",
  "/case/12/payer?discover=1",
  "/case/12/prep",
  "/case/12/review",
  "/case/12/status",
  "/case/12/enhancement",
  "/case/12/claim",
  "/case/12/reprocess",
  "/case/12/payment",
  "/case/12/timeline",
  "/case/12/review?open=draft&pa=warn",
  "/case/12/status?open=1&ap=queried",
  "/case/12/status?open=1&ap=rejected",
  "/case/12/status?open=1&ap=failed",
  "/case/12/claim?open=1&cl=discharge_queried",
  "/case/19/review",
  "/case/19/status",
];

const STRICT_PRIMARY = [];

const VIEWPORTS = quick ? [{ name: "1280", width: 1280, height: 800 }] : [
  { name: "1280", width: 1280, height: 800 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = quick ? ["light"] : ["light", "dark"];

const BAD_TEXT = /\b(undefined|NaN|null|\[object Object\])\b/;
const NOISE = [/React DevTools/i, /Download the React DevTools/i, /\[vite\]/i, /favicon/i];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(BASE + "/");
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Vite did not answer on ${BASE} within ${timeoutMs / 1000}s`);
}

function startVite() {
  const bin = path.join(repo, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [bin, "--port", String(PORT), "--strictPort"], {
    cwd: repo,
    env: { ...process.env, VITE_USE_MOCK: "true", BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}

async function walkOne(browser, route, viewport, theme) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme });
  await context.addInitScript(
    ({ provider, facility, theme }) => {
      localStorage.setItem("nhcx_default_provider_id", provider);
      localStorage.setItem("nhcx_default_facility_name", facility);
      localStorage.setItem("nhcx_theme", theme);
      localStorage.setItem("nhcx_show_tips", "true");
      localStorage.setItem("nhcx_workflow_schema", "2");
      localStorage.setItem("nhcx_workflow_12", JSON.stringify({ cashless_case_id: 4 }));
      localStorage.setItem("nhcx_workflow_4", JSON.stringify({ cashless_case_id: 4, preauthCorrelationId: "preauth-corr-101", claimCorrelationId: "claim-corr-101" }));
      sessionStorage.removeItem("nhcx_mock_open");
    },
    { provider: PROVIDER, facility: FACILITY, theme },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (NOISE.some((re) => re.test(text))) return;
    errors.push(`console.${msg.type()}: ${text.slice(0, 300)}`);
  });
  const result = { route, viewport: viewport.name, theme, errors, badText: [], overflow: false, primaries: 0, h1: 0, failed: false };
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".spinner"), null, { timeout: 15000 }).catch(() => {});
    await sleep(2200);
    const probe = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const el = document.documentElement;
      const content = document.querySelector(".content, .main-view") || el;
      const visible = (node) => {
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== "hidden";
      };
      const primaries = [...document.querySelectorAll(".cv-btn.is-primary, .btn-primary-modern")].filter(visible).length;
      return {
        text,
        overflow: el.scrollWidth > window.innerWidth + 1 || content.scrollWidth > content.clientWidth + 1,
        primaries,
        h1: document.querySelectorAll("h1").length,
      };
    });
    const bad = [];
    for (const line of probe.text.split("\n")) {
      if (BAD_TEXT.test(line)) bad.push(line.trim().slice(0, 120));
    }
    result.badText = bad;
    result.overflow = probe.overflow;
    result.primaries = probe.primaries;
    result.h1 = probe.h1;
    const file = `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "root"}-${viewport.name}-${theme}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    result.screenshot = file;
  } catch (err) {
    errors.push(`walk: ${err.message}`);
  } finally {
    await context.close();
  }
  const strict = STRICT_PRIMARY.some((prefix) => route.startsWith(prefix));
  result.failed = errors.length > 0 || result.badText.length > 0 || result.overflow || (strict && result.primaries > 1);
  return result;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const vite = startVite();
  let exitCode = 0;
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const results = [];
    const routes = only ? ROUTES.filter((r) => r.includes(only)) : ROUTES;
    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const res = await walkOne(browser, route, viewport, theme);
          results.push(res);
          const flag = res.failed ? "FAIL" : "ok  ";
          console.log(`${flag} ${route.padEnd(44)} ${viewport.name.padEnd(5)} ${theme.padEnd(5)} primaries=${res.primaries} h1=${res.h1}${res.overflow ? " overflow" : ""}${res.badText.length ? ` badText=${res.badText.length}` : ""}${res.errors.length ? ` errors=${res.errors.length}` : ""}`);
          for (const line of res.errors) console.log(`       ${line}`);
          for (const line of res.badText) console.log(`       text: ${line}`);
        }
      }
    }
    await browser.close();
    writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => r.failed).length;
    console.log(`\n${results.length - failed}/${results.length} views clean. Report: ${path.join(OUT, "report.json")}`);
    exitCode = failed ? 1 : 0;
  } catch (err) {
    console.error(err.message);
    exitCode = 2;
  } finally {
    vite.kill();
  }
  process.exit(exitCode);
}

main();

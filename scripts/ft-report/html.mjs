import fs from "node:fs";
import path from "node:path";
import { fmtDate, fmtTime, STATUSES } from "./model.mjs";

export const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; color: #1b1b1b; margin: 0; line-height: 1.4; }
  h1 { font-size: 20pt; margin: 0 0 14px; }
  h2 { font-size: 14pt; margin: 0 0 10px; border-bottom: 1px solid #999; padding-bottom: 4px; }
  h3 { font-size: 11.5pt; margin: 16px 0 6px; }
  p { margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 12px; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 9.5pt; }
  th { background: #efefef; font-weight: 600; }
  td.num { width: 34px; text-align: right; }
  .section { page-break-before: always; }
  .section:first-child { page-break-before: auto; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
  .cover table { width: 80%; margin: 0 auto; font-size: 11.5pt; }
  .cover th { width: 36%; }
  .cover .note { text-align: center; color: #8a4b00; margin-top: 24px; font-weight: 600; }
  .toc td { border: none; padding: 2px 4px; }
  .toc td.pg { text-align: right; width: 40px; }
  .toc tr.sub td:first-child { padding-left: 22px; }
  .meta { color: #555; font-size: 9pt; }
  .proof { margin: 10px 0 14px; page-break-inside: avoid; }
  .proof .claim { font-weight: 600; }
  .proof figure { margin: 6px 0 0; text-align: center; }
  .proof img { max-width: 100%; max-height: 112mm; object-fit: contain; border: 1px solid #ccc; }
  .proof figcaption { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .got { color: #b00020; font-weight: 600; margin-top: 4px; }
  .log { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; background: #f6f6f6; border: 1px solid #ccc; padding: 6px 8px; white-space: pre-wrap; margin-top: 6px; }
  .payer-side { border-left: 3px solid #4a6fa5; padding: 4px 8px; margin: 8px 0; background: #f3f6fb; font-size: 9.5pt; }
  .status { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 9pt; font-weight: 600; }
  .status.pass { background: #c6efce; color: #1f5f2a; }
  .status.fail { background: #ffc7ce; color: #7a0010; }
  .status.blocked { background: #ffeb9c; color: #6b4a00; }
  .status.skipped { background: #e7e6e6; color: #444; }
  .blank { display: inline-block; min-width: 180px; border-bottom: 1px solid #333; height: 12px; }
`;

const status = (s) => `<span class="status ${esc(s)}">${esc(s)}</span>`;

const table = (headers, rows, opts = {}) => {
  const head = headers.map((h, i) => `<th${i === 0 && opts.numbered ? ' class="num"' : ""}>${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 && opts.numbered ? ' class="num"' : ""}>${c === undefined || c === null ? "" : c}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
};

const kv = (rows) => table(["Sr no", "Requirement", "Details"], rows.map((r, i) => [i + 1, esc(r[0]), r[1]]), { numbered: true });

const dataUri = (abs) => {
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${buf.toString("base64")}`;
};

export const wrap = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${inner}</body></html>`;

export function coverHtml(m) {
  const scope = `Functional testing of ${esc(m.product)} on NHCX: ${esc(m.scope.exchangesLabel)}`;
  return wrap(`<div class="cover">
    <table>
      <tr><th>Type of test</th><td>${scope}</td></tr>
      <tr><th>Type of report</th><td>${esc(m.reportType)}</td></tr>
      <tr><th>Report release date</th><td>${esc(m.builtOn)}</td></tr>
    </table>
    ${m.guiDriven ? "" : `<p class="note">CLI runner only; screens not driven. This is a results report, not a proof of the screens.</p>`}
  </div>`);
}

export function buildSections(m) {
  const sections = [];
  const add = (key, number, title, body, sub = false) => sections.push({ key, number, title, body, sub });

  add("doc-control", "2", "Document control", `
    <h3>Document preparation</h3>
    ${table(["Item", "Value"], [
      ["Document title", esc(m.title)],
      ["Document id", esc(m.docId)],
      ["Document version", esc(m.docVersion)],
      ["Prepared by", esc(m.preparedBy)],
      ["Reviewed by", `<span class="blank"></span>`],
      ["Approved by", `<span class="blank"></span>`],
      ["Release date", esc(m.builtOn)],
    ])}
    <h3>Document change history</h3>
    ${table(["Version", "Date", "Change"], [[esc(m.docVersion), esc(m.builtOn), `Generated from e2e.json run at ${esc(fmtTime(m.runAt) || "an unrecorded time")}`]])}
    <h3>Document distribution</h3>
    ${table(["Name", "Role", "Organisation", "Date"], [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]])}
  `);

  add("contents", "3", "Contents", "");

  add("summary", "4", "Test summary", kv([
    ["Entity name", esc(m.entity)],
    ["Product name", esc(m.product) + (m.commit ? ` (build ${esc(m.commit)})` : "")],
    ["Workflow", "NHCX provider integration, claim lifecycle"],
    ["Skill and version", esc(m.skill)],
    ["Knowledge source and version", esc(m.knowledge)],
    ["Test execution dates", m.dates.first ? `${esc(fmtDate(m.dates.first))} to ${esc(fmtDate(m.dates.last))}` : "not recorded"],
    ["Number of days", String(m.dates.days)],
    ["Test executed by", esc(m.preparedBy)],
    ["Sandbox", "NHCX sandbox"],
    ["Participant code", esc(m.participantCode || "not recorded")],
    ["Runners", esc(m.runnerLabel)],
    ["Browser", esc(m.browsers.join(", ") || "none")],
  ]));

  const payerBlocks = m.payers.map((p) => `
    <h3>${esc(p.name)}</h3>
    ${kv([
      ["Payer", `${esc(p.name)}, ${esc(p.code)}`],
      ["Member id", esc(p.member || "not recorded")],
      ["Tests in scope and results", p.results.map((r) => `${esc(r.runner.toUpperCase())}: ${esc(r.line)}`).join("<br>") || "none"],
      ["Claims created", esc(p.claims.join(", ") || "none recorded")],
      ["Exchanges exercised", esc(p.exchanges.join(", "))],
      ["URL", esc(p.url || "not recorded")],
      ["Credentials", esc(p.credentials)],
      ["Recordings available", `screenshots: ${p.screenshots}`],
      ["Package master", esc(p.packageMaster)],
    ])}`).join("");
  add("payers", "5", "Per-payer flow", payerBlocks || "<p>No payer in scope.</p>");

  add("introduction", "6", "Introduction", `
    <h3>A. Background</h3>
    <p>${esc(m.product)} is the hospital management system under test at ${esc(m.entity)}. It files cashless claims over the National Health Claims Exchange through its own NHCX service and desk screens.</p>
    <h3>B. Objectives, assumptions and limitations</h3>
    <p>The objective is to prove that the NHCX exchanges in scope work end to end against the NHCX sandbox, through the screens and the services.</p>
    <p>Findings are limited to the application as tested, at the code base and configuration of the run${m.commit ? ` (build ${esc(m.commit)})` : ""}, against the sandbox payers and test beneficiaries of that day. Later changes may invalidate them. A sandbox payer's auto-decisions stand in for a human adjudicator.</p>
  `);

  add("scope", "7", "Scope", `
    <h3>Tests in scope</h3>
    ${table(["Test", "Title", "Payer", "What it proves"], m.scope.tests.map((t) => [esc(t.id), esc(t.title), esc(t.payer.toUpperCase()), esc(t.proves)]))}
    <h3>Platforms tested</h3>
    <p>${esc(m.url || "URL not recorded")}</p>
    <h3>Coverage</h3>
    ${table(["Kind", "Ids"], [
      ["Screens", esc(m.scope.screens.join(", "))],
      ["APIs", esc(m.scope.apis.join(", "))],
      ["Callbacks", esc(m.scope.callbacks.join(", "))],
    ])}
  `);

  add("execution", "8", "Test execution details", `
    ${table(["Runner", "Browser", "Operating system", "Skill", "Command", "When"], m.runnerRows.map((r) => [esc(r.runner), esc(r.browser), esc(r.os), esc(r.skill), `<span class="log">${esc(r.command || "not recorded")}</span>`, esc(fmtTime(r.when))]))}
    <h3>Setup checks</h3>
    ${m.setupChecks.length ? table(["Check", "Result", "Detail"], m.setupChecks.map((c) => [esc(c.check), status(c.result === "pass" ? "pass" : "fail"), esc(c.detail || "")])) : "<p>No setup checks recorded.</p>"}
  `);

  add("method", "9", "Approach and methodology", `
    <p>The run starts with the setup checks: session token, participant record, certificate match and the registered endpoint probe. Both runners then run every test in scope, each test opening its own claim for the test beneficiary. The payer's side is driven through the adjudicator user role and the adjudicator process case calls. Each step that waits on the payer waits for the callback first, then polls the ledger.</p>
    <p>Results are classed as follows. <b>pass</b> means the step behaved as the test expects and the screen showed it. <b>fail</b> means it did not. <b>blocked</b> means a sandbox, setup or configuration condition stopped the test before it could say, with the cause. <b>skipped</b> means the payer adapter does not offer the step.</p>
  `);

  add("tools", "10", "Tools and software used", table(["S no", "Name", "Version", "Open source or licensed"], m.tools.map((t, i) => [i + 1, esc(t.name), esc(t.version || "not recorded"), esc(t.licence)]), { numbered: true }));

  let n = 0;
  for (const t of m.tests) {
    n += 1;
    const head = `<p class="claim">Claim ${esc(t.claim || "not recorded")} · result ${status(t.result)} · attempts ${esc(t.attempts)}${t.cause ? ` · cause ${esc(t.cause)}` : ""}${t.detail ? `<br><span class="meta">${esc(t.detail)}</span>` : ""}</p>`;
    const steps = t.steps.map((s) => proofBlock(t, s)).join("");
    const trailing = t.trailingDecisions.map((d) => decisionBlock(d)).join("");
    add(`proof-${t.id}-${t.runner}-${n}`, `11.${n}`, `${t.id}: ${t.title} (${t.runner.toUpperCase()})`, head + steps + trailing, true);
  }
  if (n === 0) add("proof-none", "11.1", "No tests recorded", "<p>The run file holds no test entries.</p>", true);

  const countRows = m.runners.map((r) => [esc(r.toUpperCase()), ...STATUSES.map((s) => String(m.summary.byRunner[r][s]))]);
  countRows.push(["All", ...STATUSES.map((s) => String(m.summary.total[s]))]);
  add("results", "12", "Summary of results", `
    ${table(["Runner", ...STATUSES], countRows)}
    ${m.failures.length ? table(["Test", "Runner", "Result", "Cause", "Detail"], m.failures.map((f) => [esc(f.id), esc(f.runner.toUpperCase()), status(f.result), esc(f.cause || ""), esc(f.detail || "")])) : "<p>No test failed or was blocked.</p>"}
  `);

  return sections;
}

function proofBlock(t, s) {
  const shots = s.screenshots.filter((x) => x.exists);
  const sentence = `The screenshot below shows that the system ${esc(s.what)}.`;
  const figures = shots.map((x) => `<figure><img src="${dataUri(x.abs)}" alt=""><figcaption>${esc(x.file)}${s.at ? ` · ${esc(fmtTime(s.at))}` : ""}</figcaption></figure>`).join("");
  const log = shots.length ? "" : `<div class="log">${esc(s.log || [s.at && fmtTime(s.at), t.id, t.runner, s.result.toUpperCase(), s.what, s.got && `-> ${s.got}`].filter(Boolean).join("  "))}</div>`;
  const got = s.result === "fail" ? `<p class="got">Expected: ${esc(s.expected)}<br>Got: ${esc(s.got || "no result recorded")}</p>` : "";
  const decisions = s.decisions.map((d) => decisionBlock(d)).join("");
  return `<div class="proof">
    <h3>Step ${s.index}: ${esc(s.title)} ${status(s.result)}</h3>
    <p>${shots.length ? sentence : `The step line below shows that the system ${esc(s.what)}.`}</p>
    ${s.expected ? `<p class="meta">Expected: ${esc(s.expected)}</p>` : ""}
    ${figures}${log}${got}${decisions}
  </div>`;
}

function decisionBlock(d) {
  const shot = d.screenshot?.exists ? `<figure><img src="${dataUri(d.screenshot.abs)}" alt=""><figcaption>${esc(d.screenshot.file)}</figcaption></figure>` : "";
  const trail = Array.isArray(d.trail) ? d.trail.map((x) => (typeof x === "string" ? x : `${x.role || ""} ${x.action || ""} ${x.result || ""}`.trim())).join(" → ") : d.trail || "";
  return `<div class="payer-side"><b>Payer side:</b> ${esc(d.role || "payer")} ${esc(d.action || "")} on ${esc(d.case || d.claim || "the case")}${d.result ? ` · ${esc(d.result)}` : ""}${d.at ? ` · ${esc(fmtTime(d.at))}` : ""}${trail && !shot ? `<br><span class="meta">${esc(trail)}</span>` : ""}${shot}</div>`;
}

export function tocHtml(sections, pages) {
  const rows = sections.map((s) => `<tr${s.sub ? ' class="sub"' : ""}><td>${esc(s.number)}  ${esc(s.title)}</td><td class="pg">${pages ? esc(pages[s.key] ?? "") : ""}</td></tr>`).join("");
  return `<table class="toc">${rows}</table>`;
}

export function sectionHtml(s, tocBody) {
  const body = s.key === "contents" ? tocBody : s.body;
  return `<div class="section">${s.sub ? `<h3 style="font-size:12.5pt">${esc(s.number)} ${esc(s.title)}</h3>` : `<h2>${esc(s.number)}. ${esc(s.title)}</h2>`}${body}</div>`;
}

export function bodyHtml(sections, pages) {
  const toc = tocHtml(sections, pages);
  return wrap(sections.map((s) => sectionHtml(s, toc)).join(""));
}

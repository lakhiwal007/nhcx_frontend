import { formatMoney } from "../../../lib/format.js";
import { approvedOf } from "./verdict";

const reasonOf = (line) => {
  const adj = line.adjudication || {};
  const parts = [adj.reason, line.reason, line.adjudication_reason, ...(line.reasons || []), ...(adj.notes || [])]
    .map((r) => (typeof r === "string" ? r : r?.text || r?.display || r?.code))
    .filter(Boolean);
  return parts.join(" · ");
};

export default function AdjudicationTable({ items = [], totals, names = {}, requestedLabel = "Requested", approvedLabel = "Approved", showReason = true }) {
  const lines = items || [];
  if (!lines.length) return null;
  const sum = (pick) => lines.reduce((acc, line) => acc + (Number(pick(line)) || 0), 0);
  const requestedTotal = totals?.submitted?.value ?? sum((l) => l.adjudication?.submitted?.value);
  const approvedTotal = approvedOf(totals) ?? sum((l) => approvedOf(l.adjudication));
  const anyReason = showReason && lines.some((l) => reasonOf(l));
  const extras = [
    ["Tax", totals?.tax?.value],
    ["Incentive", totals?.incentive?.value],
    ["Patient pays", totals?.patient_liable?.value],
  ].filter(([, value]) => Number(value) > 0);
  return (
    <div className="cv-tw">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th className="is-num">{requestedLabel}</th>
            <th className="is-num">{approvedLabel}</th>
            {anyReason && <th>Reason</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const adj = line.adjudication || {};
            const requested = adj.submitted?.value ?? line.net_amount ?? null;
            const approved = approvedOf(adj);
            const cut = requested != null && approved != null && approved < requested;
            const code = line.service_code || line.code || null;
            const name = line.service_name || line.name || names[line.sequence] || names[code] || `Line ${line.sequence ?? i + 1}`;
            return (
              <tr key={line.sequence ?? code ?? i} className={cut ? "is-cut" : undefined}>
                <td>
                  <div>{name}</div>
                  {code && <div className="cv-mono cv-card-meta">{code}</div>}
                </td>
                <td className="is-num">{formatMoney(requested)}</td>
                <td className={`is-num${cut ? " is-cut-amount" : ""}`}>{formatMoney(approved)}</td>
                {anyReason && <td>{reasonOf(line) || "—"}</td>}
              </tr>
            );
          })}
          <tr className="is-total">
            <td>Total</td>
            <td className="is-num">{formatMoney(requestedTotal)}</td>
            <td className="is-num">{formatMoney(approvedTotal)}</td>
            {anyReason && <td />}
          </tr>
          {extras.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td />
              <td className="is-num">{formatMoney(value)}</td>
              {anyReason && <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

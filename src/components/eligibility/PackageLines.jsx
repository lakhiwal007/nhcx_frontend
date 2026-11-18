import { formatMoney } from "../../lib/format.js";

const STATUS = {
  planned: ["To send", "is-todo"],
  sent: ["With the payer", "is-info"],
  approved: ["Approved", "is-ok"],
  rejected: ["Refused", "is-bad"],
};

export default function PackageLines({ lines = [], onRemove, busy }) {
  const total = lines.filter((l) => l.status !== "rejected").reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  return (
    <div className="cv-tw cv-in-card">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th>Package</th>
            <th className="is-num">Qty</th>
            <th className="is-num">Plan rate</th>
            <th className="is-num">Amount</th>
            <th>Payer</th>
            {onRemove && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const [label, tone] = STATUS[line.status] || [line.status, "is-todo"];
            return (
              <tr key={line.line_no}>
                <td className="cv-mono">{line.line_no}</td>
                <td>
                  <strong>{line.display || line.code}</strong> <span className="cv-mono cv-card-meta">{line.code}</span>
                  <div className="cv-card-meta">{[line.kind === "Implant" && "Implant", line.category_display, line.modifier_display || line.modifier_code, line.stage === "enhancement" && "Enhancement"].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="is-num">{line.quantity ?? 1}</td>
                <td className="is-num">
                  {line.unit_price != null ? formatMoney(line.unit_price) : "—"}
                  {line.repriced_from != null && <div className="cv-card-meta">was {formatMoney(line.repriced_from)}; the plan changed</div>}
                </td>
                <td className="is-num">{line.amount != null ? formatMoney(line.amount) : "—"}</td>
                <td>
                  <span className={`cv-chip ${tone}`}>{label}</span>
                  {line.status === "approved" && line.approved_amount != null && <div className="cv-card-meta">{formatMoney(line.approved_amount)}</div>}
                </td>
                {onRemove && (
                  <td>
                    {line.status === "planned" && (
                      <button type="button" className="cv-pick" disabled={busy} onClick={() => onRemove(line)}>
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          <tr className="is-total">
            <td colSpan={4}>Total at plan rates</td>
            <td className="is-num">{formatMoney(total)}</td>
            <td colSpan={onRemove ? 2 : 1} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

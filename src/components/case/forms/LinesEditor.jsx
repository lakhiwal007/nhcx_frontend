import { formatDate, formatMoney } from "../../../lib/format.js";

export default function LinesEditor({ items, total, unspecifiedCodes, locked, onChange, totalLabel = "Amount requested", emptyText = "No billable items on record." }) {
  const unspecified = (item) => unspecifiedCodes?.has(String(item.service_code || "").toUpperCase());
  return (
    <fieldset className="cv-tw cv-in-card cv-plain" disabled={locked}>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th className="cv-col-qty">Qty</th>
            <th className="cv-col-price">Unit price</th>
            <th className="is-num cv-col-price">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item._uid ?? `${item.service_code}-${i}`}>
              <td>
                {unspecified(item) && !locked ? (
                  <input
                    className="cv-ctl cv-ctl-fill"
                    aria-label="Procedure name"
                    placeholder="Name the procedure, and the ward if it matters"
                    value={item.service_name || ""}
                    onChange={(e) => onChange(i, "service_name", e.target.value)}
                  />
                ) : (
                  <strong>{item.service_name}</strong>
                )}
                <div className="cv-card-meta">
                  {[item.service_code, unspecified(item) && "unspecified package: the name and amount go as typed", item.category, item.service_start_date && formatDate(item.service_start_date)]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </td>
              <td>
                <input className="cv-ctl cv-ctl-fill cv-mono" type="number" min="1" aria-label="Quantity" value={item.quantity} onChange={(e) => onChange(i, "quantity", e.target.value)} />
              </td>
              <td>
                <input className="cv-ctl cv-ctl-fill cv-mono" type="number" min="0" aria-label="Unit price" value={item.unit_price} onChange={(e) => onChange(i, "unit_price", e.target.value)} />
              </td>
              <td className="is-num cv-strong">{formatMoney(item.net_amount)}</td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={4} className="cv-card-meta">
                {emptyText}
              </td>
            </tr>
          )}
          <tr className="is-total">
            <td colSpan={3}>{totalLabel}</td>
            <td className="is-num">{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </fieldset>
  );
}

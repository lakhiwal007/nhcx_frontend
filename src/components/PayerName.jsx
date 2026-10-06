import { useEffect, useState } from "react";
import { api } from "../api";

// Case, task and message rows carry only the payer's participant code
// (e.g. "1518@hcx"). Resolve it to the insurer/TPA name once per code and
// share the answer across every row on every screen.
const names = new Map(); // code -> name (resolved)
const pending = new Map(); // code -> Promise<name|null>

function lookup(code) {
  if (!pending.has(code)) {
    pending.set(
      code,
      api
        .getPayerById(code)
        .then((p) => {
          const name = p?.name || null;
          if (name) names.set(code, name);
          return name;
        })
        .catch(() => null),
    );
  }
  return pending.get(code);
}

// Shows `name` when the row already has one; otherwise the looked-up name,
// with the code as a tooltip. Falls back to the code (or `fallback`).
export default function PayerName({ id, name, fallback = "—" }) {
  const [resolved, setResolved] = useState(() => name || (id && names.get(id)) || null);

  useEffect(() => {
    if (name || !id || names.has(id)) return;
    let live = true;
    lookup(id).then((n) => live && n && setResolved(n));
    return () => {
      live = false;
    };
  }, [id, name]);

  const shown = name || resolved || (id && names.get(id));
  if (!shown && !id) return fallback;
  return <span title={id || undefined}>{shown || id}</span>;
}

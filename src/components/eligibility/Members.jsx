import { formatDate } from "../../format.js";

const NEWBORN_PROOFS = [
  { value: "BCF", label: "Birth certificate" },
  { value: "DCB", label: "Government hospital discharge card" },
];

const photoSrc = (photo) =>
  !photo ? null : /^https?:/i.test(photo) ? photo : `data:image/${photo.startsWith("iVBOR") ? "png" : "jpeg"};base64,${photo}`;

export default function Members({ members, chosenId, choosing, onChoose, canChoose, newborn, savingNewborn, canEditNewborn, onNewborn, error }) {
  const many = members.length > 1;
  const label = newborn ? "This is the parent" : "This is the patient";
  return (
    <section className="cv-card" aria-label="Who is admitted">
      <div className="cv-card-head">
        <h2 className="cv-card-title">3. Who is admitted</h2>
        {many && !chosenId && <span className="cv-chip is-warn">Choose one</span>}
        {chosenId && <span className="cv-chip is-ok">Chosen</span>}
        <span className="cv-card-meta">{many ? `${members.length} people on this card. The pre-auth is filed for the person you pick.` : "The member on the card."}</span>
      </div>
      {error && <div className="cv-card-body"><div className="cv-notice is-bad"><div className="cv-notice-body">{error}</div></div></div>}
      <div className="cv-tw cv-in-card">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Member ID</th>
              <th>Relation</th>
              <th>Gender · born</th>
              <th>ABHA</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const chosen = chosenId && chosenId === m.member_id;
              return (
                <tr key={m.member_id || `${m.name}|${m.dob}`} className={chosen ? "is-selected" : undefined}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {photoSrc(m.photo) && <img src={photoSrc(m.photo)} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />}
                      <strong>{m.name || "—"}</strong>
                      {m.checked && <span className="cv-chip is-todo">Checked</span>}
                    </span>
                    {m.address && <div className="cv-card-meta">{m.address}</div>}
                  </td>
                  <td className="cv-mono">{m.member_id || "—"}</td>
                  <td style={{ textTransform: "capitalize" }}>{m.relationship || "—"}</td>
                  <td>
                    <span style={{ textTransform: "capitalize" }}>{m.gender || "—"}</span>
                    {m.dob ? ` · ${formatDate(m.dob)}` : ""}
                  </td>
                  <td className="cv-mono">{m.abha_number || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {chosen ? (
                      <span className="cv-chip is-ok">{newborn ? "The parent" : "The patient"}</span>
                    ) : canChoose && m.member_id ? (
                      <button type="button" className="cv-btn" disabled={!!choosing} onClick={() => onChoose(m)}>
                        {choosing === m.member_id ? "Saving…" : label}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cv-pane" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
          <input type="checkbox" checked={!!newborn} disabled={!canEditNewborn || savingNewborn} onChange={(e) => onNewborn(e.target.checked ? { proof_code: "BCF" } : null)} />
          Newborn on a parent's card (PMJAY)
        </label>
        {newborn ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Proof of birth
            <select className="cv-ctl" value={newborn.proof_code || "BCF"} disabled={!canEditNewborn || savingNewborn} onChange={(e) => onNewborn({ ...newborn, proof_code: e.target.value })}>
              {NEWBORN_PROOFS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="cv-card-meta">For a baby of 6 or under with no member id: pick the parent above and the baby goes as the linked newborn.</span>
        )}
      </div>
    </section>
  );
}

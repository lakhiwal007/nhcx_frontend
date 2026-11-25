import { useEffect, useState } from "react";
import { Edit2, Stethoscope } from "lucide-react";
import { api, markHandled } from "../../api";
import { useSend } from "../../hooks/util/useSend";
import { useReadOnly } from "../../lib/readOnly";
import { EmptyState, LoadingBlock } from "../ui/Common";
import { Drawer } from "../ui/Overlay";
import ConfirmModal from "../ui/ConfirmModal";
import { Field, TextInput } from "./fields";

const formFor = (doctor) => {
  const master = doctor.master || {};
  return {
    hpr_id: master.hpr_id || "",
    qualification_display: master.qualification_display || [].concat(doctor.qualifications || []).join(", "),
    specialty_code: master.specialty_code || "",
    specialty_display: master.specialty_display || doctor.specialization || "",
  };
};

function PractitionerDrawer({ facilityCode, doctor, onClose, onSaved }) {
  const [form, setForm] = useState(() => formFor(doctor));
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const digits = (form.hpr_id || "").replace(/[\s-]/g, "");
  const valid = /^\d{14}$/.test(digits);
  const save = useSend(
    async () => {
      const saved = await api.savePractitioner(facilityCode, doctor.doctor_id, { ...form, hpr_id: digits, active: true });
      if (saved?.status === "not_found") throw new Error("Doctor not in the hospital system. Not saved.");
      onSaved(saved);
      onClose();
      return saved;
    },
    { success: "HPR id saved" },
  );
  return (
    <Drawer
      width={560}
      stack
      open
      onClose={save.busy ? undefined : onClose}
      title={`HPR id for ${doctor.name || doctor.doctor_id}`}
      subtitle="Sent with every pre-auth and claim."
      footer={
        <div className="cv-drawer-actions">
          <button type="button" className="cv-btn" onClick={onClose} disabled={save.busy}>
            Cancel
          </button>
          <button type="button" className="cv-btn is-primary" disabled={!valid || save.busy} onClick={save.run}>
            {save.busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="st-form">
        <div className="st-grid">
          <Field label="HPR id" required wide htmlFor="hpr-id" hint="14-digit HPR id. Hyphens are fine." error={form.hpr_id && !valid ? "An HPR id has 14 digits." : save.error}>
            <TextInput id="hpr-id" value={form.hpr_id} onChange={set("hpr_id")} placeholder="71-1234-5678-9012" monospace invalid={!!form.hpr_id && !valid} />
          </Field>
          <Field label="Degrees" wide htmlFor="hpr-deg" hint="For example MBBS, MS (Ortho).">
            <TextInput id="hpr-deg" value={form.qualification_display} onChange={set("qualification_display")} placeholder="MBBS, MD (General Medicine)" />
          </Field>
          <Field label="Specialty SNOMED code" htmlFor="hpr-code" hint="Optional. Sent to the payer as the doctor's specialty.">
            <TextInput id="hpr-code" value={form.specialty_code} onChange={set("specialty_code")} placeholder="394537008" monospace />
          </Field>
          <Field label="Specialty name" htmlFor="hpr-spec">
            <TextInput id="hpr-spec" value={form.specialty_display} onChange={set("specialty_display")} placeholder="Paediatric specialty" />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

export default function Practitioners({ facility, canEdit, embedded = false }) {
  const readOnly = useReadOnly();
  const editable = canEdit && !readOnly;
  const facilityCode = facility.facility_code;
  const [state, setState] = useState({ key: null, doctors: [], error: null });
  const [editing, setEditing] = useState(null);
  const [retiring, setRetiring] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .listPractitioners(facilityCode)
      .then((res) => live && setState({ key: facilityCode, doctors: res?.practitioners || [], error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setState({ key: facilityCode, doctors: [], error: err?.message || "The doctors could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [facilityCode]);

  const loading = state.key !== facilityCode;
  const doctors = state.doctors;
  const replace = (saved) => setState((prev) => ({ ...prev, doctors: prev.doctors.map((d) => (d.doctor_id === saved.doctor_id ? saved : d)) }));

  const toggle = useSend(
    async (doctor) => {
      const saved = await api.savePractitioner(facilityCode, doctor.doctor_id, { hpr_id: doctor.master.hpr_id, active: !doctor.master.active });
      if (saved?.status === "not_found") throw new Error("This doctor could not be found, so nothing was changed.");
      replace(saved);
      return saved;
    },
    { success: (saved) => (saved?.master?.active ? "Doctor reinstated" : "Doctor retired") },
  );

  const inHis = doctors.filter((d) => d.in_his);
  const missing = inHis.filter((d) => !d.master?.active).length;
  const Title = embedded ? "h3" : "h2";

  return (
    <section className={embedded ? "st-embedded" : "st-section"} aria-label="Doctors' HPR ids">
      {!embedded && (
        <header className="st-section-head">
          <Title className="st-section-title">Doctors' HPR ids</Title>
          {!loading && inHis.length > 0 && <span className="st-section-meta">{missing ? `${missing} of ${inHis.length} without an HPR id` : "Every doctor has an HPR id"}</span>}
        </header>
      )}
      <div className="st-pad">
        <div className={`cv-notice ${missing ? "is-warn" : "is-info"}`}>
          <div className="cv-notice-body">
            Add each doctor's HPR id. PMJAY needs it.
            {!editable && " Only this facility's clinic admin can change them."}
          </div>
        </div>
      </div>
      {state.error && (
        <div className="st-pad">
          <div className="cv-notice is-warn" role="alert">
            <div className="cv-notice-body">{state.error}</div>
          </div>
        </div>
      )}
      {toggle.error && (
        <div className="st-pad">
          <div className="cv-notice is-bad" role="alert">
            <div className="cv-notice-body">{toggle.error}</div>
          </div>
        </div>
      )}
      {loading ? (
        <LoadingBlock compact text="Loading the doctors…" />
      ) : doctors.length === 0 ? (
        <EmptyState icon={Stethoscope} iconSize={44} iconOpacity={0.25} title="No doctors found" description="The hospital system lists no doctors for this facility." />
      ) : (
        <div className="wq-table-scroll">
          <table className="st-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>HPR id</th>
                <th>Degrees · specialty</th>
                <th className="st-col-actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((d) => {
                const master = d.master;
                const retired = master && !master.active;
                return (
                  <tr key={d.doctor_id}>
                    <td>
                      <span className="st-strong">{d.name || `Doctor ${d.doctor_id}`}</span>
                      <span className="st-sub">{[d.registration_no, d.specialization, !d.in_his && "no longer in the hospital system"].filter(Boolean).join(" · ") || d.doctor_id}</span>
                    </td>
                    <td className="cv-mono">{!master ? <span className="is-bad">Missing</span> : retired ? <span className="ep-muted">{master.hpr_id} · retired</span> : master.hpr_id}</td>
                    <td>
                      {master ? (
                        <>
                          <span>{master.qualification_display || "—"}</span>
                          <span className="st-sub">{master.specialty_display || master.specialty_code || "—"}</span>
                        </>
                      ) : (
                        <span className="ep-muted">—</span>
                      )}
                    </td>
                    <td className="st-col-actions">
                      {editable && (
                        <div className="st-row-actions">
                          {d.in_his && (
                            <button type="button" className="cv-link" onClick={() => setEditing(d)}>
                              <Edit2 size={13} aria-hidden="true" /> {master ? "Edit" : "Add"}
                            </button>
                          )}
                          {master && (
                            <button type="button" className="cv-link" disabled={toggle.busy} onClick={() => (master.active ? setRetiring(d) : toggle.run(d))}>
                              {master.active ? "Retire" : "Reinstate"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PractitionerDrawer key={editing.doctor_id} facilityCode={facilityCode} doctor={editing} onClose={() => setEditing(null)} onSaved={replace} />}
      <ConfirmModal
        open={!!retiring}
        title={`Retire ${retiring?.name || "this doctor"}?`}
        subtitle="Not sent anymore. PMJAY will refuse this doctor."
        confirmLabel="Retire"
        danger
        busy={toggle.busy}
        onCancel={() => setRetiring(null)}
        onConfirm={async () => {
          const doctor = retiring;
          setRetiring(null);
          await toggle.run(doctor);
        }}
      />
    </section>
  );
}

import { useEffect, useState } from "react";
import { api } from "../../api";
import { Drawer } from "../Overlay";
import { LoadingBlock } from "../Common";

const STAGE_LABEL = { pre: "Pre-auth", post: "Claim" };

export default function FormDrawer({ correlationId, url, onClose }) {
  const [form, setForm] = useState({ url: null, data: null, error: null });
  useEffect(() => {
    if (!correlationId || !url) return;
    let live = true;
    api
      .getInsurancePlanForms(correlationId, url)
      .then((res) => live && setForm({ url, data: res, error: res ? null : "The payer's plan holds no such form." }))
      .catch((err) => live && setForm({ url, data: null, error: err?.message || "Could not load the form." }));
    return () => {
      live = false;
    };
  }, [correlationId, url]);
  const loaded = form.url === url;
  const data = loaded ? form.data : null;
  return (
    <Drawer
      open={!!url}
      onClose={onClose}
      width={720}
      title={data?.title || "Payer form"}
      subtitle={data ? [data.form_id, STAGE_LABEL[data.stage]].filter(Boolean).join(" · ") : url}
    >
      {!loaded ? (
        <LoadingBlock text="Loading the payer's form…" />
      ) : form.error ? (
        <div className="cv-notice is-bad">{form.error}</div>
      ) : (
        <div className="cv-tw">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Answer type</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((it) => (
                <tr key={it.linkId}>
                  <td style={{ paddingLeft: `${16 + (it.depth || 0) * 16}px` }}>
                    <div style={{ fontWeight: it.type === "group" ? 700 : 500 }}>{it.text || it.prefix || it.linkId}</div>
                    {it.options?.length > 0 && (
                      <div className="cv-card-meta">
                        {it.options.join(" · ")}
                        {it.initial ? ` (default ${it.initial})` : ""}
                      </div>
                    )}
                  </td>
                  <td>
                    {it.type === "group" ? "Section" : it.type || "—"}
                    {it.type !== "group" && it.required ? " · required" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}

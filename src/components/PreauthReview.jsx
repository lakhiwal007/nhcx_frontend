import { useState, useEffect, useCallback } from "react";
import { Send, Stethoscope, Briefcase, Plus, RefreshCw } from "lucide-react";
import { api } from "../api";
import { Card, Button, PageHeader } from "./Common";

const PreauthReview = ({
  patient,
  payer,
  policy,
  cashlessCase,
  onSubmit,
  onBack,
}) => {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDraft = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.preparePreauth({
        claim_id: cashlessCase?.claim_id || 101,
        payer_code: payer.participant_code,
        policyNumber: policy.policyNumber,
      });
      setDraft(data);
    } catch (error) {
      console.error("Error fetching preauth draft:", error);
    } finally {
      setLoading(false);
    }
  }, [cashlessCase, payer, policy]);

  useEffect(() => {
    const timer = setTimeout(() => fetchDraft(), 0);
    return () => clearTimeout(timer);
  }, [fetchDraft]);

  const handleItemChange = (index, field, value) => {
    const newItems = [...draft.items];
    newItems[index][field] = value;

    // Recalculate net amount
    if (field === "quantity" || field === "unit_price") {
      newItems[index].net_amount =
        newItems[index].quantity * newItems[index].unit_price;
    }

    const newTotal = newItems.reduce((acc, item) => acc + item.net_amount, 0);
    setDraft({ ...draft, items: newItems, total_amount: newTotal });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await api.submitPreauth(draft);
      onSubmit(response);
    } catch (error) {
      console.error("Submission error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex-center flex-col py-40">
        <div className="spinner"></div>
        <p className="ml-4 text-muted">Building Preauth Draft...</p>
      </div>
    );

  return (
    <div className="review-screen-modern">
      <PageHeader
        title="Pre-authorization Review"
        subtitle="Review claim details, diagnosis, and bill items before submission."
        backAction={onBack}
      />

      <div className="selection-grid-modern">
        <div className="review-main">
          <Card title="Clinical Details">
            <div
              className="flex-between mb-8 pb-4"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div
                style={{ display: "flex", gap: "16px", alignItems: "center" }}
              >
                <div
                  className="icon-badge"
                  style={{
                    padding: "12px",
                    background: "#eef2ff",
                    borderRadius: "12px",
                    color: "#4f46e5",
                  }}
                >
                  <Stethoscope size={24} />
                </div>
                <div>
                  <h4 style={{ fontSize: "16px", fontWeight: "700" }}>
                    Diagnoses (ICD-10)
                  </h4>
                  <p className="text-muted" style={{ fontSize: "13px" }}>
                    Primary and secondary diagnosis codes
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                icon={Plus}
                style={{ padding: "8px 12px", fontSize: "12px" }}
              >
                Add Code
              </Button>
            </div>

            <div className="diagnosis-list">
              {draft.diagnoses.map((diag, i) => (
                <div
                  key={i}
                  className="flex-between mb-4 p-4"
                  style={{
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    margin: "10px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                      padding: "10px",
                    }}
                  >
                    <span
                      style={{
                        background: "#4f46e5",
                        color: "white",
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                      }}
                    >
                      PRIMARY
                    </span>
                    <code style={{ fontSize: "14px", fontWeight: "700" }}>
                      {diag.code}
                    </code>
                    <span style={{ fontSize: "14px" }}>{diag.name}</span>
                  </div>
                  {/* <Trash2
                    size={16}
                    className="text-muted"
                    style={{ cursor: "pointer", margin:"10px" }}
                  /> */}
                </div>
              ))}
            </div>

            <div
              className="flex-between mb-8 mt-12 pb-4"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div
                style={{ display: "flex", gap: "16px", alignItems: "center" }}
              >
                <div
                  className="icon-badge"
                  style={{
                    padding: "12px",
                    background: "#ecfdf5",
                    borderRadius: "12px",
                    color: "#059669",
                  }}
                >
                  <Briefcase size={24} />
                </div>
                <div>
                  <h4 style={{ fontSize: "16px", fontWeight: "700" }}>
                    Procedures
                  </h4>
                  <p className="text-muted" style={{ fontSize: "13px" }}>
                    Surgical or non-surgical intervention details
                  </p>
                </div>
              </div>
            </div>

            <div className="procedure-list">
              {draft.procedures.map((proc, i) => (
                <div
                  key={i}
                  className="flex-between mb-4 p-4"
                  style={{
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    margin: "10px 0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                      padding: "10px",
                    }}
                  >
                    <code style={{ fontSize: "14px", fontWeight: "700" }}>
                      {proc.code}
                    </code>
                    <span style={{ fontSize: "14px" }}>{proc.name}</span>
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "#64748b",
                      padding: "0px 10px",
                    }}
                  >
                    Date: {proc.date}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Bill Item Summary" className="mt-8">
            <div className="table-container-modern">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Service / Item</th>
                    <th style={{ width: "80px" }}>Qty</th>
                    <th style={{ width: "150px" }}>Unit Price</th>
                    <th style={{ width: "150px" }}>Net Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <div style={{ fontWeight: "600" }}>
                          {item.service_name}
                        </div>
                        <small className="text-muted">
                          {item.service_code}
                        </small>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input-modern"
                          style={{ padding: "4px 8px", textAlign: "center" }}
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "quantity",
                              parseInt(e.target.value) || 0,
                            )
                          }
                        />
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            ₹
                          </span>
                          <input
                            type="number"
                            className="input-modern"
                            style={{ padding: "4px 8px" }}
                            value={item.unit_price}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "unit_price",
                                parseInt(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                      </td>
                      <td style={{ fontWeight: "700", textAlign: "right" }}>
                        ₹{item.net_amount.toLocaleString()}
                      </td>
                      <td>
                        {/* <Trash2
                          size={16}
                          className="text-muted"
                          style={{ cursor: "pointer" }}
                        /> */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="total-panel mt-8 p-6"
              style={{
                background: "#f1f5f9",
                borderRadius: "12px",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "28px",
                padding: "10px",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#64748b",
                  textTransform: "uppercase",
                }}
              >
                Estimated Total Amount
              </span>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "var(--primary)",
                  fontFamily: "Outfit",
                }}
              >
                ₹ {draft.total_amount.toLocaleString()}
              </div>
            </div>
          </Card>
        </div>

        <div className="review-sidebar">
          <Card title="Patient & Insurance" className="mb-8">
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div
                className="patient-snippet flex-center gap-4"
                style={{
                  background: "#f1f5f9",
                  padding: "16px",
                  borderRadius: "12px",
                  justifyContent: "flex-start",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    color: "var(--primary)",
                  }}
                >
                  {patient?.name?.[0]}
                </div>
                <div>
                  <div style={{ fontWeight: "700" }}>{patient?.name}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    ID: {patient?.child_id}
                  </div>
                </div>
              </div>

              <div
                className="meta-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div className="flex-between">
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    Admission Date
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>
                    {draft.admission_date}
                  </span>
                </div>
                <div className="flex-between">
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    Inpatient Service
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>
                    {draft.inpatient ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex-between">
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    Payer
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>
                    {payer.name}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Final Submission" className="mt-8">
            <p
              className="text-muted"
              style={{ fontSize: "13px", lineHeight: "1.6" }}
            >
              By submitting this pre-authorization request, you certify that the
              clinical information provided is accurate and supported by medical
              records.
            </p>
            <Button
              className="w-full mt-8"
              icon={submitting ? RefreshCw : Send}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Submitting..." : "Submit to NHCX"}
            </Button>
            <p
              className="text-center mt-4"
              style={{ fontSize: "11px", color: "#94a3b8" }}
            >
              Correlation ID will be generated upon submission.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PreauthReview;

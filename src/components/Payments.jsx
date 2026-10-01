import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { SkeletonTable, Button, TablePagination } from "./Common";
import { formatMoney, formatDate, formatDateTime } from "../format.js";
import { api } from "../api";
import { useNavigate } from "react-router-dom";
import { groupPaymentEvents, stageLabel } from "../paymentEvents.js";
import Dropdown from "./Dropdown";
import { Modal } from "./Overlay";

const PAYMENTS_PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest_amount", label: "Highest net" },
  { value: "highest_tds", label: "Highest TDS" },
];

// Stage chips; "ack" is the work item — notices the payer is still waiting on.
const STAGE_TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "settled", label: "Settled", match: (p) => p.settled, dot: "var(--success)" },
  { key: "progress", label: "In progress", match: (p) => !p.settled, dot: "var(--info)" },
  { key: "ack", label: "Ack pending", match: (p) => p.pending_ack, dot: "var(--warning)" },
];

const claimSearchKey = (p) => p.cashless_case_id ?? p.claim_reference;

function computePaymentMetrics(unique) {
  const now = new Date();
  const isThisMonth = (d) => {
    const date = d ? new Date(d) : null;
    return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };
  const settled = unique.filter((p) => p.settled);
  return {
    settledThisMonth: settled.filter((p) => isThisMonth(p.payment_date)).reduce((s, p) => s + (p.net_payment_amount ?? 0), 0),
    pendingAck: unique.filter((p) => p.pending_ack).length,
    totalTds: unique.reduce((s, p) => s + (p.tds_amount ?? 0), 0),
    totalNetSettled: settled.reduce((s, p) => s + (p.net_payment_amount ?? 0), 0),
  };
}

const ackLabel = (p) =>
  p.acknowledgement_status === "submitted" ? "Acknowledged" : p.acknowledgement_status === "failed" ? "Failed" : "Pending";

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [claimsById, setClaimsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageTab, setStageTab] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentsPage, setPaymentsPage] = useState(0);

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const [paymentsRes, claimsRes] = await Promise.all([
          api.searchPaymentStatus(),
          api.getDashboardClaims({ limit: 200 }).catch(() => null),
        ]);
        setPayments(groupPaymentEvents(paymentsRes?.events || []));
        const byId = {};
        (claimsRes?.claims || []).forEach((c) => { byId[c.id] = c; });
        setClaimsById(byId);
      } catch (err) {
        console.error(err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  const patientFor = (pay) => {
    const joined = claimsById[pay.claim_id];
    if (pay.patient_name || pay.child_id != null) {
      return {
        patient_name: pay.patient_name ?? joined?.patient_name,
        child_name: joined?.child_name,
        child_id: pay.child_id ?? joined?.child_id,
      };
    }
    return joined;
  };

  const q = searchQuery.trim().toLowerCase();
  const searched = payments.filter(
    (p) =>
      !q ||
      p.claim_reference?.toLowerCase().includes(q) ||
      p.payment_reference?.toLowerCase().includes(q) ||
      p.utr?.toLowerCase().includes(q) ||
      patientFor(p)?.patient_name?.toLowerCase().includes(q),
  );
  const tabCounts = Object.fromEntries(STAGE_TABS.map((t) => [t.key, searched.filter(t.match).length]));
  const activeTab = STAGE_TABS.find((t) => t.key === stageTab) || STAGE_TABS[0];

  const filtered = searched.filter(activeTab.match).sort((a, b) => {
    const dA = Date.parse(a.payment_date) || 0;
    const dB = Date.parse(b.payment_date) || 0;
    if (sortBy === "oldest") return dA - dB;
    if (sortBy === "highest_amount") return (b.net_payment_amount || 0) - (a.net_payment_amount || 0);
    if (sortBy === "highest_tds") return (b.tds_amount || 0) - (a.tds_amount || 0);
    return dB - dA;
  });

  const paymentsPageCount = Math.max(1, Math.ceil(filtered.length / PAYMENTS_PAGE_SIZE));
  const safePaymentsPage = Math.min(paymentsPage, paymentsPageCount - 1);
  const pagedPayments = filtered.slice(safePaymentsPage * PAYMENTS_PAGE_SIZE, (safePaymentsPage + 1) * PAYMENTS_PAGE_SIZE);
  const metrics = computePaymentMetrics(payments);
  const sum = (key) => filtered.reduce((s, p) => s + Math.abs(p[key] ?? 0), 0);

  const KPIS = [
    { key: "net", label: "Net settled", value: formatMoney(Math.round(metrics.totalNetSettled)), color: "var(--success)" },
    { key: "month", label: "Settled this month", value: formatMoney(Math.round(metrics.settledThisMonth)), color: "var(--primary)" },
    { key: "tds", label: "TDS deducted", value: formatMoney(Math.round(metrics.totalTds)), color: "var(--text-muted)" },
    { key: "ack", label: "Acknowledgements pending", value: metrics.pendingAck, color: "var(--warning)" },
  ];

  return (
    <div className="cc-screen payments-screen">
      <div className="wq-header">
        <div>
          <div className="wq-counts">
            <span>{loading ? "Loading payments…" : `${payments.length} payment${payments.length === 1 ? "" : "s"}`}</span>
            {!loading && metrics.pendingAck > 0 && (
              <span className="is-overdue">{metrics.pendingAck} awaiting acknowledgement</span>
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="inline-error-banner" style={{ margin: 0 }}>
          <AlertCircle size={16} />
          Could not load payment events. Showing the last known results, if any.
        </div>
      )}

      {!loading && payments.length > 0 && (
        <div className="cc-kpis">
          {KPIS.map((k) => (
            <div key={k.key} className="cc-kpi">
              <div className="cc-kpi-label">
                <span className="cc-kpi-dot" style={{ background: k.color }} />
                {k.label}
              </div>
              <div className="cc-kpi-value">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search claim, payment ref, UTR or patient…"
            aria-label="Search payments"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPaymentsPage(0);
            }}
          />
          <div className="wq-chips" role="tablist" aria-label="Payment stage">
            {STAGE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={stageTab === t.key}
                className={`wq-chip${stageTab === t.key ? " is-on" : ""}`}
                onClick={() => {
                  setStageTab(t.key);
                  setPaymentsPage(0);
                }}
              >
                {t.dot && <span className="wq-chip-dot" style={{ "--wq-dot": t.dot }} />}
                {t.label}
                <span className="wq-chip-count">{loading ? "–" : tabCounts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="wq-toolbar-spacer" />
          <div style={{ width: "160px" }}>
            <Dropdown compact ariaLabel="Sort" value={sortBy} options={SORT_OPTIONS} onChange={(v) => { setSortBy(v); setPaymentsPage(0); }} />
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">{payments.length ? "No payments match these filters" : "No payments yet"}</div>
            <div className="cc-empty-hint">
              {payments.length
                ? "Try a different search or stage."
                : "Payer payment notices appear here once claims are settled."}
            </div>
          </div>
        ) : (
          <>
            <div className="wq-table-scroll">
              <table className="wq-table pm-table">
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Patient · Claim</th>
                    <th>Stage</th>
                    <th className="cc-num">Gross</th>
                    <th className="cc-num">TDS</th>
                    <th className="cc-num">Net credited</th>
                    <th>Acknowledgement</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPayments.map((pay, i) => {
                    const patient = patientFor(pay);
                    return (
                      <tr
                        key={pay.group_key || i}
                        tabIndex={0}
                        onClick={() => setSelectedPayment(pay)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelectedPayment(pay);
                        }}
                      >
                        <td>
                          <div className="wq-mono cc-case-id">{pay.payment_reference || "—"}</div>
                          <div className="wq-sub">
                            {[pay.payment_date && formatDate(pay.payment_date), pay.utr && `UTR ${pay.utr}`, pay.notice_count > 1 && `${pay.notice_count} notices`]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td>
                          <div className="cc-patient">{patient?.patient_name || patient?.child_name || "—"}</div>
                          {pay.claim_reference && (
                            <button
                              type="button"
                              className="pd-inline-link pm-claim-link"
                              title="Find this claim in Cashless Cases"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/dashboard?q=${encodeURIComponent(claimSearchKey(pay))}`);
                              }}
                            >
                              {pay.claim_reference}
                            </button>
                          )}
                        </td>
                        <td className="ep-cap">{stageLabel(pay.payment_stage) || "—"}</td>
                        <td className="wq-mono cc-num">{formatMoney(pay.gross_amount)}</td>
                        <td className="wq-mono cc-num">{pay.tds_amount != null ? formatMoney(Math.abs(pay.tds_amount)) : "—"}</td>
                        <td className="wq-mono cc-num ep-strong">{formatMoney(pay.net_payment_amount)}</td>
                        <td className={pay.acknowledgement_status === "failed" ? "is-bad" : pay.acknowledgement_status === "submitted" ? undefined : "ep-muted"}>
                          {ackLabel(pay)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="pm-total">
                      <td colSpan={3}>
                        {filtered.length} payments
                      </td>
                      <td className="wq-mono cc-num">{formatMoney(sum("gross_amount"))}</td>
                      <td className="wq-mono cc-num">{formatMoney(sum("tds_amount"))}</td>
                      <td className="wq-mono cc-num">{formatMoney(sum("net_payment_amount"))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="wq-pagination">
              <TablePagination
                page={safePaymentsPage}
                pageSize={PAYMENTS_PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPaymentsPage}
                label="payments"
              />
            </div>
          </>
        )}
      </div>

      <PaymentDetailModal
        payment={selectedPayment}
        patient={selectedPayment ? patientFor(selectedPayment) : null}
        onClose={() => setSelectedPayment(null)}
        navigate={navigate}
      />
    </div>
  );
}

// Row click opens this — the payment event alone doesn't carry every field
// worth showing (patient identity, notice/recon detail, acknowledgement
// lifecycle), so the list surfaces a summary and this fills in the rest.
function PaymentDetailModal({ payment, patient, onClose, navigate }) {
  const group = (title, rows) => {
    const shown = rows.filter(([, v]) => v != null && v !== "" && v !== "—");
    if (!shown.length) return null;
    return (
      <div className="pm-group">
        <div className="pm-group-title">{title}</div>
        <dl>
          {shown.map(([label, value, mono]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={mono ? "wq-mono" : undefined}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  return (
    <Modal
      open={!!payment}
      onClose={onClose}
      title={payment?.payment_reference || "Payment"}
      subtitle={payment ? `${stageLabel(payment.payment_stage) || "—"} · ${ackLabel(payment)}` : null}
      width={540}
    >
      {payment && (
        <>
            <div className="pm-modal-amount">
              <span className="ep-muted">Net credited</span>
              <span className="wq-mono">{formatMoney(payment.net_payment_amount)}</span>
            </div>

            {group("Patient", [
              ["Name", patient?.patient_name || patient?.child_name],
              ["Patient ID", patient?.child_id != null ? String(patient.child_id) : null, true],
              ["Facility", patient?.facility_name],
            ])}
            {group("Claim & payer", [
              ["Claim reference", payment.claim_reference, true],
              ["Claim ID", payment.claim_id != null ? String(payment.claim_id) : null, true],
              ["Payer", payment.payer_id, true],
              ["Provider", payment.provider_id, true],
            ])}
            {group("Settlement", [
              ["Payment date", payment.payment_date ? formatDate(payment.payment_date) : null],
              ["Gross", formatMoney(payment.gross_amount), true],
              ["TDS", payment.tds_amount != null ? formatMoney(Math.abs(payment.tds_amount)) : null, true],
              ["Net credited", formatMoney(payment.net_payment_amount), true],
              ["UTR", payment.utr, true],
              ["UTR type", payment.utr_type],
              ["Currency", payment.currency],
            ])}
            {group("Notice", [
              ["Notice identifier", payment.notice_identifier, true],
              ["Notice status", payment.notice_status],
              ["Notice amount", payment.notice_amount != null ? formatMoney(payment.notice_amount) : null, true],
              ["Created", payment.notice_created_at ? formatDateTime(payment.notice_created_at) : null],
              ["Reconciliation identifier", payment.recon_identifier, true],
            ])}
            {group("Acknowledgement", [
              ["Status", ackLabel(payment)],
              ["Acknowledged at", payment.acknowledged_at ? formatDateTime(payment.acknowledged_at) : null],
              ["Attempts", payment.acknowledgement_attempts != null ? String(payment.acknowledgement_attempts) : null],
            ])}
            {payment.acknowledgement_error && <div className="ep-notice is-bad">{payment.acknowledgement_error}</div>}
            {group("References", [
              ["Correlation ID", payment.correlation_id, true],
              ["Event key", payment.event_key, true],
              ["Workflow", payment.workflow_id != null ? String(payment.workflow_id) : null, true],
            ])}

            {payment.claim_reference && (
              <Button
                variant="outline"
                size="small"
                className="pm-modal-btn"
                onClick={() => {
                  onClose();
                  navigate(`/dashboard?q=${encodeURIComponent(claimSearchKey(payment))}`);
                }}
              >
                Find this claim in Cashless Cases
              </Button>
            )}
        </>
      )}
    </Modal>
  );
}

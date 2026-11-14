import { useState, useEffect } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, markHandled } from "../../api";
import { useReadOnly } from "../../lib/readOnly";
import { SkeletonTable, Button, TablePagination, Tip } from "../ui/Common";
import PageActions from "../ui/PageActions";
import Dropdown from "../ui/Dropdown";
import PayerName from "../ui/PayerName";
import { formatMoney, formatDate, formatCaseRef } from "../../lib/format.js";
import { groupPaymentEvents, ackState, ackLabel, stageWord } from "../../domain/paymentEvents.js";
import PaymentDrawer from "./PaymentDrawer";
import LinkPaymentDrawer from "./LinkPaymentDrawer";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest_amount", label: "Highest net" },
  { value: "highest_tds", label: "Highest TDS" },
];

const unlinked = (p) => p.claim_id == null && p.cashless_case_id == null;
const needsAck = (p) => ackState(p) !== "done";

const localDay = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const withinDates = (value, from, to) => {
  if (!from && !to) return true;
  const day = localDay(value);
  return !!day && (!from || day >= from) && (!to || day <= to);
};

const TILES = [
  { key: "all", label: "All payments", match: () => true, dot: "var(--text-muted)" },
  { key: "settled", label: "Settled", match: (p) => !unlinked(p) && p.settled, dot: "var(--success)" },
  { key: "progress", label: "In progress", match: (p) => !unlinked(p) && !p.settled, dot: "var(--info)" },
  { key: "unlinked", label: "Unlinked", match: unlinked, dot: "var(--warning)" },
];

const CSV_COLUMNS = [
  ["Payment reference", (p) => p.payment_reference],
  ["Case", (p) => (p.cashless_case_id ? formatCaseRef(p.cashless_case_id) : "")],
  ["Claim named by payer", (p) => p.claim_reference],
  ["Payer", (p) => p.payer_name || p.payer_id],
  ["Stage", (p) => stageWord(p.payment_stage)],
  ["Payment date", (p) => p.payment_date],
  ["UTR", (p) => p.utr],
  ["Gross", (p) => p.gross_amount],
  ["TDS", (p) => p.tds_amount],
  ["Net credited", (p) => p.net_payment_amount],
  ["Acknowledgement", (p) => ackLabel(p)],
];

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(rows) {
  const lines = [CSV_COLUMNS.map(([h]) => h).join(",")];
  rows.forEach((p) => lines.push(CSV_COLUMNS.map(([, f]) => csvCell(f(p))).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const caseLink = (p) => (p.cashless_case_id ? `/dashboard?case=${encodeURIComponent(p.cashless_case_id)}` : `/dashboard?q=${encodeURIComponent(p.claim_reference || "")}`);
const net = (list) => list.reduce((s, p) => s + (Number(p.net_payment_amount) || 0), 0);
const ackTone = (state) => (state === "failed" ? "is-bad" : state === "pending" ? "is-info" : "is-ok");

export default function Payments() {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const [searchParams] = useSearchParams();
  const urlView = searchParams.get("view") || "all";
  const [data, setData] = useState({ key: -1, payments: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [tile, setTile] = useState(() => (TILES.some((t) => t.key === urlView) ? urlView : "all"));
  const [ackOnly, setAckOnly] = useState(urlView === "ack");
  const [payerFilter, setPayerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [linking, setLinking] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .searchPaymentStatus({ paid_from: dateFrom || undefined, paid_to: dateTo || undefined })
      .then((res) => live && setData({ key: reloadKey, payments: groupPaymentEvents(res?.events || []), error: null }))
      .catch((err) => {
        markHandled(err);
        if (live) setData((prev) => ({ ...prev, key: reloadKey, error: err?.message || "The payments could not be loaded." }));
      });
    return () => {
      live = false;
    };
  }, [reloadKey, dateFrom, dateTo]);

  const loading = data.key !== reloadKey;
  const payments = data.payments || [];
  const refresh = () => setReloadKey((k) => k + 1);
  const current = payments.find((p) => p.group_key === selected?.group_key) || selected;

  const payerOptions = [{ value: "", label: "All payers" }, ...Array.from(new Map(payments.map((p) => [p.payer_id || p.payer_name, p.payer_name || p.payer_id])).entries()).filter(([value]) => value).map(([value, label]) => ({ value, label }))];
  const q = search.trim().toLowerCase();
  const searched = payments.filter((p) => (!payerFilter || (p.payer_id || p.payer_name) === payerFilter) && withinDates(p.payment_date, dateFrom, dateTo) && (!q || [p.claim_reference, p.payment_reference, p.utr, p.patient_name, p.cashless_case_id && formatCaseRef(p.cashless_case_id)].some((v) => v && String(v).toLowerCase().includes(q))));
  const scoped = ackOnly ? searched.filter(needsAck) : searched;
  const tileRows = Object.fromEntries(TILES.map((t) => [t.key, scoped.filter(t.match)]));
  const ackCount = searched.filter(needsAck).length;
  const activeTile = TILES.find((t) => t.key === tile) || TILES[0];
  const filtered = tileRows[activeTile.key].slice().sort((a, b) => {
    const dA = Date.parse(a.payment_date) || 0;
    const dB = Date.parse(b.payment_date) || 0;
    if (sortBy === "oldest") return dA - dB;
    if (sortBy === "highest_amount") return (b.net_payment_amount || 0) - (a.net_payment_amount || 0);
    if (sortBy === "highest_tds") return (b.tds_amount || 0) - (a.tds_amount || 0);
    return dB - dA;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const sum = (key) => filtered.reduce((s, p) => s + Math.abs(Number(p[key]) || 0), 0);
  const pickTile = (key) => {
    setTile(key);
    setPage(0);
  };
  const openCase = (p) => navigate(caseLink(p));

  return (
    <div className="cc-screen payments-screen">
      <PageActions>
        <Button variant="outline" size="small" icon={Download} disabled={loading || filtered.length === 0} onClick={() => downloadCsv(filtered)} title="Download the payments shown as a CSV for the bank reconciliation">
          Download CSV
        </Button>
        <Button variant="outline" size="small" icon={RefreshCw} disabled={loading} onClick={refresh} title="Reload the payments">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </PageActions>

      {data.error && (
        <div className="cv-notice is-warn" role="alert">
          <div className="cv-notice-body">The payments could not be loaded{data.payments ? ", so the list may be out of date" : ""}: {data.error}</div>
          <div className="cv-notice-actions">
            <button type="button" className="cc-act" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="cc-kpis" role="group" aria-label="Payment stage">
        {TILES.map((t) => (
          <button key={t.key} type="button" aria-pressed={tile === t.key} className={`cc-kpi cc-kpi-btn${tile === t.key ? " is-on" : ""}`} onClick={() => pickTile(t.key)}>
            <span className="cc-kpi-label">
              <span className="cc-kpi-dot" style={{ background: t.dot }} />
              {t.label}
            </span>
            {loading && !data.payments ? (
              <span className="skeleton-line cc-kpi-skeleton" />
            ) : (
              <span className="cc-kpi-value">
                {tileRows[t.key].length}
                <span className="pm-kpi-sub">{formatMoney(net(tileRows[t.key]))}</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <Tip className="wq-page-tip">Money the payers have sent. Settled payments carry a UTR to match with the bank statement; an unlinked payment names a claim this hospital does not know and needs a case picked for it.</Tip>

      <div className="wq-panel">
        <div className="wq-toolbar">
          <input
            className="input-modern wq-search"
            placeholder="Search case, claim, payment reference or UTR…"
            aria-label="Search payments"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <div className="wq-chips" role="group" aria-label="Acknowledgement">
            <button
              type="button"
              className={`wq-chip${ackOnly ? " is-on" : ""}`}
              aria-pressed={ackOnly}
              onClick={() => {
                setAckOnly((v) => !v);
                setPage(0);
              }}
            >
              <span className="wq-chip-dot is-urgent" aria-hidden="true" />
              Acknowledgement due
              <span className="wq-chip-count">{loading && !data.payments ? "–" : ackCount}</span>
            </button>
          </div>
          <div className="wq-toolbar-spacer" />
          {payerOptions.length > 2 && (
            <div className="cm-filter">
              <Dropdown
                compact
                ariaLabel="Payer"
                value={payerFilter}
                options={payerOptions}
                onChange={(v) => {
                  setPayerFilter(v);
                  setPage(0);
                }}
              />
            </div>
          )}
          <div className="cm-dates">
            <label className="cm-date">
              <span>From</span>
              <input
                type="date"
                className="cv-ctl"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="cm-date">
              <span>To</span>
              <input
                type="date"
                className="cv-ctl"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
          <div className="cc-sort">
            <Dropdown
              compact
              ariaLabel="Sort"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={(v) => {
                setSortBy(v);
                setPage(0);
              }}
            />
          </div>
        </div>

        {loading && !data.payments ? (
          <SkeletonTable rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <div className="wq-empty">
            <div className="wq-empty-title">{payments.length ? "No payments match these filters" : "No payments yet"}</div>
            <div className="cc-empty-hint">{payments.length ? "Try a different search, tile or payer." : "Payments appear here once a payer settles a claim, usually days after the claim is approved."}</div>
          </div>
        ) : (
          <>
            <div className="wq-table-scroll">
              <table className="wq-table pm-table">
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Case · payer</th>
                    <th>Stage</th>
                    <th className="cc-num">Gross</th>
                    <th className="cc-num">TDS</th>
                    <th className="cc-num">Net credited</th>
                    <th>Acknowledged</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((pay) => {
                    const ack = ackState(pay);
                    return (
                      <tr
                        key={pay.group_key}
                        tabIndex={0}
                        onClick={() => setSelected(pay)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelected(pay);
                        }}
                      >
                        <td>
                          <div className="wq-mono cc-case-id">{pay.payment_reference || pay.notice_identifier || "—"}</div>
                          <div className="wq-sub">{[pay.payment_date && formatDate(pay.payment_date), pay.utr && `UTR ${pay.utr}`, pay.notice_count > 1 && `${pay.notice_count} notices`].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td>
                          {unlinked(pay) ? (
                            <>
                              <div className="cc-patient pm-unlinked">Not linked to a case</div>
                              <div className="wq-sub">Payer named {pay.claim_reference ? <span className="wq-mono">{pay.claim_reference}</span> : "no claim"}</div>
                            </>
                          ) : (
                            <>
                              <div className="cc-patient">{pay.patient_name || (pay.cashless_case_id ? formatCaseRef(pay.cashless_case_id) : pay.claim_reference)}</div>
                              <div className="wq-sub">
                                <PayerName id={pay.payer_id} name={pay.payer_name} />
                                {pay.cashless_case_id && pay.patient_name ? ` · ${formatCaseRef(pay.cashless_case_id)}` : pay.claim_reference && pay.cashless_case_id ? ` · ${pay.claim_reference}` : ""}
                              </div>
                            </>
                          )}
                        </td>
                        <td>{stageWord(pay.payment_stage) || "—"}</td>
                        <td className="wq-num cc-num">{formatMoney(pay.gross_amount)}</td>
                        <td className="wq-num cc-num">{pay.tds_amount != null ? formatMoney(Math.abs(pay.tds_amount)) : "—"}</td>
                        <td className="wq-num cc-num pm-net">{formatMoney(pay.net_payment_amount)}</td>
                        <td>
                          <span className={`cv-chip ${ackTone(ack)}`}>{ackLabel(ack)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="pm-total">
                      <td colSpan={3}>{filtered.length} payments</td>
                      <td className="wq-num cc-num">{formatMoney(sum("gross_amount"))}</td>
                      <td className="wq-num cc-num">{formatMoney(sum("tds_amount"))}</td>
                      <td className="wq-num cc-num">{formatMoney(sum("net_payment_amount"))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="wq-pagination">
              <TablePagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} label="payments" />
            </div>
          </>
        )}
      </div>

      <PaymentDrawer
        payment={current}
        onClose={() => setSelected(null)}
        onOpenCase={(p) => {
          setSelected(null);
          openCase(p);
        }}
        onLink={(p) => {
          setSelected(null);
          if (!readOnly) setLinking(p);
        }}
        onChanged={refresh}
      />
      <LinkPaymentDrawer payment={linking} onClose={() => setLinking(null)} onLinked={refresh} />
    </div>
  );
}

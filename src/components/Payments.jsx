import { useState, useEffect } from "react";
import { Search, CreditCard, Download, CheckCircle, ArrowRight } from "lucide-react";
import { PageHeader, Card, StatusBadge, Button, Input, AmountGrid } from "./Common";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      try {
        const response = await api.searchPaymentStatus();
        setPayments(response?.events || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  const filtered = payments.filter(p => 
    p.claim_reference?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.payment_reference?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="payments-screen">
      <PageHeader 
        title="Payment Reconciliation" 
        subtitle="Track payment settlements, UTRs, and TDS deductions from payers." 
      />

      <Card className="mb-6">
        <div style={{ maxWidth: "400px" }}>
          <Input
            icon={Search}
            placeholder="Search claim ref or payment ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading payments...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-view py-20 text-center">
          <CreditCard size={48} className="text-muted mb-4 mx-auto" style={{ opacity: 0.5 }} />
          <h3>No Payments Found</h3>
          <p className="text-muted mt-2">No matching payment records.</p>
        </div>
      ) : (
        <Card title="Payment Events">
          <div className="table-responsive-wrapper">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payment Ref</th>
                  <th>Claim Ref</th>
                  <th>Date</th>
                  <th>Stage</th>
                  <th>Gross Amt</th>
                  <th>TDS</th>
                  <th>Net Payment</th>
                  <th>UTR</th>
                  <th>Ack Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pay, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{pay.payment_reference}</td>
                    <td><a href="#" onClick={(e) => { e.preventDefault(); navigate(`/case/0/payment`); }}>{pay.claim_reference}</a></td>
                    <td>{pay.payment_date}</td>
                    <td>
                      <StatusBadge status={pay.payment_stage?.replace('PAYMENT_', '')} />
                    </td>
                    <td>₹{pay.gross_amount?.toLocaleString()}</td>
                    <td style={{ color: 'var(--error)' }}>-₹{pay.tds_amount?.toLocaleString()}</td>
                    <td style={{ fontWeight: 800, color: 'var(--success)' }}>₹{pay.net_payment_amount?.toLocaleString()}</td>
                    <td>
                      {pay.utr ? <code>{pay.utr}</code> : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {pay.acknowledgement_status === 'submitted' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)', fontSize: '11px', fontWeight: 600 }}>
                          <CheckCircle size={12} /> ACKNOWLEDGED
                        </div>
                      ) : (
                        <span className="badge-modern badge-warning" style={{ fontSize: '10px' }}>PENDING</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

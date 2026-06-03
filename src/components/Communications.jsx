import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, MessageSquare, AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";
import { api } from "../api";
import { PageHeader, Card, Button, Input } from "./Common";
import { useNavigate } from "react-router-dom";

export default function Communications() {
  const navigate = useNavigate();
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchComms = async () => {
      setLoading(true);
      try {
        const response = await api.listCommunications();
        setCommunications(response?.communications || []);
      } catch (error) {
        console.error("Communications fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchComms();
  }, []);

  const filteredComms = communications.filter(c => 
    c.topic_display?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.payer_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.claim_reference?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="communications-screen">
      <PageHeader 
        title="Payer Communications" 
        subtitle="Review and respond to messages, queries, and notices from payers." 
      />

      <Card className="mb-6">
        <div style={{ maxWidth: "400px" }}>
          <Input
            icon={Search}
            placeholder="Search topics, payers, or claims..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {loading ? (
        <div className="flex-center py-20 flex-col">
          <div className="spinner mb-4" />
          <p className="text-muted">Loading communications...</p>
        </div>
      ) : filteredComms.length === 0 ? (
        <div className="empty-view py-20 text-center">
          <MessageSquare size={48} className="text-muted mb-4 mx-auto" style={{ opacity: 0.5 }} />
          <h3>No Communications</h3>
          <p className="text-muted mt-2">No messages from payers match your search.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredComms.map((comm) => (
            <Card key={comm.correlation_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '4px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{comm.topic_display}</h3>
                      <span className={`badge-modern badge-${comm.priority === 'high' ? 'warning' : comm.priority === 'urgent' ? 'error' : 'info'}`}>
                        {comm.priority?.toUpperCase()}
                      </span>
                      {!comm.acknowledged && (
                        <span style={{ fontSize: '11px', color: 'var(--error)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={12} /> NEW
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '24px', fontSize: '13px', color: 'var(--text-muted)', marginTop: '12px' }}>
                      <div><strong style={{ color: 'var(--text-main)' }}>Payer:</strong> {comm.payer_code}</div>
                      <div><strong style={{ color: 'var(--text-main)' }}>Claim Ref:</strong> {comm.claim_reference}</div>
                      <div><strong style={{ color: 'var(--text-main)' }}>Date:</strong> {new Date(comm.sent_at).toLocaleString()}</div>
                    </div>

                    {comm.pending_tasks?.length > 0 && (
                      <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(245,158,11,0.05)', border: '1px solid var(--warning)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warning)', marginBottom: '8px' }}>PENDING TASKS</div>
                        {comm.pending_tasks.map(pt => (
                          <div key={pt.task_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px' }}>{pt.title}</span>
                            <Button size="small" variant="outline" onClick={() => navigate('/work-queue')}>Review in Queue</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <Button variant="outline" icon={ExternalLink}>View Details</Button>
              </div>
            </Card>
          ))}
        </motion.div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Users, FileText, Clock, CheckCircle } from 'lucide-react';
import { api } from '../api';
import { Card, Button, Input, StatusBadge, PageHeader } from './Common';

const Dashboard = ({ onSelectPatient }) => {
  const [stats, setStats] = useState(null);
  const [searchParams, setSearchParams] = useState({ name: '', mobile: '' });
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const searchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.searchChildren(searchParams);
      setPatients(data.children || []);
    } catch (error) {
      console.error('Error searching patients:', error);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStats();
      searchPatients();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStats, searchPatients]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="dashboard-modern">
      <PageHeader 
        title="NHCX Claims Dashboard" 
        subtitle="Real-time monitoring of NHCX cashless ecosystem performance." 
      />

      {stats && (
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="stats-grid-modern"
        >
          <motion.div variants={item} className="stat-card-modern">
            <div className='stat-card-num'>
              <div className="stat-icon-wrapper" style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <FileText size={24} />
            </div>
            <span className="stat-value-modern">{stats.claims.total}</span>
            </div>
            <span className="stat-label-modern">Total Claims</span>
          </motion.div>

          <motion.div variants={item} className="stat-card-modern">
            <div className='stat-card-num'>

            <div className="stat-icon-wrapper" style={{ background: '#fffbeb', color: '#d97706' }}>
              <Clock size={24} />
            </div>
            <span className="stat-value-modern">{stats.claims.pending}</span>
            </div>
            <span className="stat-label-modern">Pending Claims</span>
          </motion.div>

          <motion.div variants={item} className="stat-card-modern">
            <div className='stat-card-num'>

            <div className="stat-icon-wrapper" style={{ background: '#ecfdf5', color: '#059669' }}>
              <CheckCircle size={24} />
            </div>
            <span className="stat-value-modern">{stats.claims.complete}</span>
            </div>
            <span className="stat-label-modern">Completed</span>
          </motion.div>

          <motion.div variants={item} className="stat-card-modern">
            <div className='stat-card-num'>

            <div className="stat-icon-wrapper" style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Users size={24} />
            </div>
            <span className="stat-value-modern">{stats.patients.with_claims}</span>
            </div>
            <span className="stat-label-modern">Children with Claims</span>
          </motion.div>
        </motion.div>
      )}

      <Card title="Child Registry" className="registry-card-modern">
        <div className="search-bar-modern" style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
          <div style={{ flex: 1 }}>
            <Input 
              icon={Search}
              placeholder="Search by name" 
              value={searchParams.name}
              onChange={(e) => setSearchParams({ ...searchParams, name: e.target.value })}
            />
          </div>
          <div style={{ width: '200px' }}>
            <Input 
              placeholder="Mobile number" 
              value={searchParams.mobile}
              onChange={(e) => setSearchParams({ ...searchParams, mobile: e.target.value })}
            />
          </div>
          <Button onClick={searchPatients} disabled={loading} icon={Search}>
            {loading ? 'Searching...' : 'Find'}
          </Button>
        </div>

        <div className="table-container-modern">
          <table className="table-modern">
            <thead>
              <tr>
                <th>ID</th>
                <th>Patient Name</th>
                <th>Gender</th>
                <th>DOB</th>
                <th>Claim Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <motion.tr 
                  layoutId={patient.child_id.toString()}
                  key={patient.child_id}
                >
                  <td>#{patient.child_id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      
                      <strong>{patient.name}</strong>
                    </div>
                  </td>
                  <td>{patient.gender}</td>
                  <td>{patient.dob}</td>
                  <td>
                    {patient.latest_claim ? (
                      <StatusBadge status={patient.latest_claim.status} />
                    ) : (
                      <span className="text-muted">No claims</span>
                    )}
                  </td>
                  <td>
                    <Button variant="outline" onClick={() => onSelectPatient(patient)}>
                      Start Workflow
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {patients.length === 0 && !loading && (
            <div className="text-center py-12">
              <Users size={48} className="text-muted mb-4 mx-auto" style={{ opacity: 0.3 }} />
              <p className="text-muted">No patients found. Try a different search term.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;

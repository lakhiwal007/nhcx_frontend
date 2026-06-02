import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Building2, Globe, Phone } from "lucide-react";
import { api } from "../api";
import { Card, Button, Input, StatusBadge, PageHeader } from "./Common";

const PayerNetwork = () => {
  const [payers, setPayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPayers = useCallback(async (name = "") => {
    setLoading(true);
    try {
      const data = await api.searchPayers({ name });
      setPayers(data || []);
    } catch (error) {
      console.error("Error fetching payers:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayers(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchPayers]);

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="payer-network-modern">
      <PageHeader
        title="Payer Network Directory"
        subtitle="Explore and manage insurance providers within the NHCX ecosystem."
      />

      <div className="search-section mb-10">
        <Card>
          <div className="flex gap-4">
            <Input
              icon={Search}
              placeholder="Search by payer name or participant code..."
              value={searchQuery}
              onChange={handleSearch}
            />
            <Button
              className="mt-8"
              onClick={() => fetchPayers(searchQuery)}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search Network"}
            </Button>
          </div>
        </Card>
      </div>

      {loading && (
        <div className="flex-center py-20">
          <div className="spinner"></div>
          <p className="ml-4 text-muted">Querying NHCX Registry...</p>
        </div>
      )}

      {!loading && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid-1-to-2 mt-8"
          style={{ gap: "24px" }}
        >
          {payers.map((payer) => (
            <motion.div key={payer.participant_code} variants={item}>
              <Card className="h-full">
                <div className="flex-between mb-6">
                  <div
                    className="flex items-center gap-4"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                    }}
                  >
                    <div
                      className="brand-logo"
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "12px",
                      }}
                    >
                      <Building2 color="white" size={24} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                        {payer.name}
                      </h3>
                      <code
                        style={{ fontSize: "12px", color: "var(--text-muted)" }}
                      >
                        {payer.participant_code}
                      </code>
                    </div>
                  </div>
                  <StatusBadge status={payer.status} />
                </div>

                <div
                  className="payer-meta grid-1-to-2 mt-6 pt-6"
                  style={{
                    borderTop: "1px solid var(--border-color)",
                    gap: "16px",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Scheme Type
                    </span>
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>
                      {payer.scheme_type}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Registry Status
                    </span>
                    <div
                      style={{
                        fontWeight: "600",
                        fontSize: "14px",
                        color: "var(--success)",
                      }}
                    >
                      Verified
                    </div>
                  </div>
                </div>

                <div
                  className="contact-links mt-8 flex gap-4"
                  style={{ display: "flex", gap: "12px" }}
                >
                  <Button
                    variant="outline"
                    className="flex-grow"
                    icon={Globe}
                    style={{ padding: "8px" }}
                  >
                    Website
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-grow"
                    icon={Phone}
                    style={{ padding: "8px" }}
                  >
                    Support
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}

          {payers.length === 0 && (
            <div className="col-span-full text-center py-20">
              <Building2
                size={64}
                className="mx-auto text-muted mb-4"
                style={{ opacity: 0.2 }}
              />
              <h3 className="text-muted">
                No payers found matching your search.
              </h3>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default PayerNetwork;

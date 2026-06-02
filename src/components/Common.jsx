import { motion } from "framer-motion";
import { CheckCircle, AlertCircle, Clock, Info } from "lucide-react";

export const Card = ({ title, children, className = "", headerAction }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`card-modern ${className}`}
  >
    {title && (
      <div className="card-header-modern">
        <h3>{title}</h3>
        {headerAction}
      </div>
    )}
    <div className="card-body-modern">{children}</div>
  </motion.div>
);

export const Button = ({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
  icon: Icon,
}) => (
  <motion.button
    whileHover={!disabled ? { scale: 1.02 } : {}}
    whileTap={!disabled ? { scale: 0.98 } : {}}
    className={`btn-modern btn-${variant}-modern ${className}`}
    onClick={onClick}
    disabled={disabled}
  >
    {Icon && <Icon size={18} />}
    {children}
  </motion.button>
);

export const StatusBadge = ({ status }) => {
  const getStatusConfig = (s) => {
    switch (s?.toLowerCase()) {
      case "complete":
      case "approved":
      case "active":
        return { class: "badge-success", icon: CheckCircle };
      case "pending":
      case "submitted":
        return { class: "badge-warning", icon: Clock };
      case "failed":
      case "rejected":
        return { class: "badge-error", icon: AlertCircle };
      case "partial":
        return { class: "badge-info", icon: Info };
      default:
        return { class: "badge-info", icon: Info };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span className={`badge-modern ${config.class}`}>
      <Icon size={14} />
      {status || "Unknown"}
    </span>
  );
};

export const Input = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  name,
  icon: Icon,
}) => (
  <div className="input-group-modern">
    {label && <label className="input-label-modern">{label}</label>}
    <div className="input-wrapper-modern" style={{ position: "relative" }}>
      {Icon && (
        <Icon
          size={18}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#64748b",
          }}
        />
      )}
      <input
        style={Icon ? { paddingLeft: "40px" } : {}}
        className="input-modern"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  </div>
);

export const PageHeader = ({ title, subtitle, backAction }) => (
  <div className="page-header-modern">
    {backAction && (
      <Button variant="text" onClick={backAction} className="mb-2">
        ← Back
      </Button>
    )}
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </div>
);

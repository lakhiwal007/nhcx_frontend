import { ArrowLeft } from "lucide-react";

export default function BackButton({ children, onClick, title, className = "" }) {
  return (
    <button type="button" className={`back-btn ${className}`.trim()} onClick={onClick} title={title}>
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

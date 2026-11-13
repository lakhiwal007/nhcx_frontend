import { ShieldCheck } from "lucide-react";

export default function BrandMark({ size = 24 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <polygon className="brand-mark-ink" strokeWidth="3" strokeLinejoin="round" transform="translate(-2.2 -2.2)" points="23,8 41,8 41,23 23,41 8,41 8,23 23,23" />
      <polygon className="brand-mark-accent" strokeWidth="3" strokeLinejoin="round" transform="translate(2.2 2.2)" points="41,23 56,23 56,41 41,41 41,56 23,56 23,41" />
    </svg>
  );
}

export function ShieldBrandMark({ size = 16 }) {
  return <ShieldCheck color="white" size={size} aria-hidden="true" />;
}

import { ListTodo, LayoutDashboard, Users, MessageSquare, CreditCard, BarChart3, Settings } from "lucide-react";
import { stageInfo } from "../components/case/frame/caseStages";

export const SCREEN_LABELS = {
  "work-queue": "Work Queue",
  dashboard: "Cashless Cases",
  registry: "Patient Registry",
  communications: "Communications",
  payments: "Payments",
  analytics: "Analytics",
  settings: "Settings",
  case: "Cashless Cases",
};

export const HOME = "/work-queue";

export function navItemsFor({ pendingTasks, unreadMessages }) {
  return [
    { to: "/work-queue", icon: ListTodo, label: "Work Queue", badge: pendingTasks },
    { to: "/dashboard", icon: LayoutDashboard, label: "Cashless Cases" },
    { to: "/registry", icon: Users, label: "Patient Registry" },
    { to: "/communications", icon: MessageSquare, label: "Communications", badge: unreadMessages, badgeTone: "info" },
    { to: "/payments", icon: CreditCard, label: "Payments" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
  ];
}

export const SETTINGS_ITEM = { to: "/settings", icon: Settings, label: "Settings" };

export function crumbsFor(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: SCREEN_LABELS["work-queue"], to: HOME }];
  return parts.map((p, i) => ({
    label: parts[0] === "case" && i === 2 ? stageInfo(p)?.label || p : parts[0] === "case" && i === 1 ? `Patient ${p}` : Number.isNaN(Number(p)) ? SCREEN_LABELS[p] || p : `#${p}`,
    to: p === "case" ? "/dashboard" : parts[0] === "case" && i === 1 ? `/registry?child_id=${p}` : `/${parts.slice(0, i + 1).join("/")}`,
  }));
}

export function pageTitleFor(pathname) {
  return crumbsFor(pathname)
    .map((c) => c.label)
    .filter((l) => l !== SCREEN_LABELS.case || pathname === "/dashboard")
    .reverse()
    .join(" · ");
}

export const badgeText = (count, { total = null, limit = null } = {}) => {
  if (!(count > 0)) return null;
  if (total != null) return total > 99 ? "99+" : String(total);
  if (limit != null && count >= limit) return `${limit}+`;
  return count > 99 ? "99+" : String(count);
};

import { Lightbulb } from "lucide-react";
import { useTips } from "./tips.js";

export default function TipsToggle() {
  const { showTips, setShowTips } = useTips();
  return (
    <button
      type="button"
      className={`tips-toggle${showTips ? " is-on" : ""}`}
      onClick={() => setShowTips(!showTips)}
      aria-pressed={showTips}
      title={showTips ? "Hide the extra explanations on each screen" : "Show short explanations on each screen"}
    >
      <Lightbulb size={13} aria-hidden="true" />
      Tips {showTips ? "on" : "off"}
    </button>
  );
}

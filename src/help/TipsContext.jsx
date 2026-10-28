import { useState } from "react";
import { TipsContext } from "./tips.js";

const KEY = "nhcx_show_tips";

const readStored = () => {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
};

export function TipsProvider({ children }) {
  const [showTips, setState] = useState(readStored);
  const setShowTips = (value) => {
    setState(value);
    try {
      localStorage.setItem(KEY, value ? "true" : "false");
    } catch {
      return;
    }
  };
  return <TipsContext.Provider value={{ showTips, setShowTips }}>{children}</TipsContext.Provider>;
}


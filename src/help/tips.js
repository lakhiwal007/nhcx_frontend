import { createContext, useContext } from "react";

export const TipsContext = createContext({ showTips: false, setShowTips: () => {} });

export const useTips = () => useContext(TipsContext);

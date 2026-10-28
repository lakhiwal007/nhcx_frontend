import { createContext, useContext } from "react";

export const TipsContext = createContext({ showTips: true, setShowTips: () => {} });

export const useTips = () => useContext(TipsContext);

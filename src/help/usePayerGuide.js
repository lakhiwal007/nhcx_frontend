import { useEffect, useState } from "react";
import { loadPayerGuide, onPayerGuideLoaded, payerGuideReady } from "../api/payrErrors.js";

export function usePayerGuide() {
  const [, setReady] = useState(payerGuideReady);
  useEffect(() => {
    const stop = onPayerGuideLoaded(() => setReady(true));
    loadPayerGuide();
    return stop;
  }, []);
}

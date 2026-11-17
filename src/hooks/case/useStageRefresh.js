import { useEffect, useRef } from "react";

export function useStageRefresh(ctx, fn) {
  const fnRef = useRef(fn);
  const register = ctx?.onRefresh;

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!register) return undefined;
    return register(() => fnRef.current?.());
  }, [register]);
}

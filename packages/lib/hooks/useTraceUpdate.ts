import { useEffect, useRef } from "react";

export function useTraceUpdate(props: { [s: string]: unknown } | ArrayLike<unknown>) {
  const prev = useRef(props);
  useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps, [k, v]) => {
      // @ts-expect-error TODO: fix this
      if (prev.current[k] !== v) {
        // @ts-expect-error TODO: fix this
        ps[k] = [prev.current[k], v];
      }
      return ps;
    }, {});
    prev.current = props;
  });
}

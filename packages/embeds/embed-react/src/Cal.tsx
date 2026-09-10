"use client";

import { useEffect, useRef } from "react";

import type { PrefillAndIframeAttrsConfig } from "@calcom/embed-core";

import useEmbed from "./useEmbed";

type CalProps = {
  calOrigin?: string;
  calLink: string;
  initConfig?: {
    debug?: boolean;
    uiDebug?: boolean;
  };
  namespace?: string;
  config?: PrefillAndIframeAttrsConfig;
  embedJsUrl?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const Cal = function Cal(props: CalProps) {
  const { calLink, calOrigin, namespace = "", config, initConfig = {}, embedJsUrl, ...restProps } = props;
  if (!calLink) {
    throw new Error("calLink is required");
  }
  const initializedRef = useRef(false);
  const Cal = useEmbed(embedJsUrl);
  const ref = useRef<HTMLDivElement>(null);

  // Guard prevents double-invocation in React Strict Mode.
  // config and calLink are excluded so init fires exactly once;
  // updates are handled reactively in the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!Cal || initializedRef.current || !ref.current) {
      return;
    }
    initializedRef.current = true;
    const element = ref.current;
    if (namespace) {
      Cal("init", namespace, {
        ...initConfig,
        origin: calOrigin,
      });
      Cal.ns[namespace]("inline", {
        elementOrSelector: element,
        calLink,
        config,
      });
    } else {
      Cal("init", {
        ...initConfig,
        origin: calOrigin,
      });
      Cal("inline", {
        elementOrSelector: element,
        calLink,
        config,
      });
    }
  // NOTE: config and calLink deliberately omitted — see effect below.
  }, [Cal, namespace, calOrigin, initConfig]);

  // Separated from calLink: "ui" only updates visual config and does not
  // consume calLink, so including it here would cause unnecessary re-runs.
  // calLink changes are only meaningful during initialization ("inline").
  useEffect(() => {
    if (!Cal || !initializedRef.current) {
      return;
    }
    // Namespace guard: only call if namespace has been initialized above.
    if (namespace) {
      Cal.ns[namespace]("ui", { ...config });
    } else {
      Cal("ui", { ...config });
    }
  }, [Cal, namespace, config]);

  if (!Cal) {
    return null;
  }

  return <div ref={ref} {...restProps} />;
};
export default Cal;

import { useEffect, useRef, useState } from "react";

interface InitOptions {
  scheme?: string;
  domain?: string;
  path?: string;
}

interface Callbacks {
  onClose?: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

interface CheckoutOptions {
  paymentRequest?: string;
}

interface HitPayOptions {
  visible: boolean;
  defaultUrl: string;
  initOptions: InitOptions;
  callbacks?: Callbacks;
  checkoutOptions: CheckoutOptions;
}

export interface HitPayDropInResult {
  isInitialized: boolean;
  init: (
    url: string,
    initOptions: InitOptions,
    checkoutOptions: CheckoutOptions,
    callbacks?: Callbacks
  ) => Promise<void>;
  toggle: (checkoutOptions: CheckoutOptions) => Promise<void>;
}

export const useHitPayDropIn = (): HitPayDropInResult => {
  const [isInitialized, setIsInitialized] = useState(false);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const loadPromise = useRef<Promise<void> | null>(null);
  const resolveLoad = useRef<(() => void) | null>(null);
  const previousOverflow = useRef<string>("visible");
  const toggling = useRef<boolean>(false);

  const hitPayOptions = useRef<HitPayOptions>({
    visible: false,
    defaultUrl: "",
    initOptions: { scheme: "", domain: "" },
    checkoutOptions: {},
  });

  const init = async (
    url: string,
    initOptions: InitOptions,
    checkoutOptions: CheckoutOptions,
    callbacks?: Callbacks
  ) => {
    if (!isInitialized) {
      hitPayOptions.current.defaultUrl = url;
      hitPayOptions.current.initOptions = initOptions;
      hitPayOptions.current.callbacks = callbacks;
      hitPayOptions.current.checkoutOptions.paymentRequest = checkoutOptions.paymentRequest || "";

      const scheme = initOptions.scheme || "https";
      const domain = initOptions.domain || "hit-pay.com";
      const path = initOptions.path || "";

      document.body.style.cssText = "width: 100vw; height: 100vh; overflow: hidden; margin: 0; padding: 0;";

      const iframeSrc = `${scheme}://${domain}${path}/hitpay-iframe.html?post-parent=true&timestamp=${Date.now()}`;

      iframe.current = document.createElement("iframe");
      iframe.current.setAttribute("src", iframeSrc);
      iframe.current.setAttribute("allowFullscreen", "true");
      iframe.current.style.position = "fixed";
      iframe.current.style.border = "0";
      iframe.current.style.width = "100vw";
      iframe.current.style.height = "100vh";
      iframe.current.style.margin = "0";
      iframe.current.style.padding = "0";
      iframe.current.style.zIndex = "99999999";
      iframe.current.style.top = "0";
      iframe.current.style.left = "0";
      iframe.current.style.display = "none";

      document.body.appendChild(iframe.current);

      loadPromise.current = new Promise((resolve) => {
        resolveLoad.current = resolve;
        setTimeout(resolve, 2000);
      });
    }
  };

  const toggle = async (checkoutOptions: CheckoutOptions) => {
    toggling.current = true;
    if (loadPromise.current) await loadPromise.current;

    if (hitPayOptions.current.visible) {
      document.body.style.overflow = previousOverflow.current;
    } else {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      if (iframe.current) {
        iframe.current.style.display = "block";
      }
    }

    const delay = hitPayOptions.current.visible ? 0 : 500;
    setTimeout(() => {
      iframe.current?.contentWindow?.postMessage(
        {
          type: "toggle",
          props: {
            defaultUrl: hitPayOptions.current.defaultUrl,
            ...hitPayOptions.current.initOptions,
            checkoutOptions,
          },
        },
        "*"
      );

      hitPayOptions.current.visible = !hitPayOptions.current.visible;

      if (!hitPayOptions.current.visible) {
        if (iframe.current) {
          iframe.current.style.display = "none";
        }

        hitPayOptions.current.callbacks?.onClose && hitPayOptions.current.callbacks.onClose();
      }

      toggling.current = false;
    }, delay);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && !toggling.current) {
        switch (event.data.type) {
          case "loaded":
            toggle(hitPayOptions.current.checkoutOptions);
            loadPromise.current = null;
            setIsInitialized(true);
            if (resolveLoad.current) {
              resolveLoad.current();
            }
            break;
          case "toggle":
            toggle({});
            break;
          case "success":
            if (hitPayOptions.current.callbacks?.onSuccess) {
              hitPayOptions.current.callbacks?.onSuccess();
            }
            break;
          case "error":
            if (hitPayOptions.current.callbacks?.onError) {
              hitPayOptions.current.callbacks.onError(event.data.error);
            }
            break;
          default:
            break;
        }
      }
    };
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return { isInitialized, init, toggle };
};

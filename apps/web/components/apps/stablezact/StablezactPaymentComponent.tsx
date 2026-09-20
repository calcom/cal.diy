"use client";

import process from "node:process";
import { useBookingSuccessRedirect } from "@calcom/features/bookings/lib/bookingSuccessRedirect";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { showToast } from "@calcom/ui/components/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import z from "zod";

// Local prop shape (same convention as the other payment app client components,
// e.g. btcpayserver) so this "use client" component never imports the server-only
// getServerSideProps module. `profile` is included because we read `profile.name`.
type PaymentPageProps = {
  payment: {
    id: number;
    success: boolean;
    refunded: boolean;
    amount: number;
    currency: string;
    paymentOption: string | null;
    data: Record<string, unknown>;
  };
  clientSecret?: string | null;
  booking: {
    id: number;
    uid: string;
    title: string;
    startTime: string;
    endTime: string;
    status: string;
    paid: boolean;
    description?: string | null;
    location?: string | null;
    attendees?: Array<{ name: string; email: string; timeZone: string }>;
    user?: { name: string | null; timeZone: string } | null;
  };
  eventType: {
    id: number;
    title: string;
    length: number;
    price: number;
    currency: string;
    metadata: Record<string, unknown> | null;
    successRedirectUrl?: string | null;
    forwardParamsSuccessRedirect?: boolean | null;
    recurringEvent?: unknown;
  };
  profile: { name?: string | null; theme?: string | null; hideBranding?: boolean };
};

interface IStablezactPaymentComponentProps {
  payment: {
    data: unknown;
  };
  paymentPageProps: PaymentPageProps;
}

// Create zod schema for Stablezact payment data
const PaymentStablezactDataSchema = z.object({
  success: z.boolean(),
  requestId: z.string(),
  amount: z.number(),
  payment: z.object({
    id: z.string(),
    amount: z.number(),
    totalAmount: z.number(),
    currency: z.string(),
    network: z.string(),
    status: z.enum(["pending", "confirmed", "failed"]),
    expiresAt: z.string(),
    paymentMethod: z.string(),
    contractAddress: z.string().optional(),
    merchantWallet: z.string().optional(),
    stablezactWallet: z.string().optional(),
    merchantPercentage: z.number().optional(),
    stablezactPercentage: z.number().optional(),
    chainId: z.number().optional(),
    tokenAddress: z.string().optional(),
    tokenDecimals: z.number().optional(),
  }),
  credentials: z
    .object({
      public_key: z.string(),
    })
    .optional(),
});

// Payment details (booking/payment ids, wallet config, tx hashes, raw callbacks)
// must never reach the browser console in production. Gate debug output to dev.
const debugLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info(...args);
};

export const StablezactPaymentComponent = (props: IStablezactPaymentComponentProps) => {
  const { payment, paymentPageProps } = props;
  const { data } = payment;
  const bookingSuccessRedirect = useBookingSuccessRedirect();
  const searchParams = useCompatSearchParams();
  const { t } = useLocale();
  const stablezactInstanceRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasOpened, setHasOpened] = useState(false); // Prevent reopening
  const [isProcessing, setIsProcessing] = useState(false); // Track payment processing
  const [isCancelled, setIsCancelled] = useState(false); // Track if user cancelled payment

  // Parse data early so we can use it in hooks
  const parsedData = PaymentStablezactDataSchema.safeParse(data);
  const paymentData = parsedData.success ? parsedData.data : null;
  const paymentInfo = paymentData?.payment;

  // Get credentials from payment data (stored when payment was created)
  const credentials = paymentData?.credentials || null;

  // API URL is hardcoded - users don't provide it
  const apiUrl = process.env.NEXT_PUBLIC_STABLEZACT_API_URL || "https://hub.stablezact.com";

  // Payment configuration for SDK (memoized to prevent re-renders)
  const paymentConfig = useMemo(() => {
    if (!paymentInfo) return null;

    debugLog("[Stablezact] Payment configuration:", {
      amount: paymentInfo.amount,
      network: paymentInfo.network,
      currency: paymentInfo.currency,
      merchantWallet: paymentInfo.merchantWallet,
      bookingId: paymentPageProps.booking.id,
      bookingUid: paymentPageProps.booking.uid,
      paymentDbId: paymentInfo.id,
    });

    return {
      amount: paymentInfo.amount,
      customerEmail: paymentPageProps.booking.attendees?.[0]?.email || "guest@calcom.com",
      merchantName: paymentPageProps.profile.name || "Cal.com Event",
      preferredNetwork: paymentInfo.network.toLowerCase(),
      preferredCurrency: paymentInfo.currency.toUpperCase(),
      // Server-to-server status callback. Frontend confirmation (onSuccess → confirm-payment)
      // is the primary path; this points async callbacks at our own signed webhook endpoint
      // rather than a placeholder domain so booking metadata is never sent to a third party.
      callbackUrl: `${WEBAPP_URL}/api/integrations/stablezact/webhook`,
      metadata: {
        bookingId: paymentPageProps.booking.id,
        bookingUid: paymentPageProps.booking.uid,
        eventTypeId: paymentPageProps.eventType.id,
        paymentId: paymentInfo.id,
        source: "calcom",
        // Merchant wallet is determined by backend based on API key/secret
        merchantWallet: paymentInfo.merchantWallet,
      },
    };
  }, [paymentInfo, paymentPageProps]);

  // Handle successful payment - update booking directly like WooCommerce does
  const handlePaymentSuccess = useCallback(
    async (paymentId: unknown, transactionHash?: unknown, paymentDetails?: unknown) => {
      debugLog("[Stablezact] ✅ Payment successful - Raw callback data:", {
        paymentId,
        paymentIdType: typeof paymentId,
        transactionHash,
        paymentDetails,
      });

      // Prevent multiple processing
      if (isProcessing) {
        debugLog("[Stablezact] ⚠️ Already processing payment, skipping duplicate call");
        return;
      }
      setIsProcessing(true);

      // Close the modal immediately
      const instance = stablezactInstanceRef.current as { close?: () => void } | null;
      if (instance && instance.close) {
        debugLog("[Stablezact] Closing modal...");
        instance.close();
      }

      showToast(t("stablezact_payment_confirming"), "success");

      try {
        // Extract paymentId from object if needed
        let actualPaymentId: string;
        if (typeof paymentId === "object" && paymentId !== null) {
          // Try common property names
          if ("id" in paymentId) {
            actualPaymentId = (paymentId as { id: string }).id;
          } else if ("paymentId" in paymentId) {
            actualPaymentId = (paymentId as { paymentId: string }).paymentId;
          } else {
            // Fallback: stringify the object
            actualPaymentId = JSON.stringify(paymentId);
            console.warn("[Stablezact] paymentId is an object without 'id' property:", paymentId);
          }
        } else {
          actualPaymentId = String(paymentId);
        }

        debugLog("[Stablezact] Updating booking directly with payment info:", {
          bookingId: paymentPageProps.booking.id,
          paymentId: actualPaymentId,
          transactionHash,
        });

        // Update booking directly via API (like WooCommerce does with AJAX)
        const response = await fetch(`/api/integrations/stablezact/confirm-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId: paymentPageProps.booking.id,
            bookingUid: paymentPageProps.booking.uid,
            paymentId: actualPaymentId,
            transactionHash: transactionHash || "manual_confirmation",
            paymentDetails,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to confirm payment: ${response.statusText}`);
        }

        const result = await response.json();
        debugLog("[Stablezact] ✅ Booking updated successfully:", result);

        showToast(t("stablezact_booking_confirmed_redirecting"), "success");

        const params: {
          uid: string;
          email: string | null;
          location: string;
        } = {
          uid: paymentPageProps.booking.uid,
          email: searchParams?.get("email") || null,
          location: t("web_conferencing_details_to_follow"),
        };

        // Redirect to success page. Shape the booking to SuccessRedirectBookingType
        // the same way the other payment apps (e.g. btcpayserver) do: Date-typed
        // times and a non-null user carrying email.
        setTimeout(() => {
          bookingSuccessRedirect({
            successRedirectUrl: paymentPageProps.eventType.successRedirectUrl ?? null,
            query: params,
            booking: {
              ...paymentPageProps.booking,
              startTime: new Date(paymentPageProps.booking.startTime),
              endTime: new Date(paymentPageProps.booking.endTime),
              user: paymentPageProps.booking.user
                ? { ...paymentPageProps.booking.user, email: null }
                : { email: null, name: null },
              responses: undefined,
              attendees: undefined,
              location: paymentPageProps.booking.location ?? null,
              description: paymentPageProps.booking.description ?? null,
            },
            forwardParamsSuccessRedirect: paymentPageProps.eventType.forwardParamsSuccessRedirect ?? null,
          });
        }, 1000);
      } catch (error) {
        console.error("[Stablezact] ❌ Error confirming payment:", error);
        showToast(t("stablezact_confirmation_failed"), "error");
        setIsProcessing(false);
      }
    },
    [paymentPageProps, searchParams, t, bookingSuccessRedirect, isProcessing]
  );

  // Handle payment errors
  const handlePaymentError = useCallback(
    (error: string) => {
      console.error("[Stablezact] ❌ Payment error:", error);
      showToast(error || t("stablezact_payment_failed"), "error");
    },
    [t]
  );

  // Handle payment modal close
  const handlePaymentClose = useCallback(() => {
    debugLog("[Stablezact] ℹ️ Payment modal closed");
    // Only set cancelled if not processing (user manually closed)
    if (!isProcessing) {
      setIsCancelled(true);
    }
  }, [isProcessing]);

  // Handle retry payment
  const handleRetryPayment = useCallback(() => {
    debugLog("[Stablezact] 🔄 Retrying payment...");

    // Close old modal if exists (but don't destroy - SDK might not support it)
    const oldInstance = stablezactInstanceRef.current as { close?: () => void } | null;
    if (oldInstance && typeof oldInstance.close === "function") {
      try {
        oldInstance.close();
      } catch (e) {
        debugLog("[Stablezact] Error closing old modal:", e);
      }
    }

    // Clear instance ref so useEffect creates a new one
    stablezactInstanceRef.current = null;

    // Reset states - this will trigger the useEffect to reinitialize
    // Since CoinleyVanilla persists on window, it will be reused without reloading script
    setIsCancelled(false);
    setHasOpened(false);
    setIsInitialized(false);
  }, []);

  // Helper function to initialize SDK and open modal
  const initializeAndOpen = useCallback(() => {
    if (typeof window === "undefined" || !("CoinleyVanilla" in window) || !credentials || !paymentConfig) {
      return false;
    }

    try {
      const CoinleyVanillaConstructor = (
        window as unknown as { CoinleyVanilla: new (...args: unknown[]) => unknown }
      ).CoinleyVanilla;
      stablezactInstanceRef.current = new CoinleyVanillaConstructor({
        publicKey: credentials.public_key,
        apiUrl: apiUrl,
        theme: "light",
        debug: process.env.NODE_ENV !== "production",
      });

      debugLog("[Stablezact] SDK initialized, opening modal...");

      // Open payment modal
      const instance = stablezactInstanceRef.current as {
        open: (config: unknown, callbacks: unknown) => void;
      };
      instance.open(paymentConfig, {
        onSuccess: handlePaymentSuccess,
        onError: handlePaymentError,
        onClose: handlePaymentClose,
      });
      setIsInitialized(true);
      setHasOpened(true);

      debugLog("[Stablezact] Modal opened successfully");
      return true;
    } catch (error) {
      console.error("[Stablezact] Failed to initialize:", error);
      showToast(t("stablezact_gateway_load_failed"), "error");
      return false;
    }
  }, [credentials, apiUrl, paymentConfig, handlePaymentSuccess, handlePaymentError, handlePaymentClose, t]);

  // Load Stablezact CDN script and initialize (moved to top level before conditional returns)
  useEffect(() => {
    // Only initialize if we have all required data and haven't already opened
    if (!credentials || !credentials.public_key || !paymentConfig || hasOpened || isProcessing) {
      return;
    }

    // Skip if we already have an active instance
    if (stablezactInstanceRef.current) {
      debugLog("[Stablezact] Already have active instance, skipping");
      return;
    }

    // Check if CoinleyVanilla is already on window (from previous load or retry)
    if (typeof window !== "undefined" && "CoinleyVanilla" in window) {
      debugLog("[Stablezact] CoinleyVanilla already available, reusing...");
      initializeAndOpen();
      return;
    }

    // A script tag already exists (a concurrent mount or an earlier attempt).
    // Attach handlers so we still initialise once it loads, and clear it on error
    // so a retry can start fresh instead of getting stuck on "already loading".
    const existingScript = document.getElementById("stablezact-sdk-script");
    if (existingScript) {
      debugLog("[Stablezact] Script tag present, waiting for it to load...");
      const onExistingLoad = () => initializeAndOpen();
      const onExistingError = () => {
        existingScript.remove();
        showToast(t("stablezact_gateway_load_failed"), "error");
      };
      existingScript.addEventListener("load", onExistingLoad);
      existingScript.addEventListener("error", onExistingError);
      return () => {
        existingScript.removeEventListener("load", onExistingLoad);
        existingScript.removeEventListener("error", onExistingError);
      };
    }

    debugLog("[Stablezact] Loading SDK from CDN...");

    // Load CSS first if not already present
    const existingLink = document.getElementById("stablezact-sdk-styles");
    if (!existingLink) {
      const link = document.createElement("link");
      link.id = "stablezact-sdk-styles";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/stablezact-pay@0.66.0/dist/style.css";
      document.head.appendChild(link);
    }

    // The SDK leaves an empty, full-viewport #coinley-payment-container at a high z-index
    // that swallows every click, making the payment modal uninteractive. Let clicks fall
    // through to the modal beneath it while the container is empty.
    if (!document.getElementById("stablezact-sdk-overlay-fix")) {
      const overlayFix = document.createElement("style");
      overlayFix.id = "stablezact-sdk-overlay-fix";
      overlayFix.textContent = "#coinley-payment-container:empty{pointer-events:none !important;}";
      document.head.appendChild(overlayFix);
    }

    // Load the Stablezact CDN script.
    // Use the self-contained vanilla build (exposes the global `CoinleyVanilla`).
    // The package's index.umd.js is the React build and externalizes React, so it
    // cannot be used with the `new CoinleyVanilla()` integration below.
    const script = document.createElement("script");
    script.id = "stablezact-sdk-script";
    script.src = "https://unpkg.com/stablezact-pay@0.66.0/dist/coinley-vanilla.min.js";
    script.async = true;
    script.onload = () => {
      debugLog("[Stablezact] SDK loaded successfully");
      initializeAndOpen();
    };
    script.onerror = () => {
      console.error("[Stablezact] Failed to load CDN script");
      script.remove(); // allow a retry to re-add the script
      showToast(t("stablezact_gateway_load_failed"), "error");
    };

    document.head.appendChild(script);
    // NOTE: the modal is closed on unmount by the dedicated effect below — never in
    // this effect's cleanup. Opening the modal flips hasOpened (a dependency here);
    // closing on every dep change would tear the modal down right after it opens.
  }, [credentials, paymentConfig, hasOpened, isProcessing, initializeAndOpen, t]);

  // Close the SDK modal only when the component unmounts.
  useEffect(() => {
    return () => {
      const instance = stablezactInstanceRef.current as { close?: () => void } | null;
      instance?.close?.();
      stablezactInstanceRef.current = null;
    };
  }, []);

  // Handle data validation errors
  if (!parsedData.success || !parsedData.data?.payment?.id) {
    console.error(
      "[Stablezact] Failed to parse payment data:",
      !parsedData.success ? parsedData.error : "Missing payment ID"
    );
    return (
      <>
        <p className="mt-3 text-center">{t("stablezact_payment_data_error")}</p>
      </>
    );
  }

  if (!credentials || !credentials.public_key) {
    console.error("[Stablezact] Missing public key");
    return (
      <>
        <p className="mt-3 text-center text-red-600">{t("stablezact_gateway_not_configured")}</p>
      </>
    );
  }

  return (
    <div className="mb-4 mt-8 flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div>
          <h3 className="text-lg font-semibold mb-2">{t("stablezact_complete_payment")}</h3>
          <p className="text-sm text-gray-600">
            {t("pay")} {paymentInfo?.amount} {paymentInfo?.currency}
          </p>
        </div>

        {/* Container for Stablezact payment UI */}
        <div ref={containerRef} id="stablezact-payment-container">
          {!isInitialized && !isProcessing && !isCancelled && (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              <p className="ml-3 text-sm text-gray-600">{t("stablezact_loading_gateway")}</p>
            </div>
          )}
          {isProcessing && (
            <div className="flex flex-col items-center justify-center p-8">
              <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
              <p className="mt-3 text-sm text-green-600">{t("stablezact_processing_payment")}</p>
            </div>
          )}
          {isCancelled && (
            <div className="flex flex-col items-center justify-center p-8">
              <p className="text-sm text-gray-600 mb-4">{t("stablezact_payment_cancelled")}</p>
              <button
                onClick={handleRetryPayment}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                {t("try_again")}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">{t("stablezact_supported_tokens_networks")}</p>

        <div className="text-xs text-gray-400">{t("stablezact_powered_by")}</div>
      </div>
    </div>
  );
};

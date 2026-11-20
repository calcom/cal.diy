"use client";

import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { getSuccessPageLocationMessage } from "@calcom/app-store/locations";
import dayjs from "@calcom/dayjs";
import { sdkActionManager, useIsEmbed } from "@calcom/embed-core/embed-iframe";
import { PayIcon } from "@calcom/features/bookings/components/event-meta/PayIcon";
import { Price } from "@calcom/features/bookings/components/event-meta/Price";
import { APP_NAME, WEBSITE_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useTheme from "@calcom/lib/hooks/useTheme";
import { getIs24hClockFromLocalStorage, isBrowserLocale24h } from "@calcom/lib/timeFormat";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";
import { localStorage } from "@calcom/lib/webstorage";
import classNames from "classnames";
import dynamic from "next/dynamic";
import type { FC } from "react";
import { useEffect, useState } from "react";

type PaymentPageProps = {
  payment: {
    id: number;
    success: boolean;
    refunded: boolean;
    amount: number;
    currency: string;
    paymentOption: string | null;
    data: Record<string, unknown>;
    appId?: string | null;
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
  profile: { theme?: string | null; hideBranding?: boolean };
  user?: { name?: string | null; username?: string | null } | null;
};

const PaypalPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/paypal/PaypalPaymentComponent").then((m) => m.PaypalPaymentComponent),
  {
    ssr: false,
  }
);

const AlbyPaymentComponent = dynamic(
  () => import("@calcom/web/components/apps/alby/AlbyPaymentComponent").then((m) => m.AlbyPaymentComponent),
  {
    ssr: false,
  }
);

const HitpayPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/hitpay/HitpayPaymentComponent").then((m) => m.HitpayPaymentComponent),
  {
    ssr: false,
  }
);

const BtcpayPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/btcpayserver/BtcpayPaymentComponent").then(
      (m) => m.BtcpayPaymentComponent
    ),
  {
    ssr: false,
  }
);

const StablezactPaymentComponent = dynamic(
  () =>
    import("@calcom/web/components/apps/stablezact/StablezactPaymentComponent").then(
      (m) => m.StablezactPaymentComponent
    ),
  {
    ssr: false,
  }
);

const PaymentPage: FC<PaymentPageProps> = (props) => {
  const { t, i18n } = useLocale();
  const [is24h, setIs24h] = useState(isBrowserLocale24h());
  const [date, setDate] = useState(dayjs.utc(props.booking.startTime));
  const [timezone, setTimezone] = useState<string | null>(null);
  useTheme(props.profile.theme);
  const isEmbed = useIsEmbed();
  const paymentAppData = getPaymentAppData(props.eventType);
  useEffect(() => {
    let embedIframeWidth = 0;
    const _timezone = localStorage.getItem("timeOption.preferredTimeZone") || CURRENT_TIMEZONE;
    setTimezone(_timezone);
    setDate(date.tz(_timezone));
    setIs24h(!!getIs24hClockFromLocalStorage());
    if (isEmbed) {
      requestAnimationFrame(function fixStripeIframe() {
        // HACK: Look for stripe iframe and center position it just above the embed content
        const stripeIframeWrapper = document.querySelector(
          'iframe[src*="https://js.stripe.com/v3/authorize-with-url-inner"]'
        )?.parentElement;
        if (stripeIframeWrapper) {
          stripeIframeWrapper.style.margin = "0 auto";
          stripeIframeWrapper.style.width = `${embedIframeWidth}px`;
        }
        requestAnimationFrame(fixStripeIframe);
      });
      sdkActionManager?.on("__dimensionChanged", (e) => {
        embedIframeWidth = e.detail.data.iframeWidth as number;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbed, date.tz]);

  const eventName = props.booking.title;

  return (
    <div className="h-screen">
      <main className="mx-auto max-w-3xl py-24">
        <div className="fixed inset-0 z-50 overflow-y-auto scroll-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="inset-0 my-4 transition-opacity sm:my-0" aria-hidden="true">
              <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">
                &#8203;
              </span>
              <div
                className={classNames(
                  "main inline-block transform overflow-hidden rounded-lg border border-subtle bg-default px-8 pt-5 pb-4 text-left align-bottom transition-all sm:w-full sm:max-w-lg sm:py-6 sm:align-middle",
                  isEmbed ? "" : "sm:my-8"
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-headline">
                <div>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cal-success">
                    <PayIcon currency={paymentAppData.currency} className="h-8 w-8 text-green-600" />
                  </div>

                  <div className="mt-3 text-center sm:mt-5">
                    <h3 className="font-semibold text-2xl text-emphasis leading-6" id="modal-headline">
                      {paymentAppData.paymentOption === "HOLD" ? t("complete_your_booking") : t("payment")}
                    </h3>
                    <div className="mt-4 grid grid-cols-3 border-t border-b py-4 text-left text-default dark:border-gray-900 dark:text-gray-300">
                      <div className="font-medium">{t("what")}</div>
                      <div className="col-span-2 mb-6">{eventName}</div>
                      <div className="font-medium">{t("when")}</div>
                      <div className="col-span-2 mb-6">
                        {date.locale(i18n.language ?? "en").format("dddd, DD MMMM YYYY")}
                        <br />
                        {date.format(is24h ? "H:mm" : "h:mma")} - {props.eventType.length} mins{" "}
                        <span className="text-subtle">({timezone})</span>
                      </div>
                      {props.booking.location && (
                        <>
                          <div className="font-medium">{t("where")}</div>
                          <div className="col-span-2 mb-6">
                            {getSuccessPageLocationMessage(props.booking.location, t)}
                          </div>
                        </>
                      )}
                      <div className="font-medium">
                        {props.payment.paymentOption === "HOLD" ? t("no_show_fee") : t("price")}
                      </div>
                      <div className="col-span-2 mb-6 font-semibold">
                        <Price
                          currency={paymentAppData.currency}
                          price={props.payment?.amount ?? paymentAppData.price}
                          displayAlternateSymbol={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  {props.payment.success && !props.payment.refunded && (
                    <div className="mt-4 text-center text-default dark:text-gray-300">{t("paid")}</div>
                  )}
                  {props.payment.appId === "stripe" && !props.payment.success && (
                    <div>{/* StripePaymentComponent removed */}</div>
                  )}
                  {props.payment.appId === "paypal" && !props.payment.success && (
                    <PaypalPaymentComponent payment={props.payment} />
                  )}
                  {props.payment.appId === "alby" && !props.payment.success && (
                    <AlbyPaymentComponent payment={props.payment} paymentPageProps={props} />
                  )}
                  {props.payment.appId === "hitpay" && !props.payment.success && (
                    <HitpayPaymentComponent payment={props.payment} />
                  )}
                  {props.payment.appId === "btcpayserver" && !props.payment.success && (
                    <BtcpayPaymentComponent payment={props.payment} paymentPageProps={props} />
                  )}
                  {props.payment.appId === "stablezact" && !props.payment.success && (
                    <StablezactPaymentComponent payment={props.payment} paymentPageProps={props} />
                  )}
                  {props.payment.refunded && (
                    <div className="mt-4 text-center text-default dark:text-gray-300">{t("refunded")}</div>
                  )}
                </div>
                {!props.profile.hideBranding && (
                  <div className="mt-4 border-t pt-4 text-center text-muted text-xs dark:border-gray-900 dark:text-inverted">
                    <a href={`${WEBSITE_URL}/signup`}>
                      {t("create_booking_link_with_calcom", { appName: APP_NAME })}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PaymentPage;

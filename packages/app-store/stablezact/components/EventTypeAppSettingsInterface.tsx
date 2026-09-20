import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Select, TextField } from "@calcom/ui/components/form";
import { useEffect } from "react";

const paymentOptions = [
  { label: "on_booking_paid", value: "ON_BOOKING" },
  { label: "hold_charge_card_on_booking_and_charge_on_event", value: "HOLD" },
];

type Option = { value: string; label: string };

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  eventType,
}) => {
  const price = getAppData("price");
  const paymentOption = getAppData("paymentOption");
  const paymentOptionSelectValue = paymentOptions?.find((option) => paymentOption === option.value) || {
    label: paymentOptions[0].label,
    value: paymentOptions[0].value,
  };
  const seatsEnabled = !!eventType.seatsPerTimeSlot;
  // Read enabled state directly from app data so it stays in sync
  const requirePayment = getAppData("enabled");
  const { t } = useLocale();
  const recurringEventDefined = eventType.recurringEvent?.count !== undefined;

  useEffect(() => {
    if (requirePayment) {
      // Currency is selected by user in payment modal (USDT or USDC)
      if (!getAppData("paymentOption")) {
        setAppData("paymentOption", "ON_BOOKING");
      }
    }
  }, [requirePayment, getAppData, setAppData]);

  if (recurringEventDefined) {
    return <Alert className="mt-2" severity="warning" title={t("warning_recurring_event_payment")} />;
  }

  if (!requirePayment) {
    return null;
  }

  return (
    <>
      <div className="mt-2 block items-center sm:flex">
        <TextField
          label={t("price")}
          labelSrOnly
          addOnLeading="$"
          addOnSuffix="USD"
          step="0.01"
          min="0.01"
          type="number"
          required
          className="block w-full rounded-sm pl-2 text-sm"
          placeholder={t("price")}
          data-testid="stablezact-price-input"
          onChange={(e) => {
            const value = Number(e.target.value);
            // Store price in cents for consistency with other payment apps.
            // Clamp to >= 0 — min="0.01" only affects HTML validity, not typed input.
            setAppData("price", Math.max(0, Math.round(value * 100)));
          }}
          value={price > 0 ? price / 100 : undefined}
        />
      </div>
      <p className="text-default mt-1 text-xs text-gray-500">{t("stablezact_currency_selection_info")}</p>

      <div className="mt-4 w-60">
        <label className="text-default mb-1 block text-sm font-medium" htmlFor="payment-option">
          {t("payment_option")}
        </label>
        <Select<Option>
          inputId="payment-option"
          data-testid="stablezact-payment-option-select"
          defaultValue={
            paymentOptionSelectValue
              ? { ...paymentOptionSelectValue, label: t(paymentOptionSelectValue.label) }
              : { ...paymentOptions[0], label: t(paymentOptions[0].label) }
          }
          options={paymentOptions.map((option) => {
            return { ...option, label: t(option.label) || option.label };
          })}
          onChange={(input) => {
            if (input) setAppData("paymentOption", input.value);
          }}
          className="mb-1 h-[38px] w-full"
          isDisabled={seatsEnabled}
        />
      </div>
      {seatsEnabled && paymentOption === "HOLD" && (
        <Alert className="mt-2" severity="warning" title={t("seats_and_no_show_fee_error")} />
      )}

      <div className="mt-4">
        <Alert
          className="mt-2"
          severity="info"
          title={t("stablezact_supported_cryptocurrencies")}
          message={
            <div className="space-y-2 text-sm">
              <p>
                <strong>{t("stablezact_stablecoins")}:</strong> USDT, USDC
              </p>
              <p>
                <strong>{t("stablezact_networks")}:</strong> Ethereum, BSC, Polygon, Arbitrum, Optimism,
                Avalanche, Celo, Base
              </p>
              <p className="mt-2 text-xs text-gray-600">{t("stablezact_payment_info")}</p>
            </div>
          }
        />
      </div>
    </>
  );
};

export default EventTypeAppSettingsInterface;

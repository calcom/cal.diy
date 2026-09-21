import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import {
  convertFromSmallestToPresentableCurrencyUnit,
  convertToSmallestCurrencyUnit,
} from "@calcom/lib/currencyConversions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Alert } from "@calcom/ui/components/alert";
import { Select, TextField } from "@calcom/ui/components/form";
import { useEffect, useState } from "react";
import { currencyOptions, paymentOptions } from "./constants";

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
  eventType,
}) => {
  const price = getAppData("price");
  const currency = getAppData("currency") || currencyOptions[0].value;
  const [selectedCurrency, setSelectedCurrency] = useState(
    currencyOptions.find((c) => c.value === currency) || {
      label: currencyOptions[0].label,
      value: currencyOptions[0].value,
    }
  );
  const paymentOption = getAppData("paymentOption");
  const requirePayment = getAppData("enabled");

  const { t } = useLocale();
  const recurringEventDefined = eventType.recurringEvent?.count !== undefined;
  const seatsEnabled = !!eventType.seatsPerTimeSlot;
  const getCurrencySymbol = (locale: string, currency: string) =>
    (0)
      .toLocaleString(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
      .replace(/\d/g, "")
      .trim();

  useEffect(() => {
    if (requirePayment) {
      if (!getAppData("currency")) {
        setAppData("currency", currencyOptions[0].value);
      }
      if (!getAppData("paymentOption")) {
        setAppData("paymentOption", paymentOptions[0].value);
      }
    }
  }, [requirePayment, getAppData, setAppData]);

  const disableDecimalPlace = (value: number) => {
    const nValue = Math.floor(value);
    const sValue = nValue.toString();
    const ret = parseInt(sValue);
    return ret;
  };

  return (
    <>
      {recurringEventDefined && (
        <Alert className="mt-2" severity="warning" title={t("warning_recurring_event_payment")} />
      )}
      {!recurringEventDefined && requirePayment && (
        <>
          <div className="mt-4 block items-center justify-start sm:flex sm:space-x-2">
            <TextField
              data-testid="stripe-price-input"
              label={t("price")}
              className="h-[38px]"
              addOnLeading={
                <>{selectedCurrency.value ? getCurrencySymbol("en", selectedCurrency.value) : ""}</>
              }
              addOnSuffix={currency.toUpperCase()}
              addOnClassname="h-[38px]"
              step="1"
              min="1"
              type="number"
              required
              placeholder="Price"
              disabled={disabled}
              onChange={(e) => {
                setAppData("price", convertToSmallestCurrencyUnit(Number(e.target.value), currency));
              }}
              value={
                price > 0
                  ? disableDecimalPlace(convertFromSmallestToPresentableCurrencyUnit(price, currency))
                  : undefined
              }
            />
          </div>
          <div className="mt-5 w-60">
            <label className="text-default mb-1 block text-sm font-medium" htmlFor="currency">
              {t("currency")}
            </label>
            <Select
              data-testid="stripe-currency-select"
              variant="default"
              options={currencyOptions}
              value={selectedCurrency}
              className="text-black"
              defaultValue={selectedCurrency}
              onChange={(e) => {
                if (e) {
                  setSelectedCurrency(e);
                  setAppData("currency", e.value);
                }
              }}
            />
          </div>
          {seatsEnabled && paymentOption === "HOLD" && (
            <Alert className="mt-2" severity="warning" title={t("seats_and_no_show_fee_error")} />
          )}
        </>
      )}
    </>
  );
};

export default EventTypeAppSettingsInterface;

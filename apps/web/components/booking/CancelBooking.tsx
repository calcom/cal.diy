"use client";

import { sdkActionManager } from "@calcom/embed-core/embed-iframe";
import { isCancellationReasonRequired } from "@calcom/features/bookings/lib/cancellationReason";
import { shouldChargeNoShowCancellationFee } from "@calcom/features/bookings/lib/payment/shouldChargeNoShowCancellationFee";
import { convertFromSmallestToPresentableCurrencyUnit } from "@calcom/lib/currencyConversions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useRefreshData } from "@calcom/lib/hooks/useRefreshData";
import type { CancellationReasonRequirement } from "@calcom/prisma/enums";
import type { RecurringEvent } from "@calcom/types/Calendar";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { CheckboxField, Label, Select, TextArea } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { InfoIcon, XIcon } from "@coss/ui/icons";
import { useCallback, useState } from "react";

interface InternalNotePresetsSelectProps {
  internalNotePresets: { id: number; name: string }[];
  onPresetSelect: (
    option: {
      value: number | string;
      label: string;
    } | null
  ) => void;
  setCancellationReason: (reason: string) => void;
}

const InternalNotePresetsSelect = ({
  internalNotePresets,
  onPresetSelect,
  setCancellationReason,
}: InternalNotePresetsSelectProps) => {
  const { t } = useLocale();
  const [showOtherInput, setShowOtherInput] = useState(false);

  if (!internalNotePresets?.length) {
    return null;
  }

  const handleSelectChange = (option: { value: number | string; label: string } | null) => {
    if (option?.value === "other") {
      setShowOtherInput(true);
      setCancellationReason("");
    } else {
      setShowOtherInput(false);
      onPresetSelect?.(option);
    }
  };

  return (
    <div className="mb-4 flex flex-col">
      <Label>{t("internal_booking_note")}</Label>
      <Select
        className="mb-2"
        options={[
          ...internalNotePresets.map((preset) => ({
            label: preset.name,
            value: preset.id,
          })),
          { label: t("other"), value: "other" },
        ]}
        onChange={handleSelectChange}
        placeholder={t("internal_booking_note")}
      />
      {showOtherInput && (
        <TextArea
          rows={3}
          placeholder={t("internal_booking_note_description")}
          onChange={(e) => onPresetSelect?.({ value: "other", label: e.target.value })}
        />
      )}
    </div>
  );
};

type Props = {
  booking: {
    title?: string;
    uid?: string;
    id?: number;
    startTime: Date;
    payment?: {
      amount: number;
      currency: string;
      appId: string | null;
    } | null;
  };
  profile: {
    name: string | null;
    slug: string | null;
  };
  recurringEvent: RecurringEvent | null;
  team?: string | null;
  teamId?: number;
  setIsCancellationMode: (value: boolean) => void;
  theme: string | null;
  allRemainingBookings: boolean;
  seatReferenceUid?: string;
  currentUserEmail?: string;
  bookingCancelledEventProps: {
    booking: unknown;
    organizer: {
      name: string;
      email: string;
      timeZone?: string;
    };
    eventType: unknown;
  };
  isHost: boolean;
  internalNotePresets: { id: number; name: string; cancellationReason: string | null }[];
  renderContext: "booking-single-view" | "dialog";
  eventTypeMetadata?: Record<string, unknown> | null;
  requiresCancellationReason?: CancellationReasonRequirement | null;
  showErrorAsToast?: boolean;
  onCanceled?: () => void;
};

export default function CancelBooking(props: Props) {
  const [cancellationReason, setCancellationReason] = useState<string>("");
  const { t } = useLocale();
  const refreshData = useRefreshData();
  const {
    booking,
    allRemainingBookings,
    seatReferenceUid,
    bookingCancelledEventProps,
    currentUserEmail,
    eventTypeMetadata,
  } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(booking ? null : t("booking_already_cancelled"));
  const [internalNote, setInternalNote] = useState<{ id: number; name: string } | null>(null);
  const [acknowledgeCancellationNoShowFee, setAcknowledgeCancellationNoShowFee] = useState(false);

  const getAppMetadata = (appId: string): Record<string, unknown> | null => {
    if (!eventTypeMetadata?.apps || !appId) return null;
    const apps = eventTypeMetadata.apps as Record<string, unknown>;
    return (apps[appId] as Record<string, unknown>) || null;
  };

  const timeValue = booking?.payment?.appId
    ? (getAppMetadata(booking.payment.appId) as Record<string, unknown> | null)?.autoChargeNoShowFeeTimeValue
    : null;
  const timeUnit = booking?.payment?.appId
    ? (getAppMetadata(booking.payment.appId) as Record<string, unknown> | null)?.autoChargeNoShowFeeTimeUnit
    : null;

  const autoChargeNoShowFee = () => {
    if (props.isHost) return false; // Hosts/organizers are exempt

    if (!booking?.startTime) return false;

    if (!booking?.payment) return false;

    return shouldChargeNoShowCancellationFee({
      eventTypeMetadata: eventTypeMetadata || null,
      booking,
      payment: booking.payment,
    });
  };

  const cancellationNoShowFeeWarning = autoChargeNoShowFee();

  const isCancellationUserHost =
    props.isHost || bookingCancelledEventProps.organizer.email === currentUserEmail;

  const isReasonRequired = isCancellationReasonRequired(
    props.requiresCancellationReason,
    isCancellationUserHost
  );

  const missingRequiredReason = isReasonRequired && !cancellationReason?.trim();
  const hostMissingInternalNote =
    isCancellationUserHost && props.internalNotePresets.length > 0 && !internalNote?.id;
  const cancellationNoShowFeeNotAcknowledged =
    !props.isHost && cancellationNoShowFeeWarning && !acknowledgeCancellationNoShowFee;
  const canCancel =
    !missingRequiredReason && !hostMissingInternalNote && !cancellationNoShowFeeNotAcknowledged;
  const cancelBookingRef = useCallback((node: HTMLTextAreaElement) => {
    if (node !== null) {
      // eslint-disable-next-line @calcom/eslint/no-scroll-into-view-embed -- CancelBooking is not usually used in embed mode
      node.scrollIntoView({ behavior: "smooth" });
      node.focus();
    }
  }, []);

  const isRenderedAsCancelDialog = props.renderContext === "dialog";

  return (
    <>
      {error && !props.showErrorAsToast && (
        <div className="mt-8">
          <div className="bg-error mx-auto flex h-12 w-12 items-center justify-center rounded-full">
            <XIcon className="h-6 w-6 text-red-600" />
          </div>
          <div className="mt-3 text-center sm:mt-5">
            <h3 className="text-emphasis text-lg font-medium leading-6" id="modal-title">
              {error}
            </h3>
          </div>
        </div>
      )}
      {!error && (
        <div className={classNames(isRenderedAsCancelDialog ? "-mt-2 mb-8" : "mt-5 sm:mt-6")}>
          {props.isHost && props.internalNotePresets.length > 0 && (
            <>
              <InternalNotePresetsSelect
                internalNotePresets={props.internalNotePresets}
                setCancellationReason={setCancellationReason}
                onPresetSelect={(option) => {
                  if (!option) return;

                  if (option.value === "other") {
                    setInternalNote({ id: -1, name: option.label });
                  } else {
                    const foundInternalNote = props.internalNotePresets.find(
                      (preset) => preset.id === Number(option.value)
                    );
                    if (foundInternalNote) {
                      setInternalNote(foundInternalNote);
                      setCancellationReason(foundInternalNote.cancellationReason || "");
                    }
                  }
                }}
              />
            </>
          )}

          <Label>{t(isReasonRequired ? "cancellation_reason" : "cancellation_reason_optional_label")}</Label>

          <TextArea
            data-testid="cancel_reason"
            ref={cancelBookingRef}
            placeholder={t("cancellation_reason_placeholder")}
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            className={classNames("mb-4 w-full", !isRenderedAsCancelDialog && "mt-2")}
            rows={3}
          />
          {isCancellationUserHost ? (
            <div className="-mt-2 mb-4 flex items-center gap-2">
              <InfoIcon className="text-subtle h-4 w-4" />
              <p className="text-subtle text-sm leading-none">
                {t("notify_attendee_cancellation_reason_warning")}
              </p>
            </div>
          ) : null}
          {cancellationNoShowFeeWarning && booking?.payment && (
            <div>
              <div className="bg-attention mb-5 rounded-md p-3">
                <CheckboxField
                  description={t("cancel_booking_acknowledge_no_show_fee", {
                    timeValue,
                    timeUnit,
                    amount: convertFromSmallestToPresentableCurrencyUnit(
                      booking.payment.amount,
                      booking.payment.currency
                    ),
                    formatParams: { amount: { currency: booking.payment.currency } },
                  })}
                  onChange={(e) => setAcknowledgeCancellationNoShowFee(e.target.checked)}
                  descriptionClassName="text-info font-semibold"
                />
                <p className="text-subtle ml-9 mt-2 text-sm">{t("contact_organizer")}</p>
              </div>
            </div>
          )}
          <div className="flex flex-col-reverse rtl:space-x-reverse ">
            <div
              className={classNames(
                "ml-auto flex w-full space-x-4",
                isRenderedAsCancelDialog && "justify-end"
              )}>
              <Button
                className="ml-auto"
                color="secondary"
                onClick={() => props.setIsCancellationMode(false)}>
                {t("nevermind")}
              </Button>
              <Button
                data-testid="confirm_cancel"
                disabled={!canCancel}
                onClick={async () => {
                  setLoading(true);

                  const response = await fetch("/api/csrf?sameSite=none", { cache: "no-store" });
                  const { csrfToken } = await response.json();

                  const res = await fetch("/api/cancel", {
                    body: JSON.stringify({
                      uid: booking?.uid,
                      cancellationReason: cancellationReason,
                      allRemainingBookings,
                      // @NOTE: very important this shouldn't cancel with number ID use uid instead
                      seatReferenceUid,
                      cancelledBy: currentUserEmail,
                      internalNote: internalNote,
                      csrfToken,
                    }),
                    headers: {
                      "Content-Type": "application/json",
                    },
                    method: "POST",
                  });

                  const bookingWithCancellationReason = {
                    ...(bookingCancelledEventProps.booking as object),
                    cancellationReason,
                  } as unknown;

                  if (res.status >= 200 && res.status < 300) {
                    sdkActionManager?.fire("bookingCancelled", {
                      ...bookingCancelledEventProps,
                      booking: bookingWithCancellationReason,
                    });
                    refreshData();
                    if (props.onCanceled) {
                      props.onCanceled();
                    }
                  } else {
                    const data = await res.json();
                    setLoading(false);
                    const errorMessage =
                      data.message ||
                      `${t("error_with_status_code_occured", { status: res.status })} ${t(
                        "please_try_again"
                      )}`;

                    if (props.showErrorAsToast) {
                      showToast(errorMessage, "error");
                    } else {
                      setError(errorMessage);
                    }
                  }
                }}
                loading={loading}>
                {props.allRemainingBookings ? t("cancel_all_remaining") : t("cancel_event")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

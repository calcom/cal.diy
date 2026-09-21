import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { bookingMetadataSchema } from "@calcom/prisma/zod-utils";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@calcom/ui/components/dialog";
import {
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calcom/ui/components/dropdown";
import type { ActionType } from "@calcom/ui/components/table";
import { showToast } from "@calcom/ui/components/toast";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { AddGuestsDialog } from "@components/dialog/AddGuestsDialog";
import { CancelBookingDialog } from "@components/dialog/CancelBookingDialog";
import { ChargeCardDialog } from "@components/dialog/ChargeCardDialog";
import { EditLocationDialog } from "@components/dialog/EditLocationDialog";
import { ReassignDialog } from "@components/dialog/ReassignDialog";
import { RejectionReasonDialog } from "@components/dialog/RejectionReasonDialog";
import { ReportBookingDialog } from "@components/dialog/ReportBookingDialog";
import { RescheduleDialog } from "@components/dialog/RescheduleDialog";
import { WrongAssignmentDialog } from "@components/dialog/WrongAssignmentDialog";
import { ForceConfirmDialog } from "@components/dialog/ForceConfirmDialog";
import { useState } from "react";
import type { z } from "zod";
import { useBookingConfirmation } from "../hooks/useBookingConfirmation";
import type { BookingItemProps } from "../types";
import { useBookingActionsStoreContext } from "./BookingActionsStoreProvider";
import {
  type BookingActionContext,
  getAfterEventActions,
  getCancelEventAction,
  getEditEventActions,
  getPendingActions,
  getReportAction,
  shouldShowEditActions,
  shouldShowPendingActions,
} from "./bookingActions";

interface BookingActionsDropdownProps {
  booking: BookingItemProps;
  size?: "xs" | "sm" | "base" | "lg";
  className?: string;
  /**
   * Whether to use a portal for the dropdown menu.
   * Set to false when rendering inside a Sheet/Dialog to keep the dropdown within the modal's stacking context.
   * @default true
   */
  usePortal?: boolean;
  /**
   * Context where the dropdown is being used.
   * - "list": Used in booking list view (hides Confirm and Reject actions)
   * - "details": Used in booking details view (shows all actions)
   */
  context: "list" | "details";
}

export function BookingActionsDropdown({
  booking,
  size = "base",
  className,
  usePortal = true,
  context,
}: BookingActionsDropdownProps) {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const isRecurring = booking.recurringEventId !== null;
  const isTabRecurring = booking.listingStatus === "recurring";
  const isTabUnconfirmed = booking.listingStatus === "unconfirmed";

  // Use the booking confirmation hook for confirm/reject logic
  const {
    bookingConfirm,
    bookingForceConfirm,
    handleReject,
    rejectionDialogIsOpen,
    setRejectionDialogIsOpen,
    forceConfirmDialogIsOpen,
    setForceConfirmDialogIsOpen,
    isPending: isConfirmPending,
  } = useBookingConfirmation({
    isRecurring,
    isTabRecurring,
    isTabUnconfirmed,
  });

  // Use store for all other dialog states
  const chargeCardDialogIsOpen = useBookingActionsStoreContext((state) => state.chargeCardDialogIsOpen);
  const setChargeCardDialogIsOpen = useBookingActionsStoreContext((state) => state.setChargeCardDialogIsOpen);
  const viewRecordingsDialogIsOpen = useBookingActionsStoreContext(
    (state) => state.viewRecordingsDialogIsOpen
  );
  const setViewRecordingsDialogIsOpen = useBookingActionsStoreContext(
    (state) => state.setViewRecordingsDialogIsOpen
  );
  const meetingSessionDetailsDialogIsOpen = useBookingActionsStoreContext(
    (state) => state.meetingSessionDetailsDialogIsOpen
  );
  const setMeetingSessionDetailsDialogIsOpen = useBookingActionsStoreContext(
    (state) => state.setMeetingSessionDetailsDialogIsOpen
  );
  const isNoShowDialogOpen = useBookingActionsStoreContext((state) => state.isNoShowDialogOpen);
  const setIsNoShowDialogOpen = useBookingActionsStoreContext((state) => state.setIsNoShowDialogOpen);
  const isOpenRescheduleDialog = useBookingActionsStoreContext((state) => state.isOpenRescheduleDialog);
  const setIsOpenRescheduleDialog = useBookingActionsStoreContext((state) => state.setIsOpenRescheduleDialog);
  const isOpenReassignDialog = useBookingActionsStoreContext((state) => state.isOpenReassignDialog);
  const setIsOpenReassignDialog = useBookingActionsStoreContext((state) => state.setIsOpenReassignDialog);
  const isOpenSetLocationDialog = useBookingActionsStoreContext((state) => state.isOpenSetLocationDialog);
  const setIsOpenLocationDialog = useBookingActionsStoreContext((state) => state.setIsOpenLocationDialog);
  const isOpenAddGuestsDialog = useBookingActionsStoreContext((state) => state.isOpenAddGuestsDialog);
  const setIsOpenAddGuestsDialog = useBookingActionsStoreContext((state) => state.setIsOpenAddGuestsDialog);
  const isOpenReportDialog = useBookingActionsStoreContext((state) => state.isOpenReportDialog);
  const setIsOpenReportDialog = useBookingActionsStoreContext((state) => state.setIsOpenReportDialog);
  const isOpenWrongAssignmentDialog = useBookingActionsStoreContext(
    (state) => state.isOpenWrongAssignmentDialog
  );
  const setIsOpenWrongAssignmentDialog = useBookingActionsStoreContext(
    (state) => state.setIsOpenWrongAssignmentDialog
  );
  const isCancelDialogOpen = useBookingActionsStoreContext((state) => state.isCancelDialogOpen);
  const setIsCancelDialogOpen = useBookingActionsStoreContext((state) => state.setIsCancelDialogOpen);

  const cardCharged = booking?.payment[0]?.success;

  const attendeeList = booking.attendees.map((attendee) => {
    return {
      name: attendee.name,
      email: attendee.email,
      id: attendee.id,
      noShow: attendee.noShow || false,
      phoneNumber: attendee.phoneNumber,
    };
  });

  const noShowMutation = trpc.viewer.loggedInViewerRouter.markNoShow.useMutation({
    onSuccess: async (data) => {
      showToast(data.message, "success");
      await utils.viewer.bookings.invalidate();
    },
    onError: (err) => {
      showToast(err.message, "error");
    },
  });

  const setLocationMutation = trpc.viewer.bookings.editLocation.useMutation({
    onSuccess: () => {
      showToast(t("location_updated"), "success");
      setIsOpenLocationDialog(false);
      utils.viewer.bookings.invalidate();
    },
    onError: (e) => {
      const errorMessages: Record<string, string> = {
        UNAUTHORIZED: t("you_are_unauthorized_to_make_this_change_to_the_booking"),
        BAD_REQUEST: e.message,
      };

      const message = errorMessages[e.data?.code as string] || t("location_update_failed");
      showToast(message, "error");
    },
  });

  const isUpcoming = new Date(booking.endTime) >= new Date();
  const isOngoing = isUpcoming && new Date() >= new Date(booking.startTime);
  const isBookingInPast = new Date(booking.endTime) < new Date();
  const isCancelled = booking.status === "CANCELLED";
  const isConfirmed = booking.status === "ACCEPTED";
  const isRejected = booking.status === "REJECTED";
  const isPending = booking.status === "PENDING";
  const isRescheduled = booking.fromReschedule !== null;

  const getBookingStatus = (): "upcoming" | "past" | "cancelled" | "rejected" => {
    if (isCancelled) return "cancelled";
    if (isRejected) return "rejected";
    if (isBookingInPast) return "past";
    return "upcoming";
  };


  const userEmail = booking.loggedInUser.userEmail;
  const userSeat = booking.seatsReferences.find((seat) => !!userEmail && seat.attendee?.email === userEmail);
  const isAttendee = !!userSeat;

  // Check if the logged-in user is the host/owner of the booking
  const isHost = booking.loggedInUser.userId === booking.user?.id;

  const isCalVideoLocation =
    !booking.location ||
    booking.location === "integrations:daily" ||
    (typeof booking.location === "string" && booking.location.trim() === "");

  const isDisabledCancelling = booking.eventType.disableCancelling;
  const isDisabledRescheduling = booking.eventType.disableRescheduling;

  const getSeatReferenceUid = () => {
    return userSeat?.referenceUid;
  };

  const saveLocation = async ({
    newLocation,
    credentialId,
  }: {
    newLocation: string;
    credentialId: number | null;
  }) => {
    try {
      await setLocationMutation.mutateAsync({
        bookingId: booking.id,
        newLocation,
        credentialId,
      });
    } catch {
      // Errors are shown through the mutation onError handler
    }
  };

  // Calculate showPendingPayment based on payment logic
  const hasPayment = booking.payment.length > 0;
  const showPendingPayment = hasPayment;

  const actionContext: BookingActionContext = {
    booking,
    isUpcoming,
    isOngoing,
    isBookingInPast,
    isCancelled,
    isConfirmed,
    isRejected,
    isPending,
    isRescheduled,
    isRecurring,
    isTabRecurring,
    isTabUnconfirmed,
    isDisabledCancelling,
    isDisabledRescheduling,
    isCalVideoLocation,
    showPendingPayment,
    isAttendee,
    cardCharged,
    attendeeList,
    getSeatReferenceUid,
    t,
  } as BookingActionContext;

  const cancelEventAction = getCancelEventAction(actionContext);
  const showPastBookingCancelTooltip = isBookingInPast && cancelEventAction.disabled;

  // Get pending actions (accept/reject) - only for details context
  const shouldShowPending = shouldShowPendingActions(actionContext);
  const basePendingActions =
    shouldShowPending && context === "details" ? getPendingActions(actionContext) : [];
  const pendingActions: ActionType[] = basePendingActions.map((action) => ({
    ...action,
    disabled: isConfirmPending,
    onClick:
      action.id === "confirm"
        ? () =>
            bookingConfirm({
              bookingId: booking.id,
              confirmed: true,
              recurringEventId: booking.recurringEventId,
            })
        : action.id === "reject"
          ? () => handleReject()
          : undefined,
  })) as ActionType[];

  const shouldShowEdit = shouldShowEditActions(actionContext);
  const baseEditEventActions = getEditEventActions(actionContext);
  const editEventActions: ActionType[] = baseEditEventActions.map((action) => ({
    ...action,
    disabled: !shouldShowEdit || action.disabled, // Disable all edit actions if shouldn't show edit actions
    onClick:
      action.id === "reschedule_request"
        ? () => setIsOpenRescheduleDialog(true)
        : action.id === "change_location"
            ? () => setIsOpenLocationDialog(true)
            : action.id === "add_members"
              ? () => setIsOpenAddGuestsDialog(true)
              : action.id === "reassign"
                ? () => setIsOpenReassignDialog(true)
                : undefined,
  })) as ActionType[];

  const baseAfterEventActions = getAfterEventActions(actionContext);
  const afterEventActions: ActionType[] = baseAfterEventActions.map((action) => ({
    ...action,
    onClick:
      action.id === "view_recordings"
        ? () => setViewRecordingsDialogIsOpen(true)
        : action.id === "meeting_session_details"
          ? () => setMeetingSessionDetailsDialogIsOpen(true)
          : action.id === "charge_card"
            ? () => setChargeCardDialogIsOpen(true)
            : action.id === "no_show"
              ? () => {
                  if (attendeeList.length === 1) {
                    const attendee = attendeeList[0];
                    noShowMutation.mutate({
                      bookingUid: booking.uid,
                      attendees: [{ email: attendee.email, noShow: !attendee.noShow }],
                    });
                    return;
                  }
                  setIsNoShowDialogOpen(true);
                }
              : undefined,
    disabled:
      action.disabled ||
      (action.id === "no_show" && !(isBookingInPast || isOngoing)) ||
      (action.id === "view_recordings" && !booking.isRecorded),
  })) as ActionType[];

  const reportAction = getReportAction(actionContext);
  const reportActionWithHandler = {
    ...reportAction,
    onClick: () => setIsOpenReportDialog(true),
  };

  const NoShowAttendeesDialog = ({
    bookingUid,
    attendees,
    setIsOpen,
    isOpen,
  }: {
    bookingUid: string;
    attendees: Array<{
      name: string;
      email: string;
      id: number;
      noShow: boolean;
      phoneNumber: string | null;
    }>;
    setIsOpen: (open: boolean) => void;
    isOpen: boolean;
  }) => {
    const [noShowAttendees, setNoShowAttendees] = useState<
      Array<{
        email: string;
        noShow: boolean;
      }>
    >(attendees.map((attendee) => ({ email: attendee.email, noShow: attendee.noShow })));

    const noShowMutation = trpc.viewer.loggedInViewerRouter.markNoShow.useMutation({
      onSuccess: async (data) => {
        showToast(data.message, "success");
        setIsOpen(false);
        await utils.viewer.bookings.invalidate();
      },
      onError: (err) => {
        showToast(err.message, "error");
      },
    });

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent title={t("mark_as_no_show")} enableOverflow>
          <div className="stack-y-2">
            {attendees.map((attendee, index) => (
              <label key={attendee.email} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={noShowAttendees[index]?.noShow || false}
                  onChange={(e) => {
                    const newNoShowAttendees = [...noShowAttendees];
                    newNoShowAttendees[index] = {
                      email: attendee.email,
                      noShow: e.target.checked,
                    };
                    setNoShowAttendees(newNoShowAttendees);
                  }}
                />
                <span>
                  {attendee.name} ({attendee.email})
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose />
            <Button
              onClick={() => {
                noShowMutation.mutate({
                  bookingUid,
                  attendees: noShowAttendees,
                });
              }}>
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const parsedBooking = {
    ...booking,
    eventType: booking.eventType.id ? booking.eventType : null,
  };

  // Render dialogs that might be triggered from BookingListItem even if dropdown is not shown
  const dialogs = (
    <>
      <RescheduleDialog
        isOpenDialog={isOpenRescheduleDialog}
        setIsOpenDialog={setIsOpenRescheduleDialog}
        bookingUid={booking.uid}
      />
      {isOpenReassignDialog && (
        <ReassignDialog
          isOpenDialog={isOpenReassignDialog}
          setIsOpenDialog={setIsOpenReassignDialog}
          bookingId={booking.id}
          teamId={booking.eventType?.team?.id || 0}
          isManagedEvent={booking.eventType?.parentId != null}
        />
      )}
      <EditLocationDialog
        booking={booking}
        saveLocation={saveLocation}
        isOpenDialog={isOpenSetLocationDialog}
        setShowLocationModal={setIsOpenLocationDialog}
        teamId={booking.eventType?.team?.id}
      />
      <AddGuestsDialog
        isOpenDialog={isOpenAddGuestsDialog}
        setIsOpenDialog={setIsOpenAddGuestsDialog}
        bookingId={booking.id}
      />
      <ReportBookingDialog
        isOpenDialog={isOpenReportDialog}
        setIsOpenDialog={setIsOpenReportDialog}
        bookingUid={booking.uid}
        isRecurring={isRecurring}
        status={getBookingStatus()}
      />
      {booking.paid && booking.payment[0] && (
        <ChargeCardDialog
          isOpenDialog={chargeCardDialogIsOpen}
          setIsOpenDialog={setChargeCardDialogIsOpen}
          bookingId={booking.id}
          paymentAmount={booking.payment[0].amount}
          paymentCurrency={booking.payment[0].currency}
        />
      )}
      {/* Cal video recording dialogs removed (enterprise) */}
      {isNoShowDialogOpen && (
        <NoShowAttendeesDialog
          bookingUid={booking.uid}
          attendees={attendeeList}
          setIsOpen={setIsNoShowDialogOpen}
          isOpen={isNoShowDialogOpen}
        />
      )}
      <CancelBookingDialog
        isOpenDialog={isCancelDialogOpen}
        setIsOpenDialog={setIsCancelDialogOpen}
        booking={{
          uid: booking.uid,
          id: booking.id,
          title: booking.title,
          startTime: new Date(booking.startTime),
          payment: booking.payment,
        }}
        profile={{
          name: booking.user?.name || null,
          slug: booking.user?.username || null,
        }}
        recurringEvent={booking.eventType?.recurringEvent || null}
        team={booking.eventType?.team?.name}
        teamId={booking.eventType?.team?.id}
        allRemainingBookings={isTabRecurring && isRecurring}
        seatReferenceUid={getSeatReferenceUid()}
        currentUserEmail={booking.loggedInUser.userEmail}
        bookingCancelledEventProps={{
          booking: booking,
          organizer: {
            name: booking.user?.name || "Nameless",
            email: booking.userPrimaryEmail || booking.user?.email || "Email-less",
            timeZone: booking.user?.timeZone,
          },
          eventType: booking.eventType,
        }}
        isHost={isHost}
        internalNotePresets={[]}
        eventTypeMetadata={booking.eventType?.metadata}
      />
    </>
  );

  // Check if there are any available actions across all action groups
  const hasAnyAvailableActions = () => {
    // Check if any pending action is available
    const hasAvailablePendingAction = pendingActions.some((action) => !action.disabled);

    // Check if any edit action is available
    const hasAvailableEditAction = editEventActions.some((action) => !action.disabled);

    // Check if any after event action is available
    const hasAvailableAfterAction = afterEventActions.some((action) => !action.disabled);

    // Check report and cancel actions
    const isReportAvailable = !reportActionWithHandler.disabled;
    const isCancelAvailable = !cancelEventAction.disabled;

    return (
      hasAvailablePendingAction ||
      hasAvailableEditAction ||
      hasAvailableAfterAction ||
      isReportAvailable ||
      isCancelAvailable
    );
  };

  // Don't render dropdown if no actions are available
  if (!hasAnyAvailableActions()) {
    return dialogs;
  }

  // Conditional portal wrapper to avoid portal when inside Sheet/Dialog
  const ConditionalPortal = usePortal
    ? DropdownMenuPortal
    : ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return (
    <>
      {dialogs}
      <RejectionReasonDialog
        isOpenDialog={rejectionDialogIsOpen}
        setIsOpenDialog={setRejectionDialogIsOpen}
        onConfirm={(reason) =>
          bookingConfirm({
            bookingId: booking.id,
            confirmed: false,
            recurringEventId: booking.recurringEventId,
            reason,
          })
        }
        isPending={isConfirmPending}
      />
      <ForceConfirmDialog
        isOpenDialog={forceConfirmDialogIsOpen}
        setIsOpenDialog={setForceConfirmDialogIsOpen}
        onConfirm={bookingForceConfirm}
        isPending={isConfirmPending}
      />
      <Dropdown modal={false}>
        <DropdownMenuTrigger asChild data-testid="booking-actions-dropdown">
          <Button
            type="button"
            color="secondary"
            size={size}
            StartIcon="ellipsis"
            className={classNames("px-2", className)}
            // Prevent click from bubbling to parent row/container click handlers
            onClick={(e) => e.stopPropagation()}
          />
        </DropdownMenuTrigger>
        <ConditionalPortal>
          <DropdownMenuContent>
            {pendingActions.length > 0 && (
              <>
                <DropdownMenuLabel className="px-2 pb-1 pt-1.5">{t("booking_response")}</DropdownMenuLabel>
                {pendingActions.map((action) => (
                  <DropdownMenuItem className="rounded-lg" key={action.id} disabled={action.disabled}>
                    <DropdownItem
                      type="button"
                      color={action.color}
                      StartIcon={action.icon}
                      href={action.disabled ? undefined : action.href}
                      disabled={action.disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        action.onClick?.(e);
                      }}
                      data-booking-uid={action.bookingUid}
                      data-testid={action.id}
                      className={action.disabled ? "text-muted" : undefined}>
                      {action.label}
                    </DropdownItem>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel className="px-2 pb-1 pt-1.5">{t("edit_event")}</DropdownMenuLabel>
            {editEventActions.map((action) => (
              <DropdownMenuItem className="rounded-lg" key={action.id} disabled={action.disabled}>
                <DropdownItem
                  type="button"
                  color={action.color}
                  StartIcon={action.icon}
                  href={action.disabled ? undefined : action.href}
                  disabled={action.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick?.(e);
                  }}
                  data-booking-uid={action.bookingUid}
                  data-testid={action.id}
                  className={action.disabled ? "text-muted" : undefined}>
                  {action.label}
                </DropdownItem>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-2 pb-1 pt-1.5">{t("after_event")}</DropdownMenuLabel>
            {afterEventActions.map((action) => (
              <DropdownMenuItem className="rounded-lg" key={action.id} disabled={action.disabled}>
                <DropdownItem
                  type="button"
                  color={action.color}
                  StartIcon={action.icon}
                  href={action.disabled ? undefined : action.href}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick?.(e);
                  }}
                  disabled={action.disabled}
                  data-booking-uid={action.bookingUid}
                  data-testid={action.id}
                  className={action.disabled ? "text-muted" : undefined}>
                  {action.label}
                </DropdownItem>
              </DropdownMenuItem>
            ))}
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="rounded-lg"
                key={reportActionWithHandler.id}
                disabled={reportActionWithHandler.disabled}>
                <DropdownItem
                  type="button"
                  color={reportActionWithHandler.color}
                  StartIcon={reportActionWithHandler.icon}
                  onClick={(e) => {
                    e.stopPropagation();
                    reportActionWithHandler.onClick?.();
                  }}
                  disabled={reportActionWithHandler.disabled}
                  data-testid={reportActionWithHandler.id}
                  className={reportActionWithHandler.disabled ? "text-muted" : undefined}>
                  {reportActionWithHandler.label}
                </DropdownItem>
              </DropdownMenuItem>
            </>
            <DropdownMenuSeparator />
            <Tooltip
              content={isBookingInPast ? t("cannot_cancel_past_booking") : ""}
              side="left"
              open={showPastBookingCancelTooltip ? undefined : false}>
              <DropdownMenuItem
                className="rounded-lg"
                key={cancelEventAction.id}
                disabled={cancelEventAction.disabled}>
                <DropdownItem
                  type="button"
                  color={cancelEventAction.color}
                  StartIcon={cancelEventAction.icon}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCancelDialogOpen(true);
                  }}
                  disabled={cancelEventAction.disabled}
                  data-booking-uid={cancelEventAction.bookingUid}
                  data-testid={cancelEventAction.id}
                  className={cancelEventAction.disabled ? "text-muted" : undefined}>
                  {cancelEventAction.label}
                </DropdownItem>
              </DropdownMenuItem>
            </Tooltip>
          </DropdownMenuContent>
        </ConditionalPortal>
      </Dropdown>
    </>
  );
}

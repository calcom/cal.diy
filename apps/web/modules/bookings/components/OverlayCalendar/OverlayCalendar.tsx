import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { useOverlayCalendar } from "@calcom/web/modules/bookings/hooks/useOverlayCalendar";
import type { WrappedBookerPropsMain } from "../../types";
import { useEffect } from "react";
import { OverlayCalendarContinueModal } from "./OverlayCalendarContinueModal";
import { OverlayCalendarSettingsModal } from "./OverlayCalendarSettingsModal";
import { OverlayCalendarSwitch } from "./OverlayCalendarSwitch";

type OverlayCalendarProps = Pick<
  WrappedBookerPropsMain["calendars"],
  "connectedCalendars" | "overlayBusyDates" | "onToggleCalendar" | "isOverlayCalendarEnabled"
> & {
  handleClickNoCalendar: () => void;
  hasSession: boolean;
  handleClickContinue: WrappedBookerPropsMain["onClickOverlayContinue"];
  socialLoginProviders?: WrappedBookerPropsMain["overlaySocialLoginProviders"];
  handleSwitchStateChange: (state: boolean) => void;
};

export const OverlayCalendar = ({
  connectedCalendars,
  overlayBusyDates,
  onToggleCalendar,
  isOverlayCalendarEnabled,
  handleClickNoCalendar,
  handleSwitchStateChange,
  handleClickContinue,
  socialLoginProviders,
  hasSession,
}: OverlayCalendarProps): JSX.Element | null => {
  const isPlatform = useIsPlatform();
  const {
    handleCloseContinueModal,
    handleCloseSettingsModal,
    isOpenOverlayContinueModal,
    isOpenOverlaySettingsModal,
    handleToggleConnectedCalendar,
    checkIsCalendarToggled,
  } = useOverlayCalendar({ connectedCalendars, overlayBusyDates, onToggleCalendar });

  // Adding to avoid flickering of continue modal due to stale state
  useEffect(() => {
    if (isOverlayCalendarEnabled) {
      handleCloseContinueModal(false);
    }
  }, [isOverlayCalendarEnabled, handleCloseContinueModal]);

  // on platform we don't handle connecting to third party calendar via booker yet
  if (isPlatform && connectedCalendars?.length === 0) {
    return null;
  }

  return (
    <>
      <OverlayCalendarSwitch
        enabled={isOverlayCalendarEnabled}
        hasSession={hasSession}
        onStateChange={handleSwitchStateChange}
      />
      {!isPlatform && (
        <OverlayCalendarContinueModal
          open={isOpenOverlayContinueModal && !isOverlayCalendarEnabled}
          onClose={handleCloseContinueModal}
          onContinue={handleClickContinue}
          socialLoginProviders={socialLoginProviders}
        />
      )}
      <OverlayCalendarSettingsModal
        open={isOpenOverlaySettingsModal}
        onClose={handleCloseSettingsModal}
        onToggleConnectedCalendar={handleToggleConnectedCalendar}
        onClickNoCalendar={() => {
          handleClickNoCalendar();
        }}
        checkIsCalendarToggled={checkIsCalendarToggled}
      />
    </>
  );
};

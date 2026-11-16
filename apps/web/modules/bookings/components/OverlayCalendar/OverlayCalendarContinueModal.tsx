import { Dialog } from "@calcom/features/components/controlled-dialog";
import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter } from "@calcom/ui/components/dialog";
import type { OverlaySocialLoginProvider } from "../../types";

const SOCIAL_LOGIN_BUTTONS: Record<
  OverlaySocialLoginProvider,
  { name: string; icon: string; testId: string }
> = {
  google: { name: "Google", icon: "/google-icon-colored.svg", testId: "overlay-calendar-google-button" },
  "azure-ad": {
    name: "Microsoft",
    icon: "/microsoft-logo.svg",
    testId: "overlay-calendar-microsoft-button",
  },
};

interface IOverlayCalendarContinueModalProps {
  open?: boolean;
  onClose?: (state: boolean) => void;
  onContinue: (socialLoginProvider?: OverlaySocialLoginProvider) => void;
  socialLoginProviders?: OverlaySocialLoginProvider[];
}

export function OverlayCalendarContinueModal(props: IOverlayCalendarContinueModalProps) {
  const { t } = useLocale();
  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onClose}>
        <DialogContent
          type="creation"
          title={t("overlay_my_calendar")}
          description={t("overlay_my_calendar_toc")}>
          <div className="flex flex-col gap-2">
            <Button
              data-testid="overlay-calendar-continue-button"
              onClick={() => {
                props.onContinue();
              }}
              className="gap w-full items-center justify-center font-semibold"
              StartIcon="calendar-search">
              {t("continue_with", { appName: APP_NAME })}
            </Button>
            {props.socialLoginProviders?.map((provider) => {
              const { name, icon, testId } = SOCIAL_LOGIN_BUTTONS[provider];
              return (
                <Button
                  key={provider}
                  color="secondary"
                  data-testid={testId}
                  onClick={() => {
                    props.onContinue(provider);
                  }}
                  className="gap w-full items-center justify-center font-semibold"
                  CustomStartIcon={<img className="mr-2 size-4" src={icon} alt="" />}>
                  {t("continue_with", { appName: name })}
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            {/* Agh modal hacks */}
            <></>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

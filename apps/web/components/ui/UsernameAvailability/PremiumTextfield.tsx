import classNames from "classnames";
// eslint-disable-next-line no-restricted-imports
import { noop } from "lodash";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RefCallback } from "react";
import { useEffect, useState } from "react";

import { getPremiumPlanPriceValue } from "@calcom/app-store/stripepayment/lib/utils";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { fetchUsername } from "@calcom/lib/fetchUsername";
import hasKeyInMetadata from "@calcom/lib/hasKeyInMetadata";
import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import type { AppRouter } from "@calcom/trpc/types/server/routers/_app";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogClose } from "@calcom/ui/components/dialog";
import { Label, Input } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { CheckIcon, ExternalLinkIcon } from "@coss/ui/icons";

import type { TRPCClientErrorLike } from "@trpc/client";

export enum UsernameChangeStatusEnum {
  UPGRADE = "UPGRADE",
}

interface ICustomUsernameProps {
  currentUsername: string | undefined;
  setCurrentUsername?: (newUsername: string) => void;
  inputUsernameValue: string | undefined;
  usernameRef: RefCallback<HTMLInputElement>;
  setInputUsernameValue: (value: string) => void;
  onSuccessMutation?: () => void;
  onErrorMutation?: (error: TRPCClientErrorLike<AppRouter>) => void;
}

const obtainNewUsernameChangeCondition = ({
  userIsPremium,
  isNewUsernamePremium,
}: {
  userIsPremium: boolean;
  isNewUsernamePremium: boolean;
  stripeCustomer: RouterOutputs["viewer"]["loggedInViewerRouter"]["stripeCustomer"] | undefined;
}) => {
  if (!userIsPremium && isNewUsernamePremium) {
    return UsernameChangeStatusEnum.UPGRADE;
  }
};

const PremiumTextfield = (props: ICustomUsernameProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { update } = useSession();
  const {
    currentUsername,
    setCurrentUsername = noop,
    inputUsernameValue,
    setInputUsernameValue,
    usernameRef,
    onSuccessMutation,
    onErrorMutation,
  } = props;
  const [user] = trpc.viewer.me.get.useSuspenseQuery();
  const [usernameIsAvailable, setUsernameIsAvailable] = useState(false);
  const [markAsError, setMarkAsError] = useState(false);
  const recentAttemptPaymentStatus = searchParams?.get("recentAttemptPaymentStatus");
  const [openDialogSaveUsername, setOpenDialogSaveUsername] = useState(false);
  const { data: stripeCustomer } = trpc.viewer.loggedInViewerRouter.stripeCustomer.useQuery();
  const isCurrentUsernamePremium =
    user && user.metadata && hasKeyInMetadata(user, "isPremium") ? !!user.metadata.isPremium : false;
  const [isInputUsernamePremium, setIsInputUsernamePremium] = useState(false);
  // debounce the username input, set the delay to 600ms to be consistent with signup form
  const debouncedUsername = useDebounce(inputUsernameValue, 600);

  useEffect(() => {
    // Use the current username or if it's not set, use the one available from stripe
    setInputUsernameValue(currentUsername || stripeCustomer?.username || "");
  }, [setInputUsernameValue, currentUsername, stripeCustomer?.username]);

  useEffect(() => {
    async function checkUsername(username: string | undefined) {
      if (!username) {
        setUsernameIsAvailable(false);
        setMarkAsError(false);
        setIsInputUsernamePremium(false);
        return;
      }

      const { data } = await fetchUsername(username, null);
      setMarkAsError(!data.available && !!currentUsername && username !== currentUsername);
      setIsInputUsernamePremium(data.premium);
      setUsernameIsAvailable(data.available);
    }

    checkUsername(debouncedUsername);
  }, [debouncedUsername, currentUsername]);

  const updateUsername = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async () => {
      onSuccessMutation && (await onSuccessMutation());
      await update({ username: inputUsernameValue });
      setOpenDialogSaveUsername(false);
    },
    onError: (error) => {
      onErrorMutation && onErrorMutation(error);
    },
  });

  // when current username isn't set - Go to stripe to check what username he wanted to buy and was it a premium and was it paid for
  const paymentRequired = !currentUsername && stripeCustomer?.isPremium;

  const usernameChangeCondition = obtainNewUsernameChangeCondition({
    userIsPremium: isCurrentUsernamePremium,
    isNewUsernamePremium: isInputUsernamePremium,
    stripeCustomer,
  });

  const usernameFromStripe = stripeCustomer?.username;

  const paymentLink = `/api/integrations/stripepayment/subscription?intentUsername=${
    inputUsernameValue || usernameFromStripe
  }&action=${usernameChangeCondition}&callbackUrl=${WEBAPP_URL}${pathname}`;

  const ActionButtons = () => {
    if (paymentRequired) {
      return (
        <div className="flex flex-row">
          <Button
            type="button"
            color="primary"
            className="mx-2"
            href={paymentLink}
            data-testid="reserve-username-btn">
            {t("Reserve")}
          </Button>
        </div>
      );
    }
    if ((usernameIsAvailable || isInputUsernamePremium) && currentUsername !== inputUsernameValue) {
      return (
        <div className="flex flex-row">
          <Button
            type="button"
            color="primary"
            className="mx-2"
            onClick={() => setOpenDialogSaveUsername(true)}
            data-testid="update-username-btn">
            {t("update")}
          </Button>
          <Button
            type="button"
            color="secondary"
            onClick={() => {
              if (currentUsername) {
                setInputUsernameValue(currentUsername);
              }
            }}>
            {t("cancel")}
          </Button>
        </div>
      );
    }
    return <></>;
  };

  const saveUsername = () => {
    if (usernameChangeCondition !== UsernameChangeStatusEnum.UPGRADE) {
      updateUsername.mutate({
        username: inputUsernameValue,
      });
      setCurrentUsername(inputUsernameValue);
    }
  };

  let paymentMsg = !currentUsername ? (
    <span className="text-xs text-orange-400">
      You need to reserve your premium username for {getPremiumPlanPriceValue()}
    </span>
  ) : null;

  if (recentAttemptPaymentStatus && recentAttemptPaymentStatus !== "paid") {
    paymentMsg = (
      <span className="text-sm text-red-500">
        Your payment could not be completed. Your username is still not reserved
      </span>
    );
  }

  return (
    <div>
      <div className="flex justify-items-center">
        <Label htmlFor="username">{t("username")}</Label>
      </div>
      <div className="flex rounded-md">
        <span
          className={classNames(
            isInputUsernamePremium ? "border border-orange-400 " : "",
            "border-default bg-cal-muted text-subtle hidden h-8 items-center rounded-l-md border border-r-0 px-3 text-sm md:inline-flex"
          )}>
          {process.env.NEXT_PUBLIC_WEBSITE_URL.replace("https://", "").replace("http://", "")}/
        </span>

        <div className="relative w-full">
          <Input
            ref={usernameRef}
            name="username"
            autoComplete="none"
            autoCapitalize="none"
            autoCorrect="none"
            className={classNames(
              "border-l my-0 rounded-md font-sans text-sm leading-4 focus:ring-0! sm:rounded-l-none",
              isInputUsernamePremium
                ? "border border-orange-400 focus:border focus:border-orange-400"
                : "border focus:border",
              markAsError
                ? "focus:shadow-0 focus:ring-shadow-0 border-red-500  focus:border-red-500 focus:outline-none"
                : "border-l-default"
            )}
            value={inputUsernameValue}
            onChange={(event) => {
              event.preventDefault();
              // Reset payment status
              const _searchParams = new URLSearchParams(searchParams ?? undefined);
              _searchParams.delete("paymentStatus");
              if (searchParams?.toString() !== _searchParams.toString()) {
                router.replace(`${pathname}?${_searchParams.toString()}`);
              }
              setInputUsernameValue(event.target.value);
            }}
            data-testid="username-input"
          />
          <div className="absolute right-2 top-0 flex flex-row">
            <span
              className={classNames(
                "mx-2 py-2",
                isInputUsernamePremium ? "text-transparent" : "",
                usernameIsAvailable ? "" : ""
              )}>
              {isInputUsernamePremium ? (
                <Icon name="star" className="mt-[2px] h-4 w-4 fill-orange-400" />
              ) : (
                <></>
              )}
              {!isInputUsernamePremium && usernameIsAvailable ? (
                <CheckIcon className="mt-[2px] h-4 w-4" />
              ) : (
                <></>
              )}
            </span>
          </div>
        </div>

        {(usernameIsAvailable || isInputUsernamePremium) && currentUsername !== inputUsernameValue && (
          <div className="flex justify-end">
            <ActionButtons />
          </div>
        )}
      </div>
      {paymentMsg}
      {markAsError && <p className="mt-1 text-xs text-red-500">{t("username_already_taken")}</p>}

      <Dialog open={openDialogSaveUsername}>
        <DialogContent
          Icon="pencil"
          title={t("confirm_username_change_dialog_title")}
          description={
            <>
              {usernameChangeCondition && usernameChangeCondition === UsernameChangeStatusEnum.UPGRADE && (
                <p className="text-default mb-4 text-sm">{t("change_username_standard_to_premium")}</p>
              )}
            </>
          }>
          <div className="flex flex-row">
            <div className="mb-4 w-full px-4 pt-1">
              <div className="bg-subtle flex w-full flex-wrap rounded-sm py-3 text-sm">
                <div className="flex-1 px-2">
                  <p className="text-subtle">{t("current_username")}</p>
                  <p className="text-emphasis mt-1 break-all" data-testid="current-username">
                    {currentUsername}
                  </p>
                </div>
                <div className="ml-6 flex-1">
                  <p className="text-subtle" data-testid="new-username">
                    {t("new_username")}
                  </p>
                  <p className="text-emphasis break-all">{inputUsernameValue}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            {/* redirect to checkout */}
            {usernameChangeCondition === UsernameChangeStatusEnum.UPGRADE && (
              <Button
                type="button"
                loading={updateUsername.isPending}
                data-testid="go-to-billing"
                href={paymentLink}>
                <>
                  {t("go_to_stripe_billing")} <ExternalLinkIcon className="ml-1 h-4 w-4" />
                </>
              </Button>
            )}
            {/* Normal save */}
            {usernameChangeCondition !== UsernameChangeStatusEnum.UPGRADE && (
              <Button
                type="button"
                loading={updateUsername.isPending}
                data-testid="save-username"
                onClick={() => {
                  saveUsername();
                }}>
                {t("save")}
              </Button>
            )}
            <DialogClose color="secondary" onClick={() => setOpenDialogSaveUsername(false)}>
              {t("cancel")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { PremiumTextfield };

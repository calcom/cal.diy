import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { ButtonGroup } from "@calcom/ui/components/buttonGroup";
import {
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calcom/ui/components/dropdown";
import { showToast } from "@calcom/ui/components/toast";
import { Tooltip } from "@calcom/ui/components/tooltip";
import { useSession } from "next-auth/react";
import type { UserTableAction, UserTableUser } from "./types";

export function TableActions({
  user,
  permissionsForUser,
  dispatch,
  domain,
}: {
  user: UserTableUser;
  dispatch: React.Dispatch<UserTableAction>;
  domain: string;
  permissionsForUser: {
    canEdit: boolean;
    canRemove: boolean;
    canImpersonate: boolean;
    canResendInvitation: boolean;
    canResetPassword: boolean;
  };
}) {
  const { t, i18n } = useLocale();
  const { data: session } = useSession();
  const resendInvitationMutation = {
    mutate: (..._args: unknown[]) => {},
    mutateAsync: async () => ({}),
    isPending: false,
  };

  const utils = trpc.useUtils();
  const updateMembershipStatusMutation = trpc.viewer.users.updateMembershipStatus.useMutation({
    onSuccess: () => {
      showToast(
        user.status === "PAUSED"
          ? t("membership_unpaused_successfully")
          : t("membership_paused_successfully"),
        "success"
      );
      utils.viewer.users.get.invalidate();
    },
    onError: (err) => {
      showToast(err.message || t("error_updating_membership"), "error");
    },
  });

  const sendPasswordResetMutation = {
    mutate: (..._args: unknown[]) => {},
    mutateAsync: async () => ({}),
    isPending: false,
  };

  const usersProfileUrl = `${domain}/${user.username}`;

  if (!session?.user.org?.id) return null;

  const orgId = session?.user?.org?.id;

  return (
    <div className="flex w-full justify-center">
      <ButtonGroup combined containerProps={{ className: "border-default hidden md:flex" }}>
        <Tooltip content={t("view_public_page")}>
          <Button
            target="_blank"
            href={usersProfileUrl}
            color="secondary"
            className={classNames(!permissionsForUser.canEdit ? "rounded-r-md" : "")}
            variant="icon"
            StartIcon="external-link"
          />
        </Tooltip>
        {(permissionsForUser.canEdit || permissionsForUser.canRemove) && (
          <Dropdown>
            <DropdownMenuTrigger asChild>
              <Button
                className="ltr:radix-state-open:rounded-r-(--btn-group-radius) rtl:radix-state-open:rounded-l-(--btn-group-radius)"
                color="secondary"
                variant="icon"
                StartIcon="ellipsis"
              />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent>
                {permissionsForUser.canEdit && (
                  <DropdownMenuItem>
                    <DropdownItem
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "EDIT_USER_SHEET",
                          payload: {
                            user,
                            showModal: true,
                          },
                        })
                      }
                      StartIcon="pencil">
                      {t("edit")}
                    </DropdownItem>
                  </DropdownMenuItem>
                )}
                {permissionsForUser.canEdit && (
                  <DropdownMenuItem>
                    <DropdownItem
                      type="button"
                      onClick={() => {
                        updateMembershipStatusMutation.mutate({
                          userId: user.id,
                          teamId: orgId,
                          status: user.status === "PAUSED" ? "ACTIVE" : "PAUSED",
                        });
                      }}
                      StartIcon={user.status === "PAUSED" ? "play" : "pause"}>
                      {user.status === "PAUSED" ? t("unpause_membership") : t("pause_membership")}
                    </DropdownItem>
                  </DropdownMenuItem>
                )}
                {permissionsForUser.canImpersonate && (
                  <DropdownMenuItem>
                    <DropdownItem
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "SET_IMPERSONATE_ID",
                          payload: {
                            user,
                            showModal: true,
                          },
                        })
                      }
                      StartIcon="lock">
                      {t("impersonate")}
                    </DropdownItem>
                  </DropdownMenuItem>
                )}
                {permissionsForUser.canResetPassword && (
                  <DropdownMenuItem>
                    <DropdownItem
                      type="button"
                      onClick={() => {
                        sendPasswordResetMutation.mutate({ userId: user.id });
                      }}
                      StartIcon="key">
                      {t("reset_password")}
                    </DropdownItem>
                  </DropdownMenuItem>
                )}
                {(permissionsForUser.canImpersonate || permissionsForUser.canResetPassword) &&
                  permissionsForUser.canRemove && <DropdownMenuSeparator />}
                {permissionsForUser.canRemove && (
                  <DropdownMenuItem>
                    <DropdownItem
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "SET_DELETE_ID",
                          payload: {
                            user,
                            showModal: true,
                          },
                        })
                      }
                      color="destructive"
                      StartIcon="user-x">
                      {t("remove")}
                    </DropdownItem>
                  </DropdownMenuItem>
                )}
                {permissionsForUser.canResendInvitation && (
                  <DropdownMenuItem>
                    <DropdownItem
                      type="button"
                      onClick={() => {
                        resendInvitationMutation.mutate({
                          teamId: orgId,
                          language: i18n.language,
                          email: user.email,
                          isOrg: true,
                        });
                      }}
                      StartIcon="send">
                      {t("resend_invitation")}
                    </DropdownItem>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </Dropdown>
        )}
      </ButtonGroup>
      <div className="flex md:hidden">
        <Dropdown>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="icon" color="minimal" StartIcon="ellipsis" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent>
              <DropdownMenuItem className="outline-none">
                <DropdownItem type="button" StartIcon="external-link">
                  {t("view_public_page")}
                </DropdownItem>
              </DropdownMenuItem>
              {permissionsForUser.canEdit && (
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "EDIT_USER_SHEET",
                        payload: {
                          user,
                          showModal: true,
                        },
                      })
                    }
                    StartIcon="pencil">
                    {t("edit")}
                  </DropdownItem>
                </DropdownMenuItem>
              )}
              {permissionsForUser.canEdit && (
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    onClick={() => {
                      updateMembershipStatusMutation.mutate({
                        userId: user.id,
                        teamId: orgId,
                        status: user.status === "PAUSED" ? "ACTIVE" : "PAUSED",
                      });
                    }}
                    StartIcon={user.status === "PAUSED" ? "play" : "pause"}>
                    {user.status === "PAUSED" ? t("unpause_membership") : t("pause_membership")}
                  </DropdownItem>
                </DropdownMenuItem>
              )}
              {permissionsForUser.canResetPassword && (
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    onClick={() => {
                      sendPasswordResetMutation.mutate({ userId: user.id });
                    }}
                    StartIcon="key">
                    {t("reset_password")}
                  </DropdownItem>
                </DropdownMenuItem>
              )}
              {permissionsForUser.canRemove && (
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    color="destructive"
                    onClick={() =>
                      dispatch({
                        type: "SET_DELETE_ID",
                        payload: {
                          user,
                          showModal: true,
                        },
                      })
                    }
                    StartIcon="user-x">
                    {t("remove")}
                  </DropdownItem>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </Dropdown>
      </div>
    </div>
  );
}

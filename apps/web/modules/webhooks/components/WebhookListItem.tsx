"use client";

import { getWebhookVersionLabel } from "@calcom/features/webhooks/lib/constants";
import type { Webhook } from "@calcom/features/webhooks/lib/dto/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { revalidateEventTypeEditPage } from "@calcom/web/app/(use-page-wrapper)/event-types/[type]/actions";
import { revalidateWebhooksList } from "@calcom/web/app/(use-page-wrapper)/settings/(settings-layout)/developer/webhooks/(with-loader)/actions";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@coss/ui/components/menu";
import { Switch } from "@coss/ui/components/switch";
import { toastManager } from "@coss/ui/components/toast";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@coss/ui/components/tooltip";
import { useIsMobile } from "@coss/ui/hooks/use-mobile";
import {
  ListItem,
  ListItemActions,
  ListItemBadges,
  ListItemContent,
  ListItemHeader,
  ListItemTitle,
  ListItemTitleLink,
} from "@coss/ui/shared/list-item";
import { EllipsisIcon, ExternalLinkIcon, PencilIcon, TrashIcon, WebhookIcon } from "@coss/ui/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DeleteWebhookDialog } from "./dialogs/DeleteWebhookDialog";

const MAX_BADGES_TWO_ROWS = 7;

export default function WebhookListItem(props: {
  webhook: Webhook;
  profile?: { name: string | null; image?: string; slug?: string | null };
  canEditWebhook?: boolean;
  editHref?: string;
  onEditWebhookAction?: () => void;
  permissions: {
    canEditWebhook?: boolean;
    canDeleteWebhook?: boolean;
  };
}) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const { webhook } = props;
  const [active, setActive] = useState(webhook.active);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [badgesExpanded, setBadgesExpanded] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setActive(webhook.active);
  }, [webhook.active]);

  const deleteWebhook = trpc.viewer.webhook.delete.useMutation({
    async onSuccess() {
      if (webhook.eventTypeId) revalidateEventTypeEditPage(webhook.eventTypeId);
      revalidateWebhooksList();
      toastManager.add({ title: t("webhook_removed_successfully"), type: "success" });
      await utils.viewer.webhook.getByViewer.invalidate();
      await utils.viewer.webhook.list.invalidate();
      await utils.viewer.eventTypes.get.invalidate();
      setDeleteDialogOpen(false);
    },
    onError() {
      toastManager.add({ title: t("something_went_wrong"), type: "error" });
      setDeleteDialogOpen(false);
    },
  });
  const toggleWebhook = trpc.viewer.webhook.edit.useMutation({
    async onSuccess() {
      if (webhook.eventTypeId) revalidateEventTypeEditPage(webhook.eventTypeId);
      revalidateWebhooksList();
      toastManager.add({ title: t("webhook_updated_successfully"), type: "success" });
      await utils.viewer.webhook.getByViewer.invalidate();
      await utils.viewer.webhook.list.invalidate();
      await utils.viewer.eventTypes.get.invalidate();
    },
    onError() {
      setActive(webhook.active);
      toastManager.add({ title: t("something_went_wrong"), type: "error" });
    },
  });

  const toggleWebhookActive = (checked: boolean) => {
    setActive(checked);
    toggleWebhook.mutate({
      id: webhook.id,
      active: checked,
      payloadTemplate: webhook.payloadTemplate,
      eventTypeId: webhook.eventTypeId || undefined,
      time: webhook.time,
      timeUnit: webhook.timeUnit,
    });
  };

  return (
    <ListItem data-testid="webhook-list-item" className="*:px-4">
      <ListItemContent>
        <ListItemHeader>
          <div className="flex items-center gap-2">
            {props.permissions.canEditWebhook && props.editHref ? (
              <ListItemTitle data-testid="webhook-url" className="font-medium truncate">
                <ListItemTitleLink href={props.editHref}>{webhook.subscriberUrl}</ListItemTitleLink>
              </ListItemTitle>
            ) : props.permissions.canEditWebhook && props.onEditWebhookAction ? (
              <ListItemTitle data-testid="webhook-url" className="font-medium truncate">
                <a
                  className="before:absolute before:inset-0 cursor-pointer"
                  data-slot="list-item-title-link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onEditWebhookAction?.();
                  }}>
                  {webhook.subscriberUrl}
                </a>
              </ListItemTitle>
            ) : (
              <ListItemTitle data-testid="webhook-url" className="font-medium truncate">
                {webhook.subscriberUrl}
              </ListItemTitle>
            )}
            <div className="flex items-center gap-2">
              {!props.permissions.canEditWebhook && <Badge variant="warning">{t("readonly")}</Badge>}
              <div className="flex items-center">
                <TooltipProvider delay={0}>
                  <Tooltip>
                    <TooltipTrigger
                      className="after:absolute after:left-full after:h-full after:w-1"
                      render={<Badge variant="info" />}>
                      {getWebhookVersionLabel(webhook.version)}
                    </TooltipTrigger>
                    <TooltipPopup>{t("webhook_version")}</TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <a
                          className="relative flex h-5 items-center justify-center px-2 sm:h-4.5"
                          href={`https://cal.com/docs/developing/guides/automation/webhooks#${webhook.version}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        />
                      }>
                      <span className="sr-only">{t("webhook_version_docs")}</span>
                      <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0 sm:size-3" />
                    </TooltipTrigger>
                    <TooltipPopup>
                      {t("webhook_version_docs", {
                        version: getWebhookVersionLabel(webhook.version),
                      })}
                    </TooltipPopup>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </ListItemHeader>
        <ListItemBadges>
          {webhook.eventTriggers.slice(0, badgesExpanded ? undefined : MAX_BADGES_TWO_ROWS).map((trigger) => (
            <Badge key={trigger} variant="outline" className="pointer-events-none">
              <WebhookIcon />
              {t(`${trigger.toLowerCase()}`)}
            </Badge>
          ))}
          {!badgesExpanded && webhook.eventTriggers.length > MAX_BADGES_TWO_ROWS && (
            <Badge
              variant="outline"
              render={<button type="button" />}
              onClick={() => setBadgesExpanded(true)}>
              +{webhook.eventTriggers.length - MAX_BADGES_TWO_ROWS} {t("more")}
            </Badge>
          )}
        </ListItemBadges>
      </ListItemContent>
      <ListItemActions>
        {!isMobile && (
          <TooltipProvider delay={0}>
          <div className="flex items-center gap-4">
            {props.permissions.canEditWebhook ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Switch
                      checked={active}
                      data-testid="webhook-switch"
                      disabled={toggleWebhook.isPending}
                      onCheckedChange={toggleWebhookActive}
                    />
                  }
                />
                <TooltipPopup sideOffset={11}>
                  {active ? t("disable_webhook") : t("enable_webhook")}
                </TooltipPopup>
              </Tooltip>
            ) : (
              <Switch checked={active} disabled />
            )}
            <div className="flex items-center gap-2">
              {props.permissions.canEditWebhook ? (
                props.editHref ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label={t("edit")}
                          data-testid="webhook-edit-button"
                          render={<Link href={props.editHref} />}
                          size="icon"
                          variant="outline"
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                      }
                    />
                    <TooltipPopup>{t("edit")}</TooltipPopup>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label={t("edit")}
                          data-testid="webhook-edit-button"
                          size="icon"
                          variant="outline"
                          onClick={props.onEditWebhookAction}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                      }
                    />
                    <TooltipPopup>{t("edit")}</TooltipPopup>
                  </Tooltip>
                )
              ) : (
                <Button aria-label={t("edit")} disabled size="icon" variant="outline">
                  <PencilIcon aria-hidden="true" />
                </Button>
              )}
              {props.permissions.canDeleteWebhook ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label={t("delete")}
                        data-testid="delete-webhook"
                        size="icon"
                        variant="destructive-outline"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={deleteWebhook.isPending}
                      >
                        <TrashIcon aria-hidden="true" />
                      </Button>
                    }
                  />
                  <TooltipPopup>{t("delete")}</TooltipPopup>
                </Tooltip>
              ) : (
                <Button aria-label={t("delete")} disabled size="icon" variant="destructive-outline">
                  <TrashIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          </TooltipProvider>
        )}

        {isMobile && (
          <Menu>
            <MenuTrigger render={<Button aria-label={t("options")} size="icon" variant="outline" />}>
              <EllipsisIcon />
            </MenuTrigger>
            <MenuPopup align="end">
              {props.permissions.canEditWebhook ? (
                <MenuCheckboxItem
                  checked={active}
                  disabled={toggleWebhook.isPending}
                  onCheckedChange={toggleWebhookActive}
                  variant="switch"
                >
                  {t("enable_webhook")}
                </MenuCheckboxItem>
              ) : (
                <MenuCheckboxItem defaultChecked={webhook.active} disabled variant="switch">
                  {t("enable_webhook")}
                </MenuCheckboxItem>
              )}
              <MenuSeparator />
              <MenuGroup>
                {props.permissions.canEditWebhook ? (
                  props.editHref ? (
                    <MenuItem render={<Link href={props.editHref} />}>
                      <PencilIcon />
                      {t("edit")}
                    </MenuItem>
                  ) : (
                    <MenuItem onClick={props.onEditWebhookAction}>
                      <PencilIcon />
                      {t("edit")}
                    </MenuItem>
                  )
                ) : (
                  <MenuItem disabled>
                    <PencilIcon />
                    {t("edit")}
                  </MenuItem>
                )}
                {props.permissions.canDeleteWebhook ? (
                  <MenuItem
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={deleteWebhook.isPending}
                  >
                    <TrashIcon />
                    {t("delete")}
                  </MenuItem>
                ) : (
                  <MenuItem variant="destructive" disabled>
                    <TrashIcon />
                    {t("delete")}
                  </MenuItem>
                )}
              </MenuGroup>
            </MenuPopup>
          </Menu>
        )}
      </ListItemActions>
      <DeleteWebhookDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        isPending={deleteWebhook.isPending}
        onConfirm={() => {
          deleteWebhook.mutate({
            id: webhook.id,
            eventTypeId: webhook.eventTypeId || undefined,
            teamId: webhook.teamId || undefined,
          });
        }}
      />
    </ListItem>
  );
}

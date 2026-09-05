"use client";

import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
import customTemplate, { hasTemplateIntegration } from "@calcom/features/webhooks/lib/integrationTemplate";
import { WebhookVersion } from "@calcom/features/webhooks/lib/interface/IWebhookRepository";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { TimeUnit, WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import {
  Form,
  Input,
  Label,
  Select,
  Switch,
  TextArea,
  TextField,
  ToggleGroup,
} from "@calcom/ui/components/form";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import WebhookTestDisclosure from "./WebhookTestDisclosure";

export type TWebhook = RouterOutputs["viewer"]["webhook"]["list"][number];

export type WebhookFormData = {
  id?: string;
  subscriberUrl: string;
  active: boolean;
  eventTriggers: WebhookTriggerEvents[];
  secret: string | null;
  payloadTemplate: string | undefined | null;
  time?: number | null;
  timeUnit?: TimeUnit | null;
  version: WebhookVersion;
};

export type WebhookFormSubmitData = WebhookFormData & {
  changeSecret: boolean;
  newSecret: string;
};

type WebhookTriggerEventOptions = readonly { value: WebhookTriggerEvents; label: string }[];

const WEBHOOK_TRIGGER_EVENTS_GROUPED_BY_APP_V2: Record<string, WebhookTriggerEventOptions> = {
  core: [
    { value: WebhookTriggerEvents.BOOKING_CANCELLED, label: "booking_cancelled" },
    { value: WebhookTriggerEvents.BOOKING_CREATED, label: "booking_created" },
    { value: WebhookTriggerEvents.BOOKING_REJECTED, label: "booking_rejected" },
    { value: WebhookTriggerEvents.BOOKING_REQUESTED, label: "booking_requested" },
    { value: WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED, label: "booking_payment_initiated" },
    { value: WebhookTriggerEvents.BOOKING_RESCHEDULED, label: "booking_rescheduled" },
    { value: WebhookTriggerEvents.BOOKING_PAID, label: "booking_paid" },
    { value: WebhookTriggerEvents.BOOKING_NO_SHOW_UPDATED, label: "booking_no_show_updated" },
    { value: WebhookTriggerEvents.MEETING_ENDED, label: "meeting_ended" },
    { value: WebhookTriggerEvents.MEETING_STARTED, label: "meeting_started" },
    { value: WebhookTriggerEvents.RECORDING_READY, label: "recording_ready" },
    { value: WebhookTriggerEvents.OOO_CREATED, label: "ooo_created" },
    {
      value: WebhookTriggerEvents.RECORDING_TRANSCRIPTION_GENERATED,
      label: "recording_transcription_generated",
    },
    { value: WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW, label: "after_hosts_cal_video_no_show" },
    {
      value: WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW,
      label: "after_guests_cal_video_no_show",
    },
    { value: WebhookTriggerEvents.WRONG_ASSIGNMENT_REPORT, label: "wrong_assignment_report" },
  ],
} as const;

function getWebhookVariables(t: (key: string) => string) {
  return [
    {
      category: t("webhook_event_and_booking"),
      variables: [
        {
          name: "triggerEvent",
          variable: "{{triggerEvent}}",
          type: "String",
          description: t("webhook_trigger_event"),
        },
        {
          name: "createdAt",
          variable: "{{createdAt}}",
          type: "Datetime",
          description: t("webhook_created_at"),
        },
        { name: "type", variable: "{{type}}", type: "String", description: t("webhook_type") },
        { name: "title", variable: "{{title}}", type: "String", description: t("webhook_title") },
        {
          name: "startTime",
          variable: "{{startTime}}",
          type: "Datetime",
          description: t("webhook_start_time"),
        },
        {
          name: "endTime",
          variable: "{{endTime}}",
          type: "Datetime",
          description: t("webhook_end_time"),
        },
        {
          name: "description",
          variable: "{{description}}",
          type: "String",
          description: t("webhook_description"),
        },
        {
          name: "location",
          variable: "{{location}}",
          type: "String",
          description: t("webhook_location"),
        },
        { name: "uid", variable: "{{uid}}", type: "String", description: t("webhook_uid") },
        {
          name: "rescheduleUid",
          variable: "{{rescheduleUid}}",
          type: "String",
          description: t("webhook_reschedule_uid"),
        },
        {
          name: "cancellationReason",
          variable: "{{cancellationReason}}",
          type: "String",
          description: t("webhook_cancellation_reason"),
        },
        {
          name: "rejectionReason",
          variable: "{{rejectionReason}}",
          type: "String",
          description: t("webhook_rejection_reason"),
        },
      ],
    },
    {
      category: t("webhook_people"),
      variables: [
        {
          name: "organizer.name",
          variable: "{{organizer.name}}",
          type: "String",
          description: t("webhook_organizer_name"),
        },
        {
          name: "organizer.email",
          variable: "{{organizer.email}}",
          type: "String",
          description: t("webhook_organizer_email"),
        },
        {
          name: "organizer.timezone",
          variable: "{{organizer.timezone}}",
          type: "String",
          description: t("webhook_organizer_timezone"),
        },
        {
          name: "organizer.language.locale",
          variable: "{{organizer.language.locale}}",
          type: "String",
          description: t("webhook_organizer_locale"),
        },
        {
          name: "organizer.username",
          variable: "{{organizer.username}}",
          type: "String",
          description: t("webhook_organizer_username"),
        },
        {
          name: "organizer.usernameInOrg",
          variable: "{{organizer.usernameInOrg}}",
          type: "String",
          description: t("webhook_organizer_username_in_org"),
        },
        {
          name: "attendees.0.name",
          variable: "{{attendees.0.name}}",
          type: "String",
          description: t("webhook_attendee_name"),
        },
        {
          name: "attendees.0.email",
          variable: "{{attendees.0.email}}",
          type: "String",
          description: t("webhook_attendee_email"),
        },
        {
          name: "attendees.0.timeZone",
          variable: "{{attendees.0.timeZone}}",
          type: "String",
          description: t("webhook_attendee_timezone"),
        },
        {
          name: "attendees.0.language.locale",
          variable: "{{attendees.0.language.locale}}",
          type: "String",
          description: t("webhook_attendee_locale"),
        },
      ],
    },
    {
      category: t("webhook_teams"),
      variables: [
        {
          name: "team.name",
          variable: "{{team.name}}",
          type: "String",
          description: t("webhook_team_name"),
        },
        {
          name: "team.members",
          variable: "{{team.members}}",
          type: "String[]",
          description: t("webhook_team_members"),
        },
      ],
    },
    {
      category: t("webhook_metadata"),
      variables: [
        {
          name: "metadata.videoCallUrl",
          variable: "{{metadata.videoCallUrl}}",
          type: "String",
          description: t("webhook_video_call_url"),
        },
      ],
    },
  ];
}

export type WebhookFormValues = {
  subscriberUrl: string;
  active: boolean;
  eventTriggers: WebhookTriggerEvents[];
  secret: string | null;
  payloadTemplate: string | undefined | null;
  time?: number | null;
  timeUnit?: TimeUnit | null;
  version: WebhookVersion;
};

const WebhookForm = (props: {
  webhook?: TWebhook | WebhookFormData;
  apps?: (keyof typeof WEBHOOK_TRIGGER_EVENTS_GROUPED_BY_APP_V2)[];
  overrideTriggerOptions?: (typeof WEBHOOK_TRIGGER_EVENTS_GROUPED_BY_APP_V2)["core"];
  onSubmit: (event: WebhookFormSubmitData) => void;
  onCancel?: () => void;
  headerWrapper?: (
    formMethods: ReturnType<typeof useForm<WebhookFormValues>>,
    children: React.ReactNode
  ) => React.ReactNode;
}) => {
  const { apps = [], overrideTriggerOptions } = props;
  const { t } = useLocale();
  const webhookVariables = getWebhookVariables(t);

  const triggerOptions = overrideTriggerOptions
    ? [...overrideTriggerOptions]
    : [...WEBHOOK_TRIGGER_EVENTS_GROUPED_BY_APP_V2["core"]];
  if (apps) {
    for (const app of apps) {
      if (WEBHOOK_TRIGGER_EVENTS_GROUPED_BY_APP_V2[app]) {
        triggerOptions.push(...WEBHOOK_TRIGGER_EVENTS_GROUPED_BY_APP_V2[app]);
      }
    }
  }
  const translatedTriggerOptions = triggerOptions.map((option) => ({ ...option, label: t(option.label) }));

  const getEventTriggers = () => {
    if (props.webhook) return props.webhook.eventTriggers;

    return translatedTriggerOptions.map((option) => option.value);
  };

  const formMethods = useForm<WebhookFormValues>({
    defaultValues: {
      subscriberUrl: props.webhook?.subscriberUrl || "",
      active: props.webhook ? props.webhook.active : true,
      eventTriggers: getEventTriggers(),
      secret: props?.webhook?.secret || "",
      payloadTemplate: props?.webhook?.payloadTemplate || undefined,
      timeUnit: props?.webhook?.timeUnit || undefined,
      time: props?.webhook?.time || undefined,
      version: props?.webhook?.version || WebhookVersion.V_2021_10_20,
    },
  });

  formMethods.register("version");

  const triggers = formMethods.watch("eventTriggers") || [];
  const subscriberUrl = formMethods.watch("subscriberUrl");
  const time = formMethods.watch("time");
  const timeUnit = formMethods.watch("timeUnit");

  const TIME_UNITS = [TimeUnit.MINUTE, TimeUnit.HOUR, TimeUnit.DAY] as const;
  const timeUnitOptions = TIME_UNITS.map((unit) => ({
    value: unit,
    label: t(`${unit.toLowerCase()}_timeUnit`),
  }));
  const selectedTimeUnit = timeUnitOptions.find((option) => option.value === timeUnit) ?? timeUnitOptions[0];

  const isCreating = !props?.webhook?.id;
  const needsTime = triggers.some(
    (t) =>
      t === WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW ||
      t === WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW
  );
  const hasTime = !!time && !!timeUnit;
  const hasUrl = !!subscriberUrl;
  const showTimeSection = needsTime;

  const [useCustomTemplate, setUseCustomTemplate] = useState(
    props?.webhook?.payloadTemplate !== undefined && props?.webhook?.payloadTemplate !== null
  );

  function insertVariableIntoTemplate(current: string, name: string, value: string): string {
    try {
      const parsed = JSON.parse(current || "{}");
      parsed[name] = value;
      return JSON.stringify(parsed, null, 2);
    } catch {
      const trimmed = current.trim();
      if (trimmed === "{}" || trimmed === "") {
        return `{\n  "${name}": "${value}"\n}`;
      }

      if (trimmed.endsWith("}")) {
        const withoutClosing = trimmed.slice(0, -1);
        const needsComma = withoutClosing.trim().endsWith('"') || withoutClosing.trim().endsWith("}");
        return `${withoutClosing}${needsComma ? "," : ""}\n  "${name}": "${value}"\n}`;
      }

      return `${current}\n"${name}": "${value}"`;
    }
  }

  const [showVariables, setShowVariables] = useState(false);
  const [newSecret, setNewSecret] = useState("");
  const [changeSecret, setChangeSecret] = useState<boolean>(false);
  const hasSecretKey = !!props?.webhook?.secret;

  const canSubmit = isCreating
    ? hasUrl && triggers.length > 0 && (!needsTime || hasTime)
    : formMethods.formState.isDirty || changeSecret;

  useEffect(() => {
    if (needsTime && !time && !timeUnit) {
      formMethods.setValue("time", 5, { shouldDirty: isCreating });
      formMethods.setValue("timeUnit", TimeUnit.MINUTE, { shouldDirty: isCreating });
    }
  }, [isCreating, needsTime, time, timeUnit, formMethods]);

  useEffect(() => {
    if (changeSecret) {
      formMethods.unregister("secret", { keepDefaultValue: false });
    }
  }, [changeSecret, formMethods]);

  const formContent = (
    <Form
      form={formMethods}
      handleSubmit={(values) => props.onSubmit({ ...values, changeSecret, newSecret })}>
      <div className="border-subtle border p-6">
        <Controller
          name="subscriberUrl"
          control={formMethods.control}
          render={({ field: { value } }) => (
            <>
              <TextField
                name="subscriberUrl"
                label={t("subscriber_url")}
                labelClassName="font-medium text-emphasis font-sm"
                value={value}
                required
                type="url"
                onChange={(e) => {
                  formMethods.setValue("subscriberUrl", e?.target.value, { shouldDirty: true });
                  if (hasTemplateIntegration({ url: e.target.value })) {
                    setUseCustomTemplate(true);
                    formMethods.setValue("payloadTemplate", customTemplate({ url: e.target.value }), {
                      shouldDirty: true,
                    });
                  }
                }}
              />
            </>
          )}
        />
        <Controller
          name="active"
          control={formMethods.control}
          render={({ field: { value } }) => (
            <div className="font-sm text-emphasis mt-6 font-medium">
              <Switch
                label={t("enable_webhook")}
                checked={value}
                // defaultChecked={props?.webhook?.active ? props?.webhook?.active : true}
                onCheckedChange={(value) => {
                  formMethods.setValue("active", value, { shouldDirty: true });
                }}
              />
            </div>
          )}
        />
        <Controller
          name="eventTriggers"
          control={formMethods.control}
          render={({ field: { onChange, value } }) => {
            const selectValue = translatedTriggerOptions.filter((option) => value.includes(option.value));
            return (
              <div className="mt-6">
                <Label className="font-sm text-emphasis font-medium">
                  <>{t("event_triggers")}</>
                </Label>
                <Select
                  grow
                  options={translatedTriggerOptions}
                  isMulti
                  styles={{
                    indicatorsContainer: (base) =>
                      Object.assign({}, base, {
                        alignItems: "flex-start",
                      }),
                  }}
                  value={selectValue}
                  onChange={(event) => {
                    onChange(event.map((selection) => selection.value));
                    const noShowWebhookTriggerExists = !!event.find(
                      (trigger) =>
                        trigger.value === WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW ||
                        trigger.value === WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW
                    );

                    if (noShowWebhookTriggerExists) {
                      formMethods.setValue("time", props.webhook?.time ?? 5, { shouldDirty: true });
                      formMethods.setValue("timeUnit", props.webhook?.timeUnit ?? TimeUnit.MINUTE, {
                        shouldDirty: true,
                      });
                    } else {
                      formMethods.setValue("time", null, { shouldDirty: true });
                      formMethods.setValue("timeUnit", null, { shouldDirty: true });
                    }
                  }}
                />
              </div>
            );
          }}
        />

        {showTimeSection && (
          <div className="mt-5">
            <Label className="font-sm text-emphasis font-medium">
              {t("how_long_after_user_no_show_minutes")}
            </Label>
            <div className="flex items-center">
              <Input
                type="number"
                min={0}
                required
                data-testid="webhook-time"
                className="m-0! block w-16 rounded-r-none border-default border-r-0 text-sm [appearance:textfield] focus:z-10 focus:border-r"
                value={time ?? 5}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  formMethods.setValue("time", Number.isFinite(next) ? next : 5, { shouldDirty: true });
                }}
              />
              <Select
                grow={false}
                isSearchable={false}
                options={timeUnitOptions}
                value={selectedTimeUnit}
                data-testid="webhook-time-unit"
                className="block w-auto"
                innerClassNames={{
                  control: "rounded-l-none max-h-4 px-3 bg-subtle py-1",
                }}
                onChange={(option) => {
                  if (!option) return;
                  formMethods.setValue("timeUnit", option.value, { shouldDirty: true });
                }}
              />
            </div>
          </div>
        )}

        <Controller
          name="secret"
          control={formMethods.control}
          render={({ field: { value } }) => (
            <div className="mt-6">
              {!!hasSecretKey && !changeSecret && (
                <>
                  <Label className="font-sm text-emphasis font-medium">Secret</Label>
                  <div className="bg-default stack-y-0 rounded-md border-0 border-neutral-200 sm:mx-0 md:border">
                    <div className="text-emphasis rounded-sm border-b p-2 text-sm">
                      {t("forgotten_secret_description")}
                    </div>
                    <div className="p-2">
                      <Button
                        color="secondary"
                        type="button"
                        onClick={() => {
                          setChangeSecret(true);
                        }}>
                        {t("change_secret")}
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {!!hasSecretKey && changeSecret && (
                <>
                  <TextField
                    autoComplete="off"
                    label={t("secret")}
                    labelClassName="font-medium text-emphasis font-sm"
                    {...formMethods.register("secret")}
                    value={newSecret}
                    onChange={(event) => setNewSecret(event.currentTarget.value)}
                    type="text"
                    placeholder={t("leave_blank_to_remove_secret")}
                  />
                  <Button
                    color="secondary"
                    type="button"
                    className="py-1 text-xs"
                    onClick={() => {
                      setChangeSecret(false);
                    }}>
                    {t("cancel")}
                  </Button>
                </>
              )}
              {!hasSecretKey && (
                <TextField
                  name="secret"
                  label={t("secret")}
                  labelClassName="font-medium text-emphasis font-sm"
                  value={value ?? ""}
                  onChange={(e) => {
                    formMethods.setValue("secret", e?.target.value, { shouldDirty: true });
                  }}
                />
              )}
            </div>
          )}
        />

        <Controller
          name="payloadTemplate"
          control={formMethods.control}
          render={({ field: { value } }) => (
            <>
              <Label className="font-sm text-emphasis mt-6">
                <>{t("payload_template")}</>
              </Label>
              <div className="mb-2">
                <ToggleGroup
                  onValueChange={(val) => {
                    if (val === "default") {
                      setUseCustomTemplate(false);
                      formMethods.setValue("payloadTemplate", undefined, { shouldDirty: true });
                    } else {
                      setUseCustomTemplate(true);
                    }
                  }}
                  value={useCustomTemplate ? "custom" : "default"}
                  options={[
                    { value: "default", label: t("default") },
                    { value: "custom", label: t("custom") },
                  ]}
                  isFullWidth={true}
                />
              </div>
              {useCustomTemplate && (
                <div className="stack-y-3">
                  <TextArea
                    name="customPayloadTemplate"
                    rows={8}
                    value={value || ""}
                    placeholder={`{\n\n}`}
                    onChange={(e) =>
                      formMethods.setValue("payloadTemplate", e?.target.value, { shouldDirty: true })
                    }
                  />

                  <Button type="button" color="secondary" onClick={() => setShowVariables(!showVariables)}>
                    {showVariables ? t("webhook_hide_variables") : t("webhook_show_variable")}
                  </Button>

                  {showVariables && (
                    <div className="border-muted max-h-80 overflow-y-auto rounded-md border p-3">
                      {webhookVariables.map(({ category, variables }) => (
                        <div key={category} className="mb-4">
                          <h4 className="mb-2 text-sm font-medium">{category}</h4>
                          <div className="stack-y-2">
                            {variables.map(({ name, variable, description }) => (
                              <div
                                key={name}
                                className="hover:bg-cal-muted cursor-pointer rounded p-2 text-sm transition-colors"
                                onClick={() => {
                                  const currentValue = formMethods.getValues("payloadTemplate") || "{}";
                                  const updatedValue = insertVariableIntoTemplate(
                                    currentValue,
                                    name,
                                    variable
                                  );
                                  formMethods.setValue("payloadTemplate", updatedValue, {
                                    shouldDirty: true,
                                  });
                                }}>
                                <div className="text-emphasis font-mono">{variable}</div>
                                <div className="text-muted mt-1 text-xs">{description}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        />
      </div>
      <SectionBottomActions align="end" className="gap-2">
        <Button
          type="button"
          color="minimal"
          onClick={props.onCancel}
          {...(!props.onCancel ? { href: `${WEBAPP_URL}/settings/developer/webhooks` } : {})}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          data-testid="create_webhook"
          disabled={!canSubmit}
          loading={formMethods.formState.isSubmitting}>
          {props?.webhook?.id ? t("save") : t("create_webhook")}
        </Button>
      </SectionBottomActions>

      <div className="mb-4 mt-6 rounded-md">
        <WebhookTestDisclosure />
      </div>
    </Form>
  );

  // If headerWrapper is provided, wrap the form content with it
  if (props.headerWrapper) {
    return <>{props.headerWrapper(formMethods, formContent)}</>;
  }

  return formContent;
};

export default WebhookForm;

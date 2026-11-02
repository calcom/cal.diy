"use client";

import { useMemo } from "react";
import { formatToLocalizedDate } from "@calcom/lib/dayjs";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { defaultLocaleOption, localeOptions } from "@calcom/lib/i18n";
import { nameOfDay } from "@calcom/lib/weekday";
import { Avatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { EmailField, Form, Label, Select, TextField } from "@calcom/ui/components/form";
import { ImageUploader } from "@calcom/ui/components/image-uploader";
import { TimezoneSelect } from "@calcom/web/modules/timezone/components/TimezoneSelect";
import { noop } from "lodash";
import { Controller, useForm } from "react-hook-form";

interface User {
  id: number;
  name: string | null;
  email: string;
  username: string | null;
  bio: string | null;
  timeZone: string;
  weekStart: string;
  theme: string | null;
  defaultScheduleId: number | null;
  locale: string | null;
  timeFormat: number | null;
  allowDynamicBooking: boolean | null;
  identityProvider: string | null;
  role: string | null;
  avatarUrl: string | null;
  createdDate?: string | Date;
}

type Option<T extends string | number = string> = {
  value: T;
  label: string;
};

type OptionValues = {
  locale: Option;
  timeFormat: Option<number>;
  timeZone: string;
  weekStart: Option;
  role: Option;
  identityProvider: Option;
};

export type FormValues = Pick<
  User,
  | "avatarUrl"
  | "name"
  | "username"
  | "email"
  | "bio"
  | "createdDate"
  | "theme"
  | "defaultScheduleId"
  | "allowDynamicBooking"
> &
  OptionValues;

export function UserForm({
  defaultValues,
  localeProp = "en",
  onSubmit = noop,
  submitLabel = "save",
}: {
  defaultValues?: Pick<User, keyof FormValues>;
  localeProp?: string;
  onSubmit: (data: FormValues) => void;
  submitLabel?: string;
}) {
  const { t, i18n: { language } } = useLocale();

  const timeFormatOptions = [
    { value: 12, label: t("12_hour") },
    { value: 24, label: t("24_hour") },
  ];

  const weekStartOptions = useMemo(
    () => [
      { value: "Sunday", label: nameOfDay(language || localeProp, 0) },
      { value: "Monday", label: nameOfDay(language || localeProp, 1) },
      { value: "Tuesday", label: nameOfDay(language || localeProp, 2) },
      { value: "Wednesday", label: nameOfDay(language || localeProp, 3) },
      { value: "Thursday", label: nameOfDay(language || localeProp, 4) },
      { value: "Friday", label: nameOfDay(language || localeProp, 5) },
      { value: "Saturday", label: nameOfDay(language || localeProp, 6) },
    ],
    [language, localeProp]
  );

  const userRoleOptions = [
    { value: "USER", label: t("user") },
    { value: "ADMIN", label: t("admin") },
  ];

  const identityProviderOptions = [
    { value: "CAL", label: "CAL" },
    { value: "GOOGLE", label: "GOOGLE" },
  ];

  const defaultLocale = defaultValues?.locale || defaultLocaleOption.value;

  const form = useForm<FormValues>({
    defaultValues: {
      avatarUrl: defaultValues?.avatarUrl || null,
      name: defaultValues?.name,
      username: defaultValues?.username,
      email: defaultValues?.email,
      bio: defaultValues?.bio,
      theme: defaultValues?.theme || null,
      defaultScheduleId: defaultValues?.defaultScheduleId || null,
      allowDynamicBooking: defaultValues?.allowDynamicBooking ?? true,
      locale: {
        value: defaultLocale,
        label: new Intl.DisplayNames(defaultLocale, { type: "language" }).of(defaultLocale) || "",
      },
      timeFormat: {
        value: defaultValues?.timeFormat || 12,
        label: timeFormatOptions.find((option) => option.value === defaultValues?.timeFormat)?.label || "12",
      },
      timeZone: defaultValues?.timeZone || "",
      weekStart: {
        value: defaultValues?.weekStart || weekStartOptions[0].value,
        label:
          weekStartOptions.find((option) => option.value === defaultValues?.weekStart)?.label ||
          weekStartOptions[0].label,
      },
      role: {
        value: defaultValues?.role || userRoleOptions[0].value,
        label:
          userRoleOptions.find((option) => option.value === defaultValues?.role)?.label ||
          userRoleOptions[0].label,
      },
      identityProvider: {
        value: defaultValues?.identityProvider || identityProviderOptions[0].value,
        label:
          identityProviderOptions.find((option) => option.value === defaultValues?.identityProvider)?.label ||
          identityProviderOptions[0].label,
      },
    },
  });

  return (
    <Form form={form} className="stack-y-4" handleSubmit={onSubmit}>
      <div className="flex items-center">
        <Controller
          control={form.control}
          name="avatarUrl"
          render={({ field: { value, onChange } }) => (
            <>
              <Avatar
                alt={form.getValues("name") || ""}
                imageSrc={getUserAvatarUrl({
                  avatarUrl: value,
                })}
                size="lg"
              />
              <div className="ml-4">
                <ImageUploader
                  target="avatar"
                  id="avatar-upload"
                  buttonMsg="Change avatar"
                  handleAvatarChange={onChange}
                  imageSrc={getUserAvatarUrl({
                    avatarUrl: value,
                  })}
                />
              </div>
            </>
          )}
        />
      </div>
      {defaultValues?.createdDate && (
        <div>
          <Label className="text-default font-medium">{t("member_since")}</Label>
          <div className="text-default mt-1 text-sm">
            {formatToLocalizedDate(new Date(defaultValues.createdDate), localeProp)}
          </div>
        </div>
      )}
      <Controller
        name="role"
        control={form.control}
        render={({ field: { onChange, value } }) => (
          <div>
            <Label className="text-default font-medium" htmlFor="role">
              {t("role")}
            </Label>
            <Select<{ label: string; value: string }>
              value={value}
              options={userRoleOptions}
              onChange={onChange}
            />
          </div>
        )}
      />
      <Controller
        name="identityProvider"
        control={form.control}
        render={({ field: { onChange, value } }) => (
          <div>
            <Label className="text-default font-medium" htmlFor="identityProvider">
              {t("identity_provider")}
            </Label>
            <Select<{ label: string; value: string }>
              value={value}
              options={identityProviderOptions}
              onChange={onChange}
            />
          </div>
        )}
      />
      <TextField label={t("name")} placeholder="example" required {...form.register("name")} />
      <TextField label={t("username")} placeholder="example" required {...form.register("username")} />
      <EmailField label={t("email")} placeholder="user@example.com" required {...form.register("email")} />
      <TextField label={t("about")} {...form.register("bio")} />
      <Controller
        name="locale"
        render={({ field: { value, onChange } }) => (
          <>
            <Label className="text-default">
              <>{t("language")}</>
            </Label>
            <Select<{ label: string; value: string }>
              className="capitalize"
              options={localeOptions}
              value={value}
              onChange={onChange}
            />
          </>
        )}
      />
      <Controller
        name="timeZone"
        control={form.control}
        render={({ field: { value } }) => (
          <>
            <Label className="text-default mt-8">
              <>{t("timezone")}</>
            </Label>
            <TimezoneSelect
              id="timezone"
              value={value}
              onChange={(event) => {
                if (event) form.setValue("timeZone", event.value);
              }}
            />
          </>
        )}
      />
      <Controller
        name="timeFormat"
        control={form.control}
        render={({ field: { value } }) => (
          <>
            <Label className="text-default mt-8">
              <>{t("time_format")}</>
            </Label>
            <Select
              value={timeFormatOptions.find((option) => option.value === (typeof value === "object" ? value?.value : value)) || value}
              options={timeFormatOptions}
              onChange={(event) => {
                if (event) form.setValue("timeFormat", { ...event });
              }}
            />
          </>
        )}
      />
      <Controller
        name="weekStart"
        control={form.control}
        render={({ field: { value } }) => (
          <>
            <Label className="text-default mt-8">
              <>{t("start_of_week")}</>
            </Label>
            <Select
              value={weekStartOptions.find((option) => option.value === (typeof value === "object" ? value?.value : value)) || value}
              options={weekStartOptions}
              onChange={(event) => {
                if (event) form.setValue("weekStart", { ...event });
              }}
            />
          </>
        )}
      />

      <br />
      <Button type="submit" color="primary">
        {t(submitLabel)}
      </Button>
    </Form>
  );
}

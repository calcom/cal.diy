"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { usePathname, useRouter } from "next/navigation";
import type { FormValues } from "../components/UserForm";
import { UserForm } from "../components/UserForm";

export default function UsersAddView() {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const utils = trpc.useUtils();

  const mutation = trpc.viewer.users.add.useMutation({
    onSuccess: async () => {
      showToast(t("user_added_successfully"), "success");
      await utils.viewer.users.list.invalidate();
      if (pathname !== null) {
        router.replace(pathname.replace("/add", ""));
      }
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        const fields = err.data?.fields as string[] | undefined;

        if (fields?.includes("email")) {
          showToast(t("user_with_email_already_exists"), "error");
          return;
        }

        if (fields?.includes("username")) {
          showToast(t("user_with_username_already_exists"), "error");
          return;
        }
        showToast(t("user_already_exists"), "error");
        return;
      }

      showToast(t("error_adding_user"), "error");
    },
  });

  return (
    <UserForm
      submitLabel="add"
      onSubmit={(values: FormValues) => {
        const data: Record<string, unknown> = {
          name: values.name,
          email: values.email,
          username: values.username,
          bio: values.bio,
          timeZone: values.timeZone,
          weekStart: values.weekStart?.value,
          theme: values.theme,
          defaultScheduleId: values.defaultScheduleId,
          locale: values.locale?.value,
          timeFormat: values.timeFormat?.value,
          allowDynamicBooking: values.allowDynamicBooking,
          identityProvider: values.identityProvider?.value,
          role: values.role?.value,
          avatarUrl: values.avatarUrl,
        };
        mutation.mutate(data as Parameters<typeof mutation.mutate>[0]);
      }}
    />
  );
}

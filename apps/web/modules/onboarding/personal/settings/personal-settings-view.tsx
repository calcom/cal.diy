"use client";

import { FULL_NAME_LENGTH_MAX_LIMIT } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { UserAvatar } from "@calcom/ui/components/avatar";
import { Button } from "@calcom/ui/components/button";
import { Label, TextArea, TextField } from "@calcom/ui/components/form";
import { ImageUploader } from "@calcom/ui/components/image-uploader";
import { showToast } from "@calcom/ui/components/toast";
import { UsernameAvailabilityField } from "@components/ui/UsernameAvailability";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { OnboardingCard } from "../../components/OnboardingCard";
import { OnboardingLayout } from "../../components/OnboardingLayout";
import { OnboardingBrowserView } from "../../components/onboarding-browser-view";
import { useOnboardingStore } from "../../store/onboarding-store";

type PersonalSettingsViewProps = {
  userEmail: string;
  userName?: string;
};

export const PersonalSettingsView = ({ userEmail, userName }: PersonalSettingsViewProps) => {
  const router = useRouter();
  const { t } = useLocale();
  const { data: user } = trpc.viewer.me.get.useQuery();
  const { personalDetails, setPersonalDetails } = useOnboardingStore();

  const avatarRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string>("");

  useEffect(() => {
    if (user) {
      setImageSrc(personalDetails.avatar || user.avatar || "");
    }
  }, [personalDetails.avatar, user]);

  const formSchema = z.object({
    name: z
      .string()
      .min(1, t("name_required"))
      .max(FULL_NAME_LENGTH_MAX_LIMIT, {
        message: t("max_limit_allowed_hint", { limit: FULL_NAME_LENGTH_MAX_LIMIT }),
      }),
    bio: z.string().optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: personalDetails.name || userName || "",
      bio: personalDetails.bio || "",
    },
  });

  const utils = trpc.useUtils();

  // Avatar mutation
  const avatarMutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async (data) => {
      showToast(t("your_user_profile_updated_successfully"), "success");
      setImageSrc(data.avatarUrl ?? "");
      setPersonalDetails({ avatar: data.avatarUrl ?? null });
    },
    onError: () => {
      showToast(t("problem_saving_user_profile"), "error");
    },
  });

  // Profile mutation
  const mutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.viewer.me.invalidate();
    },
  });

  async function updateProfileHandler(newAvatar: string) {
    avatarMutation.mutate({
      avatarUrl: newAvatar,
    });
  }

  const handleContinue = form.handleSubmit(async (data) => {
    // Save to store
    setPersonalDetails({
      name: data.name,
      bio: data.bio || "",
    });

    // Save to backend
    await mutation.mutateAsync({
      name: data.name,
      bio: data.bio || "",
    });

    router.push("/onboarding/personal/calendar");
  });

  if (!user) {
    return null;
  }

  return (
    <>
      <OnboardingLayout userEmail={userEmail} currentStep={1} totalSteps={2}>
        {/* Left column - Main content */}
        <OnboardingCard
          title={t("add_your_details")}
          subtitle={t("personal_details_subtitle")}
          footer={
            <div className="flex w-full items-center justify-end gap-4">
              <Button
                type="submit"
                form="personal-settings-form"
                color="primary"
                className="rounded-[10px]"
                loading={mutation.isPending}
                disabled={mutation.isPending || !form.formState.isValid}>
                {t("continue")}
              </Button>
            </div>
          }>
          <FormProvider {...form}>
            <form
              id="personal-settings-form"
              onSubmit={handleContinue}
              className="flex w-full flex-col gap-6 px-1">
              {/* Profile Picture */}
              <div className="flex w-full flex-col gap-2">
                <Label className="text-emphasis text-sm font-medium leading-4">{t("profile_picture")}</Label>
                <div className="flex flex-row items-center justify-start gap-2 rtl:justify-end">
                  {user && (
                    <div className="relative shrink-0">
                      <UserAvatar size="lg" user={user} previewSrc={imageSrc} />
                    </div>
                  )}
                  <input ref={avatarRef} type="hidden" name="avatar" id="avatar" defaultValue={imageSrc} />
                  <ImageUploader
                    target="avatar"
                    id="avatar-upload"
                    buttonMsg={t("upload")}
                    handleAvatarChange={(newAvatar) => {
                      if (avatarRef.current) {
                        avatarRef.current.value = newAvatar;
                      }
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype,
                        "value"
                      )?.set;
                      nativeInputValueSetter?.call(avatarRef.current, newAvatar);
                      const ev2 = new Event("input", { bubbles: true });
                      avatarRef.current?.dispatchEvent(ev2);
                      updateProfileHandler(newAvatar);
                    }}
                    imageSrc={imageSrc}
                  />
                </div>
                <p className="text-subtle text-xs font-normal leading-3">{t("onboarding_logo_size_hint")}</p>
              </div>

              {/* Name */}
              <div className="flex w-full flex-col gap-1.5">
                <TextField label={t("your_name")} {...form.register("name")} placeholder="John Doe" />
                {form.formState.errors.name && (
                  <p className="text-error text-sm">{form.formState.errors.name.message}</p>
                )}
              </div>

              {/* Username */}
              <div className="flex w-full flex-col gap-1.5">
                <UsernameAvailabilityField
                  onSuccessMutation={async () => {
                    // Refetch user to get updated username and save to store
                    const updatedUser = await utils.viewer.me.get.fetch();
                    if (updatedUser?.username) {
                      setPersonalDetails({ username: updatedUser.username });
                    }
                  }}
                />
              </div>

              {/* Bio */}
              <div className="flex w-full flex-col gap-1.5">
                <Label className="text-emphasis mb-0 text-sm font-medium leading-4">{t("bio")}</Label>
                <TextArea {...form.register("bio")} className="min-h-[108px] max-h-[150px]" />
                {form.formState.errors.bio && (
                  <p className="text-error text-sm">{form.formState.errors.bio.message}</p>
                )}
              </div>
            </form>
          </FormProvider>
        </OnboardingCard>

        {/* Right column - Browser view */}
        <OnboardingBrowserView
          avatar={imageSrc || personalDetails.avatar || user.avatar}
          name={form.watch("name") || personalDetails.name || user.name || undefined}
          bio={form.watch("bio") || personalDetails.bio || undefined}
          username={personalDetails.username || user.username || undefined}
        />
      </OnboardingLayout>
    </>
  );
};

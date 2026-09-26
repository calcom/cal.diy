"use client";

import { DubEmbed } from "@dub/embed-react";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";

import { IS_DUB_REFERRALS_ENABLED } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  SkeletonAvatar,
  SkeletonButton,
  SkeletonContainer,
  SkeletonText,
} from "@calcom/ui/components/skeleton";
import { showToast } from "@calcom/ui/components/toast";

const fetchReferralsToken = async () => {
  try {
    const response = await fetch("/api/user/referrals-token");

    if (!response.ok) {
      const { error } = await response.json();
      showToast(error, "error");
      return null;
    }

    const data = await response.json();

    return data.publicToken;
  } catch (error) {
    console.error("Error fetching referrals token:", error);
    return null;
  }
};

// The enabled referrals page implementation
export const DubReferralsPage = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useLocale();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const getToken = async () => {
      try {
        const publicToken = await fetchReferralsToken();
        setToken(publicToken);
      } catch (err) {
        console.error("Error fetching referrals token:", err);
        showToast(t("unexpected_error_try_again"), "error");
      } finally {
        setIsLoading(false);
      }
    };

    getToken();
  }, [t]);

  if (!IS_DUB_REFERRALS_ENABLED) {
    return null;
  }

  if (isLoading) {
    return (
      <SkeletonContainer className="mx-auto max-w-4xl">
        <div className="rounded-md p-8">
          <div className="mb-2 flex items-center">
            <SkeletonText className="h-5 w-32" />
          </div>

          <div className="mb-6 stack-y-2">
            <SkeletonText className="h-7 w-3/4" />
            <SkeletonText className="h-7 w-1/2" />
          </div>

          <div className="mb-6">
            <SkeletonText className="mb-2 h-5 w-24" />
            <div className="flex items-center space-x-2">
              <SkeletonText className="h-10 w-full rounded-md" />
              <SkeletonButton className="h-10 w-28 rounded-md" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 p-4">
          <div className="col-span-1">
            <div className="mb-4 grid grid-cols-3 gap-2 p-4">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="flex justify-center">
                  <SkeletonAvatar className="h-10 w-10 rounded-md" />
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <SkeletonText className="mb-2 h-6 w-full" />
              <SkeletonButton className="h-10 w-full rounded-md" />
            </div>
          </div>

          <div className="col-span-1">
            <div className="mb-[60px] flex justify-center p-4 md:mb-10">
              <SkeletonAvatar className="mt-10 h-16 w-16 rounded-full md:mt-7 md:h-24 md:w-24" />
            </div>
            <div className="px-4 pb-4">
              <SkeletonText className="mb-2 h-6 w-full" />
              <SkeletonButton className="h-10 w-full rounded-md" />
            </div>
          </div>

          <div className="col-span-1">
            <div className="mb-[60px] flex justify-center p-4 md:mb-10">
              <SkeletonAvatar className="mt-10 h-16 w-16 rounded-md md:mt-7 md:h-24 md:w-24" />
            </div>
            <div className="px-4 pb-4">
              <SkeletonText className="mb-2 h-6 w-full" />
              <SkeletonButton className="h-10 w-full rounded-md" />
            </div>
          </div>
        </div>
      </SkeletonContainer>
    );
  }

  if (!token) {
    return null;
  }

  const theme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <DubEmbed
      data="referrals"
      token={token}
      options={{
        theme,
        themeOptions: {
          backgroundColor: `${theme === "dark" ? "#0F0F0F" : "#FFFFFF"}`,
        },
      }}
    />
  );
};

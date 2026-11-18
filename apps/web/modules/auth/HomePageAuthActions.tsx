"use client";

import { Button } from "@calcom/ui/components/button";
import { signOutFromCal } from "@calcom/web/modules/auth/signOut";

type HomePageAuthActionsProps = {
  isAuthenticated: boolean;
  signInLabel: string;
  signOutLabel: string;
};

export default function HomePageAuthActions({
  isAuthenticated,
  signInLabel,
  signOutLabel,
}: HomePageAuthActionsProps) {
  if (!isAuthenticated) {
    return (
      <Button href="/auth/login" color="secondary">
        {signInLabel}
      </Button>
    );
  }

  return (
    <Button color="secondary" onClick={() => signOutFromCal("/")}>
      {signOutLabel}
    </Button>
  );
}

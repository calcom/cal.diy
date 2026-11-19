"use client";

import Logo from "@devx-agency/werko-ui/components/Logo";
import { signIn } from "next-auth/react";
import { useEffect, useRef } from "react";

export default function AuthentikRedirect({ callbackUrl }: { callbackUrl: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signIn("authentik", { callbackUrl });
  }, [callbackUrl]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-deep-blue text-white">
      <Logo className="h-16 w-auto animate-pulse" />
    </main>
  );
}

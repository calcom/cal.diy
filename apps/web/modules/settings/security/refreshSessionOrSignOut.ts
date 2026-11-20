import { signOut } from "next-auth/react";
import type { Session } from "next-auth";

export async function refreshSessionOrSignOut(update: () => Promise<Session | null>) {
  try {
    const updatedSession = await update();
    if (!updatedSession) {
      throw new Error("Session refresh returned no session");
    }
  } catch (error) {
    console.error("Failed to refresh the session after a security change", error);
    await signOut({ callbackUrl: "/auth/login" });
  }
}

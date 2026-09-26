"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AppShell } from "../AppShell";
import { Lock } from "../Icons";
import { api } from "@/lib/api";

export function PasscodeGate({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth", { method: "POST", json: { passcode } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock");
      setBusy(false);
    }
  };

  return (
    <AppShell active="/executive">
      <div className="lock">
        <form className="card lock-card" onSubmit={submit}>
          <div className="lock-orb">
            <Lock size={34} />
          </div>
          <p className="eyebrow">Executive admin</p>
          <h1 style={{ fontWeight: 700, fontSize: 24, margin: "8px 0 6px", letterSpacing: "-0.04em" }}>
            Z &amp; XOE only
          </h1>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 20px" }}>
            Enter the admin password to edit the schedule.
          </p>
          {configured ? (
            <>
              <input
                className="input"
                type="password"
                placeholder="Password"
                aria-label="Admin password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                style={{ textAlign: "center", height: 48 }}
              />
              {error && (
                <p style={{ color: "var(--danger)", fontSize: 12, margin: "10px 0 0" }} role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-block"
                style={{ marginTop: 14 }}
                disabled={busy || !passcode}>
                {busy ? <span className="spinner" /> : "Unlock"}
              </button>
            </>
          ) : (
            <div className="banner warn" role="alert">
              Admin access is locked until EXECUTIVE_PASSCODE is set in the Vercel project settings.
            </div>
          )}
          <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>
            Booking a call? Use the Team tab.
          </p>
        </form>
      </div>
    </AppShell>
  );
}

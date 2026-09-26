"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Lock } from "../Icons";
import { TopBar } from "../TopBar";
import { api } from "@/lib/api";

export function PasscodeGate() {
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
    <div className="shell">
      <TopBar active="/executive" />
      <div className="lock">
        <form className="card lock-card" onSubmit={submit}>
          <div className="lock-orb">
            <Lock size={34} />
          </div>
          <p className="eyebrow">Executive view</p>
          <h1 style={{ fontWeight: 300, fontSize: 28, margin: "6px 0 18px", letterSpacing: "-0.02em" }}>
            Welcome back, Z
          </h1>
          <input
            className="input"
            type="password"
            placeholder="Passcode"
            aria-label="Passcode"
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={{ textAlign: "center", borderRadius: 999, height: 48 }}
          />
          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }} role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-dark btn-block"
            style={{ marginTop: 14 }}
            disabled={busy || !passcode}>
            {busy ? <span className="spinner" /> : "Unlock"}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            Looking to book a call? Head to the Team tab.
          </p>
        </form>
      </div>
    </div>
  );
}

"use client";

import { type ReactNode, useState } from "react";
import { Check, Google, Lock, Mail, Sparkle } from "../Icons";
import type { AppStatus } from "@/lib/types";

export function Integrations({
  status,
  onLoadSample,
}: {
  status: AppStatus | null;
  onLoadSample: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!status) return null;

  const copyTeamLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/team`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy the team link", `${window.location.origin}/team`);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Row
        icon={<Google />}
        title="Google Calendar"
        detail={
          status.google.connected
            ? "Booked calls land in your calendar with a Meet link."
            : status.google.configured
              ? "Connect so bookings appear in your calendar."
              : "Add GOOGLE_CLIENT_ID & SECRET to enable."
        }
        action={
          status.google.connected ? (
            <span className="tag">
              <Check size={12} /> On
            </span>
          ) : status.google.configured ? (
            <a className="btn btn-primary btn-sm" href="/api/google/connect">
              Connect
            </a>
          ) : null
        }
      />
      <Row
        icon={<Mail />}
        title="Booking invites"
        detail={
          status.invites.recipients.length
            ? `Sent to ${status.invites.recipients.join(" & ")}${
                status.google.connected || status.invites.email ? "" : " once Google or email is set up"
              }.`
            : "Set Z_EMAIL and XOE_EMAIL."
        }
        action={status.google.connected || status.invites.email ? <span className="tag">On</span> : null}
      />
      <Row
        icon={<Sparkle />}
        title="Brain dump AI"
        detail={
          status.ai ? "Claude structures your notes." : "Offline parser. Add ANTHROPIC_API_KEY for Claude."
        }
        action={status.ai ? <span className="tag">On</span> : null}
      />
      {!status.passcodeSet && (
        <div className="banner warn">
          <Lock size={16} /> Dev mode: no EXECUTIVE_PASSCODE set. Production stays locked until it is.
        </div>
      )}
      {status.storage === "memory" && (
        <div className="banner warn">
          Demo storage: data resets on redeploy. Add Upstash Redis (Vercel → Storage) to keep it.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-soft btn-sm" onClick={copyTeamLink}>
          {copied ? "Copied!" : "Copy team link"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLoadSample}>
          Load sample week
        </button>
      </div>
    </div>
  );
}

function Row({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action: ReactNode;
}) {
  return (
    <div className="connection">
      <span className="icon-btn sm">{icon}</span>
      <div className="connection-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {action}
    </div>
  );
}

import process from "node:process";
import { isENVDev } from "@calcom/lib/env";
import type SendmailTransport from "nodemailer/lib/sendmail-transport";
import type SMTPConnection from "nodemailer/lib/smtp-connection";
import { getAdditionalEmailHeaders } from "./getAdditionalEmailHeaders";

function detectTransport(): SendmailTransport.Options | SMTPConnection.Options | string {
  if (process.env.RESEND_API_KEY) {
    const transport = {
      host: "smtp.resend.com",
      secure: true,
      port: 465,
      auth: {
        user: "resend",
        pass: process.env.RESEND_API_KEY,
      },
    };

    return transport;
  }

  if (process.env.EMAIL_SERVER) {
    return process.env.EMAIL_SERVER;
  }

  if (process.env.EMAIL_SERVER_HOST) {
    const port = parseInt(process.env.EMAIL_SERVER_PORT || "");
    const auth =
      process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD
        ? {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD,
          }
        : undefined;

    const transport = {
      host: process.env.EMAIL_SERVER_HOST,
      port,
      auth,
      secure: port === 465,
      tls: {
        rejectUnauthorized: !isENVDev,
      },
    };

    return transport;
  }

  return {
    sendmail: true,
    newline: "unix",
    path: "/usr/sbin/sendmail",
  };
}

export const serverConfig = {
  transport: detectTransport(),
  from: process.env.EMAIL_FROM,
  headers: getAdditionalEmailHeaders()[process.env.EMAIL_SERVER_HOST || ""] || undefined,
};

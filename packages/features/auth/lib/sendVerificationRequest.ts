import { readFileSync } from "node:fs";
import Handlebars from "handlebars";
import type { SendVerificationRequestParams } from "next-auth/providers/email";
import nodemailer from "nodemailer";
import path from "node:path";

import { APP_NAME, WEBAPP_URL } from "@calcom/lib/constants";
import { serverConfig } from "@calcom/lib/serverConfig";

const transporter = nodemailer.createTransport(serverConfig.transport);

const sendVerificationRequest = async ({
  identifier,
  url,
}: Pick<SendVerificationRequestParams, "identifier" | "url">) => {
  const emailsDir = path.resolve(process.cwd(), "..", "..", "packages/emails", "templates");
  const originalUrl = new URL(url);
  const webappUrl = new URL(process.env.NEXTAUTH_URL || WEBAPP_URL);
  if (originalUrl.origin !== webappUrl.origin) {
    url = url.replace(originalUrl.origin, webappUrl.origin);
  }
  const emailFile = readFileSync(path.join(emailsDir, "confirm-email.html"), {
    encoding: "utf8",
  });
  const emailTemplate = Handlebars.compile(emailFile);
  // async transporter
  transporter.sendMail({
    from: `${process.env.EMAIL_FROM}` || APP_NAME,
    to: identifier,
    subject: `Your sign-in link for ${APP_NAME}`,
    html: emailTemplate({
      base_url: WEBAPP_URL,
      signin_url: url,
      email: identifier,
    }),
  });
};

export default sendVerificationRequest;

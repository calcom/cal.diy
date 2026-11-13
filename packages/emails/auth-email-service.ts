import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { EmailVerifyLink } from "./templates/account-verify-email";
import AccountVerifyEmail from "./templates/account-verify-email";
import type { EmailVerifyCode } from "./templates/attendee-verify-email";
import AttendeeVerifyEmail from "./templates/attendee-verify-email";
import type { ChangeOfEmailVerifyLink } from "./templates/change-account-email-verify";
import ChangeOfEmailVerifyEmail from "./templates/change-account-email-verify";
import type { PasswordReset } from "./templates/forgot-password-email";
import ForgotPasswordEmail from "./templates/forgot-password-email";

const sendEmail = (prepare: () => BaseEmail) => {
  return new Promise((resolve, reject) => {
    try {
      const email = prepare();
      resolve(email.sendEmail());
    } catch (e) {
      reject(console.error(`${prepare.constructor.name}.sendEmail failed`, e));
    }
  });
};

export const sendPasswordResetEmail = async (passwordResetEvent: PasswordReset) => {
  await sendEmail(() => new ForgotPasswordEmail(passwordResetEvent));
};

export const sendEmailVerificationLink = async (verificationInput: EmailVerifyLink) => {
  await sendEmail(() => new AccountVerifyEmail(verificationInput));
};

export const sendEmailVerificationCode = async (verificationInput: EmailVerifyCode) => {
  await sendEmail(() => new AttendeeVerifyEmail(verificationInput));
};

export const sendChangeOfEmailVerificationLink = async (verificationInput: ChangeOfEmailVerifyLink) => {
  await sendEmail(() => new ChangeOfEmailVerifyEmail(verificationInput));
};

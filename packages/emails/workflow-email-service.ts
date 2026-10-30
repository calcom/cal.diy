import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { MonthlyDigestEmailData } from "./src/templates/MonthlyDigestEmail";
import type { IBookingRedirect } from "./templates/booking-redirect-notification";
import BookingRedirectEmailNotification from "./templates/booking-redirect-notification";
import type { Feedback } from "./templates/feedback-email";
import FeedbackEmail from "./templates/feedback-email";
import MonthlyDigestEmail from "./templates/monthly-digest-email";

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

export const sendFeedbackEmail = async (feedback: Feedback) => {
  await sendEmail(() => new FeedbackEmail(feedback));
};

export const sendMonthlyDigestEmail = async (eventData: MonthlyDigestEmailData) => {
  await sendEmail(() => new MonthlyDigestEmail(eventData));
};

export const sendBookingRedirectNotification = async (bookingRedirect: IBookingRedirect) => {
  await sendEmail(() => new BookingRedirectEmailNotification(bookingRedirect));
};

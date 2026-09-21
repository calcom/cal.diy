import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import type { IBookingRedirect } from "../lib/types/booking-redirect-types";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export type { IBookingRedirect } from "../lib/types/booking-redirect-types";

export default class BookingRedirectNotification extends BaseEmail {
  bookingRedirect: IBookingRedirect;

  constructor(bookingRedirect: IBookingRedirect) {
    super();
    this.name = "BOOKING_REDIRECT_NOTIFICATION";
    this.bookingRedirect = bookingRedirect;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      to: `${this.bookingRedirect.toName} <${this.bookingRedirect.toEmail}>`,
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      subject: this.bookingRedirect.language(
        {
          add: "booking_redirect_email_subject",
          update: "booking_redirect_updated_email_subject",
          cancel: "booking_redirect_cancelled_email_subject",
        }[this.bookingRedirect.action]
      ),
      html: await renderEmail("BookingRedirectEmailNotification", {
        ...this.bookingRedirect,
      }),
      text: "",
    };
  }
}

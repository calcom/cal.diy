import process from "node:process";
import { EMAIL_FROM_NAME } from "@calcom/lib/constants";
import renderEmail from "../src/renderEmail";
import BaseEmail from "./_base-email";

export interface Feedback {
  username: string;
  email: string;
  rating: string;
  comment: string;
}

export default class FeedbackEmail extends BaseEmail {
  feedback: Feedback;

  constructor(feedback: Feedback) {
    super();
    this.feedback = feedback;
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      from: `${EMAIL_FROM_NAME} <${this.getMailerOptions().from}>`,
      to: process.env.SEND_FEEDBACK_EMAIL,
      subject: `User Feedback`,
      html: await renderEmail("FeedbackEmail", this.feedback),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(): string {
    return `
User: ${this.feedback.username}
Email: ${this.feedback.email}
Rating: ${this.feedback.rating}
Comment: ${this.feedback.comment}
    `;
  }
}

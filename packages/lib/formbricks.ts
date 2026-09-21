import process from "node:process";
import type { Feedback } from "@calcom/emails/templates/feedback-email";
import { FormbricksAPI } from "@formbricks/api";

enum Rating {
  "Extremely unsatisfied" = 1,
  Unsatisfied = 2,
  Satisfied = 3,
  "Extremely satisfied" = 4,
}

export const sendFeedbackFormbricks = async (userId: number, feedback: Feedback) => {
  if (!process.env.NEXT_PUBLIC_FORMBRICKS_HOST_URL || !process.env.NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID)
    throw new Error("Missing FORMBRICKS_HOST_URL or FORMBRICKS_ENVIRONMENT_ID env variable");
  const api = new FormbricksAPI({
    apiHost: process.env.NEXT_PUBLIC_FORMBRICKS_HOST_URL,
    environmentId: process.env.NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID,
  });
  if (process.env.FORMBRICKS_FEEDBACK_SURVEY_ID) {
    const formbricksUserId = userId.toString();
    const ratingValue = Object.keys(Rating).includes(feedback.rating)
      ? Rating[feedback.rating as keyof typeof Rating]
      : undefined;
    if (ratingValue === undefined) throw new Error("Invalid rating value");

    await api.client.response.create({
      surveyId: process.env.FORMBRICKS_FEEDBACK_SURVEY_ID,
      userId: formbricksUserId,
      finished: true,
      data: {
        "formbricks-share-comments-question": feedback.comment,
        "formbricks-rating-question": ratingValue,
      },
    });
    await api.client.people.update(formbricksUserId, {
      attributes: {
        email: feedback.email,
        username: feedback.username,
      },
    });
  }
};

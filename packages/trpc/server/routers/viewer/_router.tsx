import { router } from "../../trpc";
import { featureFlagRouter } from "../features/_router";
import { loggedInViewerRouter } from "../loggedInViewer/_router";
import { publicViewerRouter } from "../publicViewer/_router";
import { timezonesRouter } from "../publicViewer/timezones/_router";
import { adminRouter } from "./admin/_router";
import { apiKeysRouter } from "./apiKeys/_router";
import { appsRouter } from "./apps/_router";
import { authRouter } from "./auth/_router";
import { availabilityRouter } from "./availability/_router";
import { bookingsRouter } from "./bookings/_router";
import { calendarsRouter } from "./calendars/_router";
import { calVideoRouter } from "./calVideo/_router";
import { credentialsRouter } from "./credentials/_router";
import { deploymentSetupRouter } from "./deploymentSetup/_router";
import { eventTypesRouter } from "./eventTypes/_router";
import { eventTypesRouter as heavyEventTypesRouter } from "./eventTypes/heavy/_router";
import { feedbackRouter } from "./feedback/_router";
import { googleWorkspaceRouter } from "./googleWorkspace/_router";
import { holidaysRouter } from "./holidays/_router";
import { i18nRouter } from "./i18n/_router";
import { meRouter } from "./me/_router";
import { oAuthRouter } from "./oAuth/_router";
import { oooRouter } from "./ooo/_router";
import { paymentsRouter } from "./payments/_router";
import { slotsRouter } from "./slots/_router";
import { travelSchedulesRouter } from "./travelSchedules/_router";
import { userAdminRouter } from "./users/_router";
import { webhookRouter } from "./webhook/_router";

export const viewerRouter = router({
  loggedInViewerRouter,
  apps: appsRouter,
  me: meRouter,
  public: publicViewerRouter,
  auth: authRouter,
  deploymentSetup: deploymentSetupRouter,
  bookings: bookingsRouter,
  calendars: calendarsRouter,
  calVideo: calVideoRouter,
  credentials: credentialsRouter,
  eventTypes: eventTypesRouter,
  eventTypesHeavy: heavyEventTypesRouter,
  availability: availabilityRouter,
  timezones: timezonesRouter,
  webhook: webhookRouter,
  slots: slotsRouter,
  payments: paymentsRouter,
  i18n: i18nRouter,
  features: featureFlagRouter,
  feedback: feedbackRouter,
  users: userAdminRouter,
  oAuth: oAuthRouter,
  googleWorkspace: googleWorkspaceRouter,
  admin: adminRouter,
  apiKeys: apiKeysRouter,
  ooo: oooRouter,
  holidays: holidaysRouter,
  travelSchedules: travelSchedulesRouter,
});

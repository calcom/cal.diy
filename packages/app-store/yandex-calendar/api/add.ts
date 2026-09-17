import { z } from "zod";

import { AppDeclarativeHandler } from "@calcom/types/AppHandler";

import appConfig from "../config.json";
import { bodySchema, setupYandexCalendar } from "./setup";

const handler: AppDeclarativeHandler<z.infer<typeof bodySchema>> = {
  appType: appConfig.type,
  variant: appConfig.variant,
  slug: appConfig.slug,
  supportsMultipleInstalls: false,
  handlerType: "add",
  // By default, redirect to the setup page for the app, the createCrential
  // prop will allow us to customize the redirect behaviour
  redirect: {
    newTab: false,
    url: "/apps/yandex-calendar/setup",
  },
  // The validator will be used for the body during the POST request.
  // Although no config specifically mentions POST, but it's inferred from the presence
  // of the body in the request
  validators: {
    bodySchema,
  },
  // When the method is
  createCredential: setupYandexCalendar,
};

export default handler;

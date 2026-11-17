// Cal.com declarative app handler API: https://github.com/calcom/cal.diy/blob/main/packages/types/AppHandler.d.ts
import { createDefaultInstallation } from "@calcom/app-store/_utils/installation";
import type { AppDeclarativeHandler } from "@calcom/types/AppHandler";
import appConfig from "../config.json";

const handler: AppDeclarativeHandler = {
  appType: appConfig.type,
  variant: appConfig.variant,
  slug: appConfig.slug,
  supportsMultipleInstalls: false,
  handlerType: "add",
  createCredential: ({
    appType,
    user,
    slug,
    teamId,
  }: Parameters<AppDeclarativeHandler["createCredential"]>[0]) =>
    createDefaultInstallation({ appType, user, slug, key: {}, teamId }),
};

export default handler;

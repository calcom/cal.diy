import { DynamicComponent } from "@calcom/app-store/_components/DynamicComponent";
import dynamic from "next/dynamic";

export const AppSetupMap = {
  alby: dynamic(() => import("@calcom/web/components/apps/alby/Setup")),
  "apple-calendar": dynamic(() => import("@calcom/web/components/apps/applecalendar/Setup")),
  exchange: dynamic(() => import("@calcom/web/components/apps/exchangecalendar/Setup")),
  "exchange2013-calendar": dynamic(() => import("@calcom/web/components/apps/exchange2013calendar/Setup")),
  "exchange2016-calendar": dynamic(() => import("@calcom/web/components/apps/exchange2016calendar/Setup")),
  "caldav-calendar": dynamic(() => import("@calcom/web/components/apps/caldavcalendar/Setup")),
  "ics-feed": dynamic(() => import("@calcom/web/components/apps/ics-feedcalendar/Setup")),
  make: dynamic(() => import("@calcom/web/components/apps/make/Setup")),
  sendgrid: dynamic(() => import("@calcom/web/components/apps/sendgrid/Setup")),
  stripe: dynamic(() => import("@calcom/web/components/apps/stripepayment/Setup")),
  paypal: dynamic(() => import("@calcom/web/components/apps/paypal/Setup")),
  hitpay: dynamic(() => import("@calcom/web/components/apps/hitpay/Setup")),
  btcpayserver: dynamic(() => import("@calcom/web/components/apps/btcpayserver/Setup")),
  "yandex-calendar": dynamic(() => import("@calcom/app-store/yandex-calendar/components/Setup")),
};

export const AppSetupPage = (props: { slug: string }) => {
  return <DynamicComponent<typeof AppSetupMap> componentMap={AppSetupMap} {...props} />;
};

export default AppSetupPage;

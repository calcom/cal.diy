import PageWrapper from "@components/PageWrapperAppDir";
import { Archivo } from "next/font/google";
import { headers } from "next/headers";
import PortalFooter from "../(werko)/_components/PortalFooter";
import PortalHeaderView from "../(werko)/_components/PortalHeaderView";
import WerkoFrame from "../(werko)/_components/WerkoFrame";
import { getPortalUser } from "../(werko)/_lib/portalUser";

import "./werko-theme.css";

const archivo = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-archivo", display: "swap" });
const fontVariables = `:root:has([data-werko-booking]) { --font-sans: ${archivo.style.fontFamily}, system-ui; --font-cal: ${archivo.style.fontFamily}, system-ui; }`;

export default async function BookingPageWrapperLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const nonce = h.get("x-csp-nonce") ?? undefined;
  const user = await getPortalUser();

  return (
    <>
      <div data-werko-booking hidden />
      <style nonce={nonce}>{fontVariables}</style>
      <PageWrapper isBookingPage={true} requiresLicense={false} nonce={nonce}>
        <WerkoFrame
          header={<PortalHeaderView user={user} />}
          footer={<PortalFooter />}
          className={archivo.variable}>
          {children}
        </WerkoFrame>
      </PageWrapper>
    </>
  );
}

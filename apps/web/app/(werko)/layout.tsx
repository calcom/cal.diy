import type React from "react";
import PortalFooter from "./_components/PortalFooter";
import PortalHeaderView from "./_components/PortalHeaderView";
import { archivo, archivoNarrow } from "./_lib/fonts";
import { getPortalUser } from "./_lib/portalUser";

export default async function WerkoLayout({ children }: { children: React.ReactNode }) {
  const user = await getPortalUser();

  return (
    <div
      className={`${archivo.variable} ${archivoNarrow.variable} flex min-h-screen flex-col bg-deep-blue font-werko text-s text-white antialiased`}>
      <PortalHeaderView user={user} />
      {children}
      <PortalFooter />
    </div>
  );
}

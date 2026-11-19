import type React from "react";
import { keepClientsInPortal } from "../_lib/clientGuard";

/** Layout for Cal.diy admin sections: clients are redirected to their Werk|0 bookings */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  await keepClientsInPortal();
  return <>{children}</>;
}

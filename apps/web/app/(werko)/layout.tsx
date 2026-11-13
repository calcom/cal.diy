import { Archivo, Archivo_Narrow } from "next/font/google";
import type React from "react";
import PortalFooter from "./_components/PortalFooter";
import PortalHeader from "./_components/PortalHeader";

// Werk|0 fonts; the design system reads them from these CSS variables
const archivo = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-archivo", display: "swap" });
const archivoNarrow = Archivo_Narrow({
  subsets: ["latin", "latin-ext"],
  weight: "700",
  variable: "--font-archivo-narrow",
  display: "swap",
});

/** Werk|0-branded booking portal (rezervace.werko.cz), separate from the Cal.diy admin UI */
export default function WerkoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${archivo.variable} ${archivoNarrow.variable} flex min-h-screen flex-col bg-deep-blue font-werko text-s text-white antialiased`}>
      <PortalHeader />
      {children}
      <PortalFooter />
    </div>
  );
}

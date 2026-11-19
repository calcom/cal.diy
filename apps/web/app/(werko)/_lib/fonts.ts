import { Archivo, Archivo_Narrow } from "next/font/google";

export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo",
  display: "swap",
});

export const archivoNarrow = Archivo_Narrow({
  subsets: ["latin", "latin-ext"],
  weight: "700",
  variable: "--font-archivo-narrow",
  display: "swap",
});

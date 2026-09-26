import type { Metadata, Viewport } from "next";
import { Urbanist } from "next/font/google";
import { ToastProvider } from "@/components/Toasts";

import "./globals.css";

const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Z × XOE Calendar",
  description: "Z's schedule and team booking — only free time is shared.",
  appleWebApp: { capable: true, title: "Z × XOE", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E6EAE7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

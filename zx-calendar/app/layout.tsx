import type { Metadata, Viewport } from "next";
import { Space_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toasts";

import "./globals.css";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Z × XOE Calendar",
  description: "Z's schedule and team booking — only free time is shared.",
  appleWebApp: { capable: true, title: "Z × XOE", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#04071A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceMono.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

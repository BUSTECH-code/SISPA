import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const viewport: Viewport = {
  themeColor: "#d97706",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "SISPA — Smart stock and buying assistant for building-material distributors and wholesalers",
  description: "Smart stock and buying assistant for building-material distributors and wholesalers",
  applicationName: "SISPA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SISPA",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "SISPA — Smart stock and buying assistant",
    description: "Smart stock and buying assistant for building-material distributors and wholesalers",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased font-sans">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}


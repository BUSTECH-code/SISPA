import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SISPA 1.0 — Smart Stock & Buying Assistant",
  description: "Tell me what I need to buy before I run out. Simple stock and buying assistant for building-material distributors and wholesalers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}

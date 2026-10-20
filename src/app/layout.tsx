import type { Metadata } from "next";
import { Overpass, Overpass_Mono, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Toaster } from "@/ui/primitives";
import { THEME_INIT_SCRIPT } from "@/ui/theme/themeScript";
import "./globals.css";

const sans = Overpass({ subsets: ["latin"], display: "swap", variable: "--font-overpass" });
const serif = Source_Serif_4({ subsets: ["latin"], display: "swap", variable: "--font-source-serif" });
const mono = Overpass_Mono({ subsets: ["latin"], display: "swap", variable: "--font-overpass-mono" });

export const metadata: Metadata = {
  title: { default: "ArrivalGuard", template: "%s | ArrivalGuard" },
  description:
    "An AI agent that pays a student's international tuition inside the limits their family sets. Simulated funds and a fictional university.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce de la CSP de esta respuesta (src/proxy.ts): el único script en línea, el del tema, lo lleva.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

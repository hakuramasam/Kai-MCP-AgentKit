import "@/app/globals.css";
import { ThemeClient } from "@/components/theme-client";
import { ProvidersAndInitialization } from "@/features/app/providers-and-initialization";
import { MainNav } from "@/components/nav/main-nav";
import { Caveat, Geist, Geist_Mono, Patrick_Hand } from "next/font/google";
import { ReactNode } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  weight: "400",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeClient />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} ${patrickHand.variable} antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <header className="border-b bg-background">
            <div className="container mx-auto px-4 py-4">
              <MainNav />
            </div>
          </header>
          <main className="flex-1">
            <ProvidersAndInitialization>{children}</ProvidersAndInitialization>
          </main>
        </div>
      </body>
    </html>
  );
}

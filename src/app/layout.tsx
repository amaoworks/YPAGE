import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/db/store";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

function themeClass(stored: string | undefined, fallback: "light" | "dark" | "system"): string {
  const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : fallback;
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return "";
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = getSettings();
    return {
      title: { default: settings.siteTitle, template: `%s · ${settings.siteTitle}` },
      description: settings.siteSubtitle,
    };
  } catch {
    return { title: "YPAGE", description: "个人项目导航" };
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  let theme = "";
  try {
    const stored = (await cookies()).get("ypage-theme")?.value;
    theme = themeClass(stored, getSettings().defaultTheme);
  } catch {
    theme = "";
  }

  return (
    <html lang="zh-CN" className={`${sans.variable} ${mono.variable} ${theme}`.trim()} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

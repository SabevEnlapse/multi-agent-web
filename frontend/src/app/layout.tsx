import type { Metadata } from "next";
import { Geist, Geist_Mono, Merriweather } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Automated Market Research Crew",
  description: "Multi-agent market research platform (Next.js + FastAPI + Tavily + Alpha Vantage)",
};

/**
 * Root Layout Component
 *
 * Wraps the entire application.
 * - Sets up global fonts (Geist Sans/Mono).
 * - Applies global CSS.
 * - Enforces dark mode by default via the `dark` class on the body.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${merriweather.variable} antialiased dark`}>
        {children}
      </body>
    </html>
  );
}

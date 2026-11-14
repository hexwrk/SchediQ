import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { THEME_SCRIPT } from "@/lib/theme";
import { ThemeSync } from "@/lib/theme-toggle";
import "./globals.css";

// Inter is the demo's typeface; exposed as --font-inter for globals.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SchediQ",
  description: "AI-assisted study scheduling for students",
  applicationName: "SchediQ",
  // iOS ignores the web manifest's icons; it reads apple-touch-icon instead.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SchediQ", statusBarStyle: "default" },
};

// Phone layout: device width, and the browser/OS chrome tinted to the brand colour.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser/OS chrome follows the OS scheme (the manifest keeps the brand colour).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3454d1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme defaults to light for the server HTML; the inline script in
    // <head> replaces it with the saved / OS theme before first paint.
    // suppressHydrationWarning: React must keep the attribute the script set.
    <html lang="en" data-theme="light" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeSync />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

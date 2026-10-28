import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
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
  themeColor: "#3454d1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

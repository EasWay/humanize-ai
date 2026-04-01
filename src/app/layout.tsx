import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "humanize.ai — Free AI Text Humanizer",
  description:
    "Free, open AI text humanizer. Paste AI-generated text, get human-sounding output. No accounts, no tracking, no limits. Powered by Llama 3.3 70B.",
  keywords: ["ai humanizer", "ai detector bypass", "humanize ai text", "free ai humanizer"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

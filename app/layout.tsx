import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DataOps Console",
  description:
    "Monitor dataset-generation projects: throughput, quality, annotator performance, and timeline burndown — with Claude-powered status digests and risk flags.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="grid place-items-center h-7 w-7 rounded-md bg-accent/15 text-accent font-mono text-sm font-bold">
                D
              </span>
              <span className="font-semibold tracking-tight group-hover:text-white">
                DataOps Console
              </span>
            </Link>
            <span className="text-xs text-muted">
              Dataset-generation operations
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

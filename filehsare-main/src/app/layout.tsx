import type { Metadata } from "next";
import "./globals.css";
import QueryProvider from "@/providers/QueryProvider";

export const metadata: Metadata = {
  title: "GhostShare | Ephemeral Self-Destructing File Sharing",
  description:
    "Upload files directly from your browser to secure private storage. Set downloads limit, add password protection, and let files self-destruct instantly.",
  keywords: "file sharing, anonymous upload, ephemeral files, secure files, self-destructing files",
  authors: [{ name: "GhostShare Inc." }],
  openGraph: {
    title: "GhostShare - Ephemeral File Sharing",
    description: "Secure, direct-to-storage, self-destructing file sharing.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}

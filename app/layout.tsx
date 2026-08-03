import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDIAGD",
  description: "Every Day Is A Good Day",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="ediagd-app min-h-full">{children}</body>
    </html>
  );
}

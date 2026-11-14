import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LectureGraph",
  description: "Evidence-based course study workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

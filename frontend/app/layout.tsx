import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-inner">
              <a href="/courses" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="6" cy="6" r="2.5" />
                    <circle cx="18" cy="7" r="2.5" />
                    <circle cx="12" cy="18" r="2.5" />
                    <path d="M8.2 7.2 15.5 7" />
                    <path d="M7.3 8.1 10.7 15.8" />
                    <path d="M16.7 9.1 13.3 15.8" />
                  </svg>
                </span>
                <span className="brand-text">
                  <span className="brand-name">LectureGraph</span>
                  <span className="brand-tag">Study Workspace</span>
                </span>
              </a>
              <nav className="topbar-nav" aria-label="Workspace navigation">
                <a href="/courses" className="topbar-link">
                  Courses
                </a>
                <span className="workspace-pill">
                  <span className="workspace-dot" aria-hidden="true" />
                  Local Demo
                </span>
              </nav>
            </div>
          </header>
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}

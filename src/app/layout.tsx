import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { EmergencyProvider } from "@/components/EmergencyProvider";
import { FaceNotifier } from "@/components/FaceNotifier";
import { GateControl } from "@/components/GateControl";
import { Header } from "@/components/Header";
import { NewCarNotifier } from "@/components/NewCarNotifier";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { Sidebar } from "@/components/Sidebar";
import { StickyMessages } from "@/components/StickyMessages";
import { BackToTop } from "@/components/ui/BackToTop";
import { getCurrentUser } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "רעם — ניהול דיירים",
  description: "מערכת ניהול דיירים — רעם בטחון",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [preferences, currentUser, cookieStore] = await Promise.all([
    getPreferences(),
    getCurrentUser(),
    cookies(),
  ]);
  const isDark = cookieStore.get("theme")?.value === "dark";

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} h-full antialiased${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider user={currentUser}>
          <PreferencesProvider initial={preferences} currentUser={currentUser}>
            {currentUser ? (
              <EmergencyProvider>
                <Header lobbyistName={currentUser.lobbyist_name} isDark={isDark} />
                <div className="flex-1 flex min-h-0">
                  <Sidebar />
                  {/* pb is extra-deep so the fixed bottom overlays (gate
                      drawer + BackToTop) never sit over page content and eat
                      its clicks (e.g. the pagination buttons). */}
                  <main className="flex-1 overflow-auto p-6 pb-32">{children}</main>
                </div>
                {/* Top-left stack: transient notifiers (recognized face, then
                    the new-car notifier). */}
                <div className="pointer-events-none fixed top-20 left-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
                  <FaceNotifier />
                  <Suspense fallback={null}>
                    <NewCarNotifier />
                  </Suspense>
                </div>
                {/* Lobby messages — self-positioned left-edge drawer that tucks
                    itself into a grip handle and peeks open on hover. */}
                <StickyMessages />
                <GateControl />
                <BackToTop />
              </EmergencyProvider>
            ) : (
              children
            )}
          </PreferencesProvider>
        </AuthProvider>
        <Toaster
          position="top-left"
          dir="rtl"
          richColors
          closeButton
          theme="system"
        />
      </body>
    </html>
  );
}

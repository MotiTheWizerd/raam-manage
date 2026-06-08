import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { FaceNotifier } from "@/components/FaceNotifier";
import { GateControl } from "@/components/GateControl";
import { Header } from "@/components/Header";
import { NewCarNotifier } from "@/components/NewCarNotifier";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { Sidebar } from "@/components/Sidebar";
import { StickyMessages } from "@/components/StickyMessages";
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
              <>
                <Header lobbyistName={currentUser.lobbyist_name} isDark={isDark} />
                <div className="flex-1 flex min-h-0">
                  <Sidebar />
                  <main className="flex-1 overflow-auto p-6">{children}</main>
                </div>
                {/* Top-left stack: system messages on top, the car notifier
                    below. StickyMessages renders null when empty, so the
                    notifier rises to the top with no gap. */}
                <div className="pointer-events-none fixed top-20 left-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
                  <StickyMessages />
                  <FaceNotifier />
                  <Suspense fallback={null}>
                    <NewCarNotifier />
                  </Suspense>
                </div>
                <GateControl />
              </>
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

"use client"; // Required because AuthProvider uses hooks

import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext"; // Assuming alias
import { ThemeProvider } from "@/lib/contexts/ThemeContext"; // Import ThemeProvider
import { NotificationProvider } from "@/lib/contexts/NotificationContext"; // Import NotificationProvider
import { UndoProvider } from "@/lib/contexts/UndoContext"; // Import UndoProvider
import React from "react"; // Import React
import { usePathname } from 'next/navigation'; // Import usePathname
import { Header } from '@/components/Header'; // Import the Header component

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const showHeader = pathname !== '/login'; // Don't show header on login page

  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <ThemeProvider>
          <NotificationProvider>
            <UndoProvider>
              <AuthProvider>
                {showHeader && <Header />} {/* Conditionally render Header */}
                <main className="min-h-screen bg-slate-50 dark:bg-slate-900">
                  {/* Content moves below header */}
                  {children}
                </main>
              </AuthProvider>
            </UndoProvider>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

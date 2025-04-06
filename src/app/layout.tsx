"use client"; // Required because AuthProvider uses hooks

import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext"; // Assuming alias
import { ThemeProvider } from "@/lib/contexts/ThemeContext"; // Import ThemeProvider
import { NotificationProvider } from "@/lib/contexts/NotificationContext"; // Import NotificationProvider
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
    <html lang="en">
      {/* body tag will have dark class applied by ThemeProvider */}
      <body>
        <ThemeProvider>
          <NotificationProvider>
            <AuthProvider>
              {showHeader && <Header />} {/* Conditionally render Header */}
              {/* Add dark mode background classes */}
              <main className="pt-4 pb-8 bg-gray-50 dark:bg-gray-900">
                {/* Content moves below header */}
                {children}
              </main>
            </AuthProvider>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

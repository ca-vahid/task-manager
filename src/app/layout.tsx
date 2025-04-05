"use client"; // Required because AuthProvider uses hooks

import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext"; // Assuming alias
import { ThemeProvider } from "@/lib/contexts/ThemeContext"; // Import ThemeProvider
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
      <body className="bg-gray-50 dark:bg-dark-background transition-colors duration-200">
        <ThemeProvider>
          <AuthProvider>
            {showHeader && <Header />} {/* Conditionally render Header */}
            <main className="pt-4 pb-8"> {/* Add padding top/bottom */}
               {/* Content moves below header */}
               {children}
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

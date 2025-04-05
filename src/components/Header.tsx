'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import Image from 'next/image';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side: Title and Logos */}
          <div className="flex items-center space-x-2">
            <Link href="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors">
              ISO 27001:2022
            </Link>
            {/* Add Company Logos */}
            <div className="flex items-center space-x-1">
              <Image
                src="/logos/bgc-logo.png"
                alt="BGC Logo"
                width={60}
                height={60}
                className="object-contain"
              />
              <Image
                src="/logos/cambio-logo.png"
                alt="Cambio Logo"
                width={60}
                height={60}
                className="object-contain"
              />
            </div>
          </div>

          {/* Middle: Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              Controls
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              Dashboard
            </Link>
            <Link href="/technicians" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              Technicians
            </Link>
            <Link href="/analytics" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              Analytics
            </Link>
          </nav>

          {/* Right side: User info, Theme Toggle, and Sign Out */}
          <div className="flex items-center space-x-4">
            {loading ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
            ) : user ? (
              <>
                <span className="text-sm text-gray-500 dark:text-gray-400">{user.email}</span>
                <ThemeToggle />
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/50 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:ring-offset-gray-800"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <ThemeToggle />
                <Link href="/signin" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
} 
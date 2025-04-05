'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import Image from 'next/image';

export function Header() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side: Title and Logos */}
          <div className="flex items-center space-x-2">
            <Link href="/" className="text-xl font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
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
            <Link href="/" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Controls
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/technicians" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Technicians
            </Link>
            <Link href="/analytics" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Analytics
            </Link>
          </nav>

          {/* Right side: User info and Sign Out */}
          <div className="flex items-center">
            {loading ? (
              <span className="text-sm text-gray-500">Loading...</span>
            ) : user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">{user.email}</span>
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link href="/signin" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
} 
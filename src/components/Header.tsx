'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import Image from 'next/image';
import { ThemeToggle } from './ThemeToggle';
import { useProjectName } from '@/lib/contexts/ProjectNameContext';
import { BackupRestoreModal } from './BackupRestoreModal';

export function Header() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { projectName, loading: projectNameLoading } = useProjectName();
  const [showBackupModal, setShowBackupModal] = useState(false);

  return (
    <>
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side: Title and Logos */}
            <div className="flex items-center space-x-2">
              <Link href="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors">
                {projectNameLoading ? 'Loading...' : projectName || 'Task Management AI'}
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
              </div>
            </div>

            {/* Middle: Navigation */}
            <nav className="hidden md:flex space-x-8">
              <Link href="/" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Tasks
              </Link>
              <Link href="/categories" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Categories
              </Link>
              <Link href="/groups" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Groups
              </Link>
              <Link href="/technicians" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Technicians
              </Link>
              <Link href="/dashboard" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Dashboard
              </Link>
              <Link href="/analytics" className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Analytics
              </Link>
            </nav>

            {/* Right side: User info, Theme Toggle, Backup/Restore, and Sign Out */}
            <div className="flex items-center space-x-4">
              {authLoading ? (
                <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
              ) : user ? (
                <>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{user.email}</span>
                  <ThemeToggle />
                  
                  {/* Backup & Restore Button */}
                  <button
                    onClick={() => setShowBackupModal(true)}
                    className="px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:ring-offset-gray-800"
                  >
                    <span className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h1a2 2 0 012 2v7a2 2 0 01-2 2H8a2 2 0 01-2-2v-7a2 2 0 012-2h1v5.586l-1.293-1.293zM13 6a1 1 0 10-2 0v2a1 1 0 102 0V6z" />
                      </svg>
                      Backup/Restore
                    </span>
                  </button>
                  
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

      {/* Backup & Restore Modal */}
      <BackupRestoreModal 
        isOpen={showBackupModal} 
        onClose={() => setShowBackupModal(false)} 
      />
    </>
  );
} 
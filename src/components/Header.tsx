'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';

export function Header() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Controls' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/technicians', label: 'Technicians' },
    { href: '/analytics', label: 'Analytics' },
    // Add more links as needed
  ];

  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        {/* Logo/Title */}
        <Link href="/" className="text-xl font-bold text-indigo-600">
          ISO Tracker
        </Link>

        {/* Navigation Links */}
        <nav className="flex gap-4 md:gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'text-indigo-600'
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User Info & Sign Out */}
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-gray-500 hidden sm:inline">{user.email}</span>
          )}
          <button 
            onClick={signOut}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
} 
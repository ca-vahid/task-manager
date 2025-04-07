'use client';

import React, { useState, useEffect } from 'react';

interface CollapsibleGroupProps {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
  badge?: string | number;
  id?: string;
}

export function CollapsibleGroup({
  title,
  children,
  initiallyOpen = true,
  badge,
  id
}: CollapsibleGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  
  // Update open state when initiallyOpen prop changes
  useEffect(() => {
    setIsOpen(initiallyOpen);
  }, [initiallyOpen]);
  
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4" id={id}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center">
          <h3 className="text-md font-medium text-gray-900 dark:text-gray-100">{title}</h3>
          {badge !== undefined && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
              {badge}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'max-h-[2000px]' : 'max-h-0'
        }`}
      >
        <div className="p-4 bg-white dark:bg-gray-900">{children}</div>
      </div>
    </div>
  );
} 
'use client';

import React, { useState, ReactNode } from 'react';

interface CollapsibleGroupProps {
  title: string;
  icon?: ReactNode;
  count?: number;
  defaultExpanded?: boolean;
  headerClassName?: string;
  children: ReactNode;
}

export function CollapsibleGroup({
  title,
  icon,
  count,
  defaultExpanded = true,
  headerClassName = '',
  children
}: CollapsibleGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 transition-all duration-300">
      <div 
        className={`px-4 py-3 flex justify-between items-center cursor-pointer ${headerClassName}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="font-semibold flex items-center gap-2">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs bg-white bg-opacity-80 rounded-full px-2 py-0.5 shadow-inner">
              {count}
            </span>
          )}
        </h3>
        
        <button 
          className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-all duration-200"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-5 w-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      <div 
        className={`transition-all duration-300 overflow-hidden ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
} 
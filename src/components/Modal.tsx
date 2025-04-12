"use client";

import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  isOpen?: boolean; // Made optional but will be treated as always true when the component is rendered
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  preventOutsideClose?: boolean; // Add this prop to prevent closing on outside click
}

export function Modal({ 
  children, 
  title, 
  onClose, 
  isOpen = true, 
  size = 'md', 
  preventOutsideClose = false 
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscapeKey);
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onClose]);
  
  // Handle clicking outside the modal
  useEffect(() => {
    // If preventOutsideClose is true, don't add the event listener
    if (preventOutsideClose) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, preventOutsideClose]);
  
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);
  
  // Size classes
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    '2xl': 'max-w-7xl'
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-40 dark:bg-opacity-60 transition-opacity"></div>
      
      <div className="flex items-center justify-center min-h-screen px-4 py-6 sm:py-12">
        <div ref={modalRef} className={`${sizeClasses[size]} w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl transform transition-all relative`}>
          {/* Modal header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 relative">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
            
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-6 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Modal content - removed overflow-y-auto to prevent duplicate scrollbars */}
          <div className="px-6 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
} 
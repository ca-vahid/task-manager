import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onAiExtract?: () => void; // Optional callback for AI extraction
  size?: 'medium' | 'large' | 'xl'; // New size prop with default medium
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  onAiExtract,
  size = 'medium' // Default size
}: ModalProps) {
  if (!isOpen) return null;

  // Determine size classes
  const sizeClasses = {
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
    xl: 'max-w-6xl'
  };

  // Get the width class based on size prop
  const widthClass = sizeClasses[size];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50" 
      onClick={onClose} // Close on overlay click
    >
      <div 
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl ${widthClass} w-full mx-4 max-h-[calc(95vh-2rem)] overflow-hidden flex flex-col`} 
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <div className="flex items-center space-x-2">
            {/* AI Extract Button - only show if callback is provided */}
            {onAiExtract && (
              <button
                onClick={onAiExtract}
                className="p-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 dark:from-purple-500 dark:to-indigo-500 dark:hover:from-purple-600 dark:hover:to-indigo-600 rounded-md text-white transition-colors duration-200 group"
                title="Extract with AI"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3Z" fill="currentColor"/>
                  <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="currentColor"/>
                  <path fillRule="evenodd" d="M8 4h2v2H8V4zm6 0h2v2h-2V4z" fill="currentColor" className="animate-pulse"/>
                </svg>
              </button>
            )}
            
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200"
              title="Close"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Modal Content - with its own scrollable area */}
        <div className="flex-grow overflow-y-auto p-6 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
          {children}
        </div>
      </div>
    </div>
  );
} 
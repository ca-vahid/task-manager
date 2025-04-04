import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onAiExtract?: () => void; // Optional callback for AI extraction
}

export function Modal({ isOpen, onClose, title, children, onAiExtract }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
      onClick={onClose} // Close on overlay click
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
          <div className="flex items-center gap-2">
            {/* AI Button - Only show if onAiExtract is provided */}
            {onAiExtract && (
              <button
                onClick={onAiExtract}
                className="group relative flex items-center justify-center p-1.5 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all"
                title="Extract information with AI"
              >
                <span className="absolute inset-0 rounded-full bg-white opacity-10 blur-sm group-hover:opacity-0 transition-opacity"></span>
                <span className="relative z-10">
                  {/* AI Brain Icon instead of Eye */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5C15.79 5 18.17 8.13 19.08 9.74C19.2974 10.144 19.406 10.5981 19.406 11.06C19.406 11.5219 19.2974 11.976 19.08 12.38C18.17 13.99 15.79 17.12 12 17.12C8.21 17.12 5.83 13.99 4.92 12.38C4.7026 11.976 4.59405 11.5219 4.59405 11.06C4.59405 10.5981 4.7026 10.144 4.92 9.74C5.83 8.13 8.21 5 12 5Z" fill="currentColor"/>
                    <path d="M10 11.06C10 10.5335 10.2107 10.0286 10.5858 9.65354C10.9609 9.27847 11.4657 9.06775 11.9923 9.06775C12.5188 9.06775 13.0237 9.27847 13.3987 9.65354C13.7738 10.0286 13.9845 10.5335 13.9845 11.06C13.9845 11.5865 13.7738 12.0914 13.3987 12.4665C13.0237 12.8415 12.5188 13.0523 11.9923 13.0523C11.4657 13.0523 10.9609 12.8415 10.5858 12.4665C10.2107 12.0914 10 11.5865 10 11.06Z" fill="white"/>
                    {/* Brain lines */}
                    <path d="M9 4C9 3.44772 9.44772 3 10 3C10.5523 3 11 3.44772 11 4V6C11 6.55228 10.5523 7 10 7C9.44772 7 9 6.55228 9 6V4Z" fill="currentColor" className="animate-pulse"/>
                    <path d="M13 4C13 3.44772 13.4477 3 14 3C14.5523 3 15 3.44772 15 4V6C15 6.55228 14.5523 7 14 7C13.4477 7 13 6.55228 13 6V4Z" fill="currentColor" className="animate-pulse"/>
                    <path d="M9 16C9 15.4477 9.44772 15 10 15C10.5523 15 11 15.4477 11 16V18C11 18.5523 10.5523 19 10 19C9.44772 19 9 18.5523 9 18V16Z" fill="currentColor" className="animate-pulse"/>
                    <path d="M13 16C13 15.4477 13.4477 15 14 15C14.5523 15 15 15.4477 15 16V18C15 18.5523 14.5523 19 14 19C13.4477 19 13 18.5523 13 18V16Z" fill="currentColor" className="animate-pulse"/>
                  </svg>
                </span>
                
                {/* Tooltip */}
                <span className="opacity-0 group-hover:opacity-100 absolute -top-10 transform left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded pointer-events-none transition-opacity whitespace-nowrap">
                  Add with AI
                </span>
              </button>
            )}
            
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Modal Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
} 
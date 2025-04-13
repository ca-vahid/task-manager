import React from 'react';

// Application version
export const APP_VERSION = "0.8.6";

// Version history for changelog
export interface VersionInfo {
  version: string;
  date: string;
  changes: {
    category: string;
    items: string[];
  }[];
}

export const VERSION_HISTORY: VersionInfo[] = [
  {
    version: "0.8.6",
    date: "April 12, 2025",
    changes: [
      {
        category: "Added Features",
        items: [
          "Added ability to search controls by technician name",
          "Updated search placeholder to indicate technician search capability"
        ]
      },
      {
        category: "Fixed Drag and Drop Issues",
        items: [
          "Fixed instability in drag and drop functionality",
          "Improved state management during drag operations",
          "Simplified drag handlers to be more reliable",
          "Fixed the \"Invalid time value\" error during undo operations",
          "Added better error handling for drag and drop API calls"
        ]
      },
      {
        category: "Fixed Rich Text Editor Issues",
        items: [
          "Replaced ReactQuill with direct Quill implementation to fix findDOMNode errors",
          "Fixed multiple toolbar issue by using a dedicated toolbar container",
          "Fixed format configuration in Quill by removing invalid 'bullet' format",
          "Added proper cleanup for Quill instances to prevent memory leaks",
          "Improved client-side only rendering for the editor"
        ]
      },
      {
        category: "Fixed Date Display Issues",
        items: [
          "Fixed timezone conversion issue that caused dates to display one day earlier",
          "Implemented proper UTC date handling for consistent date display",
          "Enhanced date formatting functions with better error handling"
        ]
      },
      {
        category: "Improved Error Handling",
        items: [
          "Added robust error handling for empty API responses",
          "Improved JSON parsing safety for API responses",
          "Added better error recovery mechanisms throughout the application"
        ]
      }
    ]
  },
  {
    version: "0.8.5",
    date: "April 11, 2025",
    changes: [
      {
        category: "Task Management Improvements",
        items: [
          "Added bulk task actions for multiple selected tasks",
          "Improved task selection interface with checkboxes",
          "Added batch operations toolbar when tasks are selected"
        ]
      },
      {
        category: "PDF Processing",
        items: [
          "Enhanced PDF task extraction with Gemini Thinking model",
          "Added support for meeting transcripts with automatic summarization",
          "Improved task parsing accuracy for complex documents"
        ]
      },
      {
        category: "UI Enhancements",
        items: [
          "Added dark mode support throughout the application",
          "Improved responsive design for mobile devices",
          "Enhanced accessibility with better keyboard navigation"
        ]
      }
    ]
  },
  {
    version: "0.8.0",
    date: "April 11, 2025",
    changes: [
      {
        category: "Major Features",
        items: [
          "Initial release of PDF document analysis",
          "Added AI-powered task extraction",
          "Implemented task review interface for extracted tasks"
        ]
      },
      {
        category: "User Experience",
        items: [
          "Redesigned task cards with improved information hierarchy",
          "Added compact view for high-density task management",
          "Implemented kanban board view with drag and drop"
        ]
      }
    ]
  }
];

// Changelog Modal Component
export const ChangelogModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="changelog-modal" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
        
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-start">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" id="modal-title">
                Version History
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2 space-y-8">
              {VERSION_HISTORY.map((versionInfo) => (
                <div key={versionInfo.version} className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-0">
                  <div className="flex justify-between items-baseline">
                    <h4 className="text-base font-semibold text-blue-600 dark:text-blue-400">
                      Version {versionInfo.version}
                    </h4>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{versionInfo.date}</span>
                  </div>
                  
                  <div className="mt-3 space-y-4">
                    {versionInfo.changes.map((change, changeIndex) => (
                      <div key={changeIndex}>
                        <h5 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">{change.category}</h5>
                        <ul className="list-disc pl-5 space-y-1">
                          {change.items.map((item, itemIndex) => (
                            <li key={itemIndex} className="text-sm text-gray-600 dark:text-gray-300">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 
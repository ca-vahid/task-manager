import React from 'react';

// Application version
export const APP_VERSION = "1.1.2";

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
    version: "1.1.2",
    date: "April 14, 2024",
    changes: [
      {
        category: "Added",
        items: [
          "Main page title is now editable via Firestore. The title is stored in /settings/mainPageTitle and is auto-created if missing."
        ]
      }
    ]
  },
  {
    version: "1.1.1",
    date: "April 14, 2024",
    changes: [
      {
        category: "Bug Fixes",
        items: [
          "Fixed unescaped quotes in TaskAnalyzer component for Vercel compatibility",
          "Improved HTML entity handling for better deployment compatibility",
          "Enhanced code quality for production builds"
        ]
      }
    ]
  },
  {
    version: "1.1.0",
    date: "April 14, 2024",
    changes: [
      {
        category: "Major Feature",
        items: [
          "Added Outlook email task extraction capability",
          "Implemented .eml and .msg file support for direct task creation from emails",
          "Added robust JSON parsing to handle different Gemini response formats",
          "Enhanced fallback extraction for better reliability with AI models"
        ]
      },
      {
        category: "UI Improvements",
        items: [
          "Added email upload interface with drag-and-drop support",
          "Implemented real-time processing feedback with progress indicators",
          "Set AI transcript to be visible by default during email processing",
          "Enhanced task review interface for email-extracted tasks"
        ]
      },
      {
        category: "AI Integration",
        items: [
          "Added Gemini thinking model toggle for improved email analysis accuracy",
          "Enhanced prompts to ensure AI returns proper data structures",
          "Added smart task merging to limit email extraction to maximum 3 tasks",
          "Implemented structured schema mapping for consistent task generation"
        ]
      }
    ]
  },
  {
    version: "1.0.22",
    date: "April 13, 2024",
    changes: [
      {
        category: "Task Comparison Improvements",
        items: [
          "Added detailed information about what data will be preserved during merges",
          "Added ability to click on source tasks to view complete task details",
          "Improved display of technician names in task details modal",
          "Enhanced merge information with clear preservation indicators"
        ]
      }
    ]
  },
  {
    version: "1.0.21",
    date: "April 13, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Fixed checkbox selection issue in task analyzer",
          "Made duplicate task section collapsible for better organization",
          "Added collapse/expand controls to task analysis sections"
        ]
      }
    ]
  },
  {
    version: "1.0.20",
    date: "April 13, 2024",
    changes: [
      {
        category: "Bug Fixes",
        items: [
          "Fixed issue with unknown technician IDs in task analysis results",
          "Added direct technician, group, and category name resolution in API",
          "Improved data transformation to ensure human-readable names in the AI analysis"
        ]
      }
    ]
  },
  {
    version: "1.0.19",
    date: "April 13, 2024",
    changes: [
      {
        category: "Bug Fixes",
        items: [
          "Fixed issue with assignee name resolution in task analyzer",
          "Improved name matching with fuzzy search for technician names",
          "Enhanced display of unknown IDs with better formatting"
        ]
      }
    ]
  },
  {
    version: "1.0.18",
    date: "April 13, 2024",
    changes: [
      {
        category: "Bug Fixes",
        items: [
          "Fixed similar tasks section not displaying in analysis results",
          "Restored similar tasks functionality with improved UI",
          "Ensured consistent appearance between duplicate and similar task sections"
        ]
      }
    ]
  },
  {
    version: "1.0.17",
    date: "April 13, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Standardized task display format for both mergeable and non-mergeable tasks",
          "Improved 'Keep Separate' task cards to match the style of 'Merge' task cards",
          "Fixed visual inconsistency between similar and duplicate task displays"
        ]
      }
    ]
  },
  {
    version: "1.0.16",
    date: "April 13, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Enhanced 'Select All' functionality for task merge suggestions",
          "Added selection counter showing how many groups are selected",
          "Improved bulk action button visibility and styling",
          "Made selection controls visible when any mergeable groups exist"
        ]
      }
    ]
  },
  {
    version: "1.0.15",
    date: "April 13, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Improved task metadata display with better formatting and spacing",
          "Enhanced visual presentation of assignee, group, and category information",
          "Fixed formatting issue where IDs appeared merged in task details"
        ]
      }
    ]
  },
  {
    version: "1.0.14",
    date: "April 13, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Replaced Master text badge with a high-resolution star icon for clearer task status",
          "Implemented efficient ID lookup maps for better performance with large task sets",
          "Improved name resolution for assignees, groups and categories"
        ]
      }
    ]
  },
  {
    version: "1.0.13",
    date: "April 13, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Enhanced Task Analyzer with new progress bar implementation",
          "Fixed progress animation to only start after analysis begins",
          "Added stage-based progress tracking for more accurate feedback",
          "Implemented different progress speeds for thinking vs. standard models"
        ]
      }
    ]
  },
  {
    version: "1.0.12",
    date: "April 13, 2024",
    changes: [
      {
        category: "Task Merge Enhancements",
        items: [
          "Added visual indicators for tasks with FreshService tickets",
          "Added Master Task badges to clearly show which task others will merge into",
          "Added AI recommendation indicators showing suggested merge counts",
          "Improved task merge UI for better clarity during the merge process"
        ]
      }
    ]
  },
  {
    version: "1.0.11",
    date: "April 13, 2024",
    changes: [
      {
        category: "Task Analysis Improvements",
        items: [
          "Fixed issue displaying assignee IDs instead of names in task merge suggestions",
          "Enhanced task category display to show proper names instead of numeric IDs",
          "Added bulk selection controls for easier management of large task sets",
          "Improved name-to-ID conversion when applying merges"
        ]
      }
    ]
  },
  {
    version: "1.0.10",
    date: "April 12, 2024",
    changes: [
      {
        category: "Housekeeping",
        items: [
          "Synchronized local changes with remote repository",
          "General code consistency updates"
        ]
      }
    ]
  },
  {
    version: "1.0.9",
    date: "April 12, 2024",
    changes: [
      {
        category: "Bug Fixes",
        items: [
          "Fixed Gemini Thinking model task analysis not streaming output",
          "Enabled real-time streaming for Thinking model by removing response schema constraints"
        ]
      }
    ]
  },
  {
    version: "1.0.7",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Changed Word document extraction confirmation to use friendlier blue color scheme",
          "Added auto-progression after 5 seconds of inactivity for document extraction",
          "Improved overall document processing workflow for a more seamless experience"
        ]
      }
    ]
  },
  {
    version: "1.0.6",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Fixed progress bar gap between reading and optimizing stages",
          "Added dedicated Task Extraction progress stage at 50%",
          "Improved visual continuity of progress indicator for clearer user feedback"
        ]
      }
    ]
  },
  {
    version: "1.0.5",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Enhanced document reading and meeting summary stages with slower progress animation",
          "Implemented dynamic progress speed that adjusts based on processing stage",
          "Added progressive slowdown near completion of longer operations for more accurate feedback"
        ]
      }
    ]
  },
  {
    version: "1.0.4",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Enhanced Initializing Analysis stage with smooth progress animation",
          "Improved consistency across all progress bar stages for better visual feedback",
          "Optimized progress transitions between processing stages"
        ]
      }
    ]
  },
  {
    version: "1.0.3",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Fixed task analyzer output display height to reduce unnecessary scrolling",
          "Improved progress bar to accurately reflect document processing steps"
        ]
      },
      {
        category: "Documentation",
        items: [
          "Added detailed documentation about progress bar architecture",
          "Updated architecture documentation with implementation details"
        ]
      },
      {
        category: "Bug Fixes",
        items: [
          "Fixed large scrollbar issue in the task analyzer output window",
          "Increased max height of API output containers for better content display"
        ]
      }
    ]
  },
  {
    version: "1.0.2",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Redesigned version history popup with modern interface",
          "Added custom scrollbar for better user experience",
          "Implemented smooth animations for modals and popups"
        ]
      },
      {
        category: "PDF Processing",
        items: [
          "Improved JSON parsing for task extraction from complex documents",
          "Added smarter optimization logic to skip processing for small tasks sets",
          "Enhanced error handling and debugging for document analysis"
        ]
      }
    ]
  },
  {
    version: "1.0.1",
    date: "April 12, 2024",
    changes: [
      {
        category: "UI Improvements",
        items: [
          "Enhanced analysis complete screen with better task count visibility",
          "Improved layout of task extraction confirmation for better readability",
          "Made processing complete view more compact and user-friendly"
        ]
      }
    ]
  },
  {
    version: "1.0.0",
    date: "April 12, 2024",
    changes: [
      {
        category: "Major Release",
        items: [
          "First stable release with complete feature set",
          "Comprehensive documentation added for future reference",
          "Enhanced task analyzer with human-readable task identifiers",
          "Improved error handling in API routes with proper streaming support"
        ]
      },
      {
        category: "UI Improvements",
        items: [
          "Added clear 'Finish' button for scenarios with no merge suggestions",
          "Enhanced display of task references in analysis results",
          "Improved human-readable task identification with ticket numbers"
        ]
      }
    ]
  },
  {
    version: "0.9.0",
    date: "April 12, 2024",
    changes: [
      {
        category: "New Features",
        items: [
          "Added task analysis feature for detecting duplicates and similar tasks",
          "Implemented Gemini-based task analysis with thinking model support",
          "Added task merging capabilities to consolidate related tasks",
          "Added real-time analysis progress display with streaming Gemini output"
        ]
      },
      {
        category: "Performance Improvements",
        items: [
          "Removed drag and drop functionality for folders and tasks to reduce lag",
          "Simplified group display for better performance",
          "Enhanced task loading and rendering speed"
        ]
      }
    ]
  },
  {
    version: "0.8.6",
    date: "April 12, 2024",
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
    date: "April 12, 2024",
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
    date: "April 12, 2024",
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
  },
  {
    version: "1.0.23",
    date: "2024-05-30",
    changes: [
      {
        category: "Added",
        items: [
          "Main page title is now editable via Firestore. The title is stored in /settings/mainPageTitle and is auto-created if missing."
        ]
      }
    ]
  }
];

// Changelog Modal Component
export const ChangelogModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop with animation */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" />
      
      {/* Modal container */}
      <div 
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md transform transition-all animate-scaleIn overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 py-3 px-4 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              Version History
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content area with custom scrollbar */}
        <div className="py-2 px-4 overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {VERSION_HISTORY.map((versionInfo) => (
            <div key={versionInfo.version} className="mb-4 last:mb-0">
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </span>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    {versionInfo.version}
                  </h4>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                  {versionInfo.date}
                </span>
              </div>
              
              {versionInfo.changes.map((change, changeIndex) => (
                <div key={changeIndex} className="ml-9 mb-3">
                  <h5 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    {change.category}
                  </h5>
                  <ul className="space-y-1">
                    {change.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="text-sm text-gray-700 dark:text-gray-300 flex items-start">
                        <span className="text-green-500 dark:text-green-400 mr-1.5 mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              
              {/* Version separator */}
              {versionInfo.version !== VERSION_HISTORY[VERSION_HISTORY.length - 1].version && (
                <div className="border-b border-gray-100 dark:border-gray-700 my-3" />
              )}
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 py-2 px-4 bg-gray-50 dark:bg-gray-800">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 
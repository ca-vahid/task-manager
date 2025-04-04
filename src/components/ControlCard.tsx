"use client";

import React, { useState, ChangeEvent, FocusEvent, useEffect } from 'react';
import { Control, ControlStatus, Technician, ViewDensity, PriorityLevel } from '@/lib/types'; // Add ViewDensity import
import { Timestamp } from 'firebase/firestore';

interface ControlCardProps {
  control: Control;
  technicians: Technician[];
  onUpdateControl: (id: string, updates: Partial<Omit<Control, 'id'>>) => Promise<void>;
  onDeleteControl: (id: string) => Promise<void>;
  viewDensity?: ViewDensity; // Add view density prop with default value
  // Add props for drag-and-drop if needed later
}

// Helper to format Firestore Timestamp to YYYY-MM-DD for date input
function formatDateForInput(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  try {
    // Convert Firestore Timestamp to JavaScript Date
    const date = timestamp.toDate();
    
    // Verify the date is valid
    if (isNaN(date.getTime())) {
      console.error("Invalid date from timestamp:", timestamp);
      return '';
    }
    
    // Format as YYYY-MM-DD without timezone issues
    // Use UTC methods to avoid any timezone conversions
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date from timestamp:", error);
    return '';
  }
}

// Get time remaining until completion date
function getTimeRemaining(timestamp: Timestamp | null | any, status?: ControlStatus): { days: number; urgent: boolean; overdue: boolean; text: string } {
  if (!timestamp) return { days: 0, urgent: false, overdue: false, text: 'No date set' };
  
  // If the control is Complete, it's never overdue or urgent regardless of date
  if (status === ControlStatus.Complete) {
    return { days: 0, urgent: false, overdue: false, text: 'Completed' };
  }
  
  try {
    // Get the date from timestamp
    let date: Date;
    
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return { days: 0, urgent: false, overdue: false, text: 'Invalid date' };
    }
    
    if (isNaN(date.getTime())) {
      return { days: 0, urgent: false, overdue: false, text: 'Invalid date' };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { 
        days: Math.abs(diffDays), 
        urgent: false, 
        overdue: true, 
        text: `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'} overdue` 
      };
    } else if (diffDays === 0) {
      return { days: 0, urgent: true, overdue: false, text: 'Due today' };
    } else if (diffDays <= 3) {
      return { 
        days: diffDays, 
        urgent: true, 
        overdue: false, 
        text: `${diffDays} ${diffDays === 1 ? 'day' : 'days'} left` 
      };
    } else {
      return { 
        days: diffDays, 
        urgent: false, 
        overdue: false, 
        text: `${diffDays} days left` 
      };
    }
  } catch (error) {
    console.error("Error calculating time remaining:", error);
    return { days: 0, urgent: false, overdue: false, text: 'Error' };
  }
}

// Get status color and background
function getStatusStyles(status: ControlStatus): { color: string; background: string; border: string } {
  switch (status) {
    case ControlStatus.InProgress:
      return { 
        color: 'text-indigo-700', 
        background: 'bg-gradient-to-r from-indigo-50 to-indigo-100', 
        border: 'border-indigo-200' 
      };
    case ControlStatus.InReview:
      return { 
        color: 'text-amber-700', 
        background: 'bg-gradient-to-r from-amber-50 to-amber-100', 
        border: 'border-amber-200' 
      };
    case ControlStatus.Complete:
      return { 
        color: 'text-emerald-700', 
        background: 'bg-gradient-to-r from-emerald-50 to-emerald-100', 
        border: 'border-emerald-200' 
      };
    default:
      return { 
        color: 'text-gray-700', 
        background: 'bg-gradient-to-r from-gray-50 to-gray-100', 
        border: 'border-gray-200' 
      };
  }
}

export function ControlCard({ 
  control, 
  technicians, 
  onUpdateControl, 
  onDeleteControl,
  viewDensity = 'medium' // Default to medium density
}: ControlCardProps) {
  const [isEditingExplanation, setIsEditingExplanation] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState(control.explanation);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(control.title);
  const [isDcfIdEditing, setIsDcfIdEditing] = useState(false);
  const [dcfIdDraft, setDcfIdDraft] = useState(control.dcfId);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(control.externalUrl || '');
  
  const menuRef = React.useRef<HTMLDivElement>(null);
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  
  // Calculate time remaining
  const timeRemaining = getTimeRemaining(control.estimatedCompletionDate, control.status);
  
  // Get status styling
  const statusStyles = getStatusStyles(control.status);
  
  // State for explanation dialog
  const [showExplanationDialog, setShowExplanationDialog] = useState(false);
  // State for URL dialog
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Check if the timestamp is valid, normalize to null if invalid to avoid endless console errors
  useEffect(() => {
    if (control.estimatedCompletionDate) {
      try {
        // Detect and log different timestamp formats 
        if (typeof control.estimatedCompletionDate === 'string') {
          // If it's a string, it's likely from improper processing
          console.warn(`Control ${control.id} has invalid timestamp format (string):`, control.estimatedCompletionDate);
        } 
        else if (control.estimatedCompletionDate instanceof Timestamp) {
          // Normal Firebase Timestamp object
          const { seconds, nanoseconds } = control.estimatedCompletionDate;
          if (isNaN(seconds) || isNaN(nanoseconds)) {
            console.warn(`Control ${control.id} has invalid Timestamp values:`, control.estimatedCompletionDate);
          }
        }
        else if (typeof control.estimatedCompletionDate === 'object' && 
                 control.estimatedCompletionDate !== null) {
          // Try to check if it has a seconds property
          const obj = control.estimatedCompletionDate as any;
          if ('seconds' in obj) {
            const seconds = obj.seconds;
            if (typeof seconds !== 'number' || isNaN(seconds)) {
              console.warn(`Control ${control.id} has invalid timestamp seconds:`, control.estimatedCompletionDate);
            }
          } else {
            // Unknown format
            console.warn(`Control ${control.id} has timestamp in unknown format:`, control.estimatedCompletionDate);
          }
        }
      } catch (error) {
        console.error(`Error checking timestamp in control ${control.id}:`, error);
      }
    }
  }, [control.id, control.estimatedCompletionDate]);

  // Reset draft if control prop changes (e.g., due to external update)
  useEffect(() => {
    setExplanationDraft(control.explanation);
  }, [control.explanation]);

  // Generic handler for simple field updates (status, assignee, date)
  const handleFieldUpdate = async (fieldName: keyof Control, value: any) => {
    setUpdateError(null);
    let updateValue = value;

    // Special handling for date input
    if (fieldName === 'estimatedCompletionDate') {
        if (!value || value === '') {
            // Empty input should result in null
            updateValue = null;
        } else {
            try {
                // Parse the date string to ensure it's valid
                // For date inputs, we need to fix timezone issues
                // When browser receives "2023-07-15" it creates a date at local midnight
                // We need to ensure we preserve the date as selected without timezone shifts
                const rawDate = new Date(value);
                if (isNaN(rawDate.getTime())) {
                    console.error('Invalid date input:', value);
                    setUpdateError('Invalid date format. Please use YYYY-MM-DD format.');
                    return; // Prevent update with invalid date
                }
                
                // Send the ISO string to the API rather than a Timestamp
                // The API will convert it to a Firestore Timestamp with proper handling
                updateValue = value; // Keep the original YYYY-MM-DD string
            } catch (error) {
                console.error('Date conversion error:', error);
                setUpdateError('Failed to process date. Please use YYYY-MM-DD format.');
                return;
            }
        }
    } 
    // Special handling for assignee (use null if "unassigned" is selected)
    else if (fieldName === 'assigneeId') {
       updateValue = value === "" ? null : value;
    }

    try {
      await onUpdateControl(control.id, { [fieldName]: updateValue });
    } catch (error: any) { 
      console.error(`Failed to update ${fieldName}:`, error);
      setUpdateError(`Failed to update ${fieldName}: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for saving the explanation
  const handleSaveExplanation = async () => {
    if (explanationDraft === control.explanation) {
      setIsEditingExplanation(false);
      return;
    }
    setUpdateError(null);
    try {
      await onUpdateControl(control.id, { explanation: explanationDraft });
      setIsEditingExplanation(false);
    } catch (error: any) {
      console.error("Failed to update explanation:", error);
      setUpdateError("Failed to save explanation.");
      // Optionally revert draft on error: setExplanationDraft(control.explanation);
    }
  };

  // Handler for initiating the delete process
  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsConfirmingDelete(true);
    setUpdateError(null); // Clear previous errors
  };

  // Handler for confirming the delete
  const handleConfirmDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsDeleting(true); // Indicate deletion is in progress
    setUpdateError(null);
    try {
      await onDeleteControl(control.id);
      // No need to setIsConfirmingDelete(false) as the component will likely unmount
    } catch (error: any) {
      console.error("Failed to delete control:", error);
      setUpdateError("Failed to delete control.");
      setIsDeleting(false); // Reset deleting state on error
      setIsConfirmingDelete(false); // Hide confirmation on error
    }
  };

  // Handler for canceling the delete
  const handleCancelDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // Prevent event bubbling
    setIsConfirmingDelete(false);
    setIsDeleting(false); // Ensure deleting state is reset
    setUpdateError(null);
  };

  // Handler for saving the title
  const handleSaveTitle = async () => {
    if (titleDraft === control.title) {
      setIsEditingTitle(false);
      return;
    }
    setUpdateError(null);
    try {
      await onUpdateControl(control.id, { title: titleDraft.trim() });
      setIsEditingTitle(false);
    } catch (error: any) {
      console.error("Failed to update title:", error);
      setUpdateError("Failed to save title.");
    }
  };

  // Handler for saving the DCF ID
  const handleSaveDcfId = async () => {
    if (dcfIdDraft === control.dcfId) {
      setIsDcfIdEditing(false);
      return;
    }
    setUpdateError(null);
    try {
      await onUpdateControl(control.id, { dcfId: dcfIdDraft.trim() });
      setIsDcfIdEditing(false);
    } catch (error: any) {
      console.error("Failed to update DCF ID:", error);
      setUpdateError("Failed to save DCF ID.");
    }
  };

  // Handler for saving the external URL
  const handleSaveUrl = async () => {
    if (urlDraft === control.externalUrl) {
      setIsEditingUrl(false);
      setShowUrlDialog(false);
      return;
    }
    setUpdateError(null);
    try {
      // Validate URL
      let processedUrl = urlDraft.trim();
      if (processedUrl && !processedUrl.startsWith('http://') && !processedUrl.startsWith('https://')) {
        processedUrl = 'https://' + processedUrl;
      }
      
      await onUpdateControl(control.id, { externalUrl: processedUrl || null });
      setIsEditingUrl(false);
      setShowUrlDialog(false);
    } catch (error: any) {
      console.error("Failed to update external URL:", error);
      setUpdateError("Failed to save external URL.");
    }
  };

  // Toggle the menu
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  // Start editing explanation and ensure details is expanded
  const startEditingExplanation = () => {
    // Make sure the details element is open
    if (detailsRef.current) {
      detailsRef.current.open = true;
    }
    // Set editing mode
    setIsEditingExplanation(true);
  };

  // Find the assignee's name
  const assigneeName = control.assigneeId 
    ? technicians.find(tech => tech.id === control.assigneeId)?.name || 'Unknown'
    : 'Unassigned';
  
  // Check if control is high priority
  const isHighPriority = control.priorityLevel === PriorityLevel.High || control.priorityLevel === PriorityLevel.Critical;

  // Define a helper function to render the delete confirmation modal consistently
  const renderDeleteConfirmationModal = () => {
  return (
      <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg p-5 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Control</h3>
          <p className="text-gray-600 mb-4">
            Are you sure you want to delete control DCF-{control.dcfId}: "{control.title}"? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button 
              onClick={handleCancelDelete}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button 
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex items-center"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render compact view
  if (viewDensity === 'compact') {
    return (
      <>
        <div className={`rounded-lg border shadow-sm mb-1.5 overflow-hidden transition-all duration-200 ${statusStyles.border}`}>
          <div className="flex items-center justify-between p-1.5 gap-1.5">
            {/* Left side: Status, Title */}
            <div className="flex items-center min-w-0 flex-grow">
              <span className={`h-2 w-2 rounded-full mr-1.5 flex-shrink-0 ${
                control.status === ControlStatus.Complete ? 'bg-emerald-500' : 
                control.status === ControlStatus.InProgress ? 'bg-indigo-500' : 
                control.status === ControlStatus.InReview ? 'bg-amber-500' : 'bg-gray-500'
              }`} />
              <span className="text-xs font-mono bg-black/5 text-gray-700 px-1 py-0.5 rounded-sm mr-1.5 flex-shrink-0">
                DCF-{control.dcfId}
              </span>
              <span className="font-medium text-xs truncate">
                {control.title}
              </span>
              
              {/* High priority indicator - compact view */}
              {isHighPriority && (
                <span className="ml-1 text-red-500" title={`${control.priorityLevel} Priority`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              
              {/* External link - compact view */}
              {control.externalUrl && (
                <a 
                  href={control.externalUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-1 text-gray-400 hover:text-indigo-500 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  title="Open in ticketing system"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                  </svg>
                </a>
              )}
            </div>
            
            {/* Right side: Compact indicators */}
            <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
              {/* Priority indicator dot */}
              {control.priorityLevel && (
                <span className={`rounded-full h-1.5 w-1.5 flex-shrink-0 ${
                  control.priorityLevel === PriorityLevel.Critical ? 'bg-red-500' : 
                  control.priorityLevel === PriorityLevel.High ? 'bg-orange-500' : 
                  control.priorityLevel === PriorityLevel.Medium ? 'bg-blue-500' : 'bg-green-500'
                }`} title={control.priorityLevel} />
              )}
              
              {/* Assignee - truncated to save space */}
              <span className="text-gray-500 truncate max-w-[60px]" title={assigneeName}>
                {assigneeName}
              </span>
              
              {/* Date - Month/Day only */}
              {control.estimatedCompletionDate && (
                <span className="text-gray-500 whitespace-nowrap text-[10px]">
                  {(() => {
                    try {
                      const date = control.estimatedCompletionDate?.toDate();
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    } catch (e) {
                      return '';
                    }
                  })()}
                </span>
              )}
              
              {/* Delete button - compact */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(e);
                }}
                className="text-gray-400 hover:text-red-600 p-0.5 rounded-sm"
                title="Delete control"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Delete confirmation modal - rendered outside the card for compact view */}
        {isConfirmingDelete && renderDeleteConfirmationModal()}
      </>
    );
  }

  // Render medium view
  if (viewDensity === 'medium') {
    return (
      <>
        <div className={`rounded-lg border shadow-md mb-2 overflow-hidden transition-all duration-200 hover:shadow-lg ${statusStyles.border} ${statusStyles.background}`}>
          {/* Efficient Status/Badges Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-opacity-50">
            <div className="flex items-center gap-1.5 min-w-0 flex-grow">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                control.status === ControlStatus.Complete ? 'bg-emerald-500' : 
                control.status === ControlStatus.InProgress ? 'bg-indigo-500' : 
                control.status === ControlStatus.InReview ? 'bg-amber-500' : 'bg-gray-500'
              }`} />
              
              <div className="flex flex-wrap gap-1">
                <span className={`inline-flex items-center rounded-full ${
                  control.status === ControlStatus.Complete 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : control.status === ControlStatus.InProgress 
                    ? 'bg-indigo-100 text-indigo-800' 
                    : control.status === ControlStatus.InReview
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-800'
                } px-2 py-0.5 text-xs font-medium`}>
                  {control.status}
                </span>
                
                {timeRemaining.text && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    timeRemaining.overdue ? 'bg-red-100 text-red-800' : 
                    timeRemaining.urgent ? 'bg-amber-100 text-amber-800' : 
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {timeRemaining.text}
                  </span>
                )}
                
                {control.priorityLevel && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    control.priorityLevel === PriorityLevel.Critical 
                      ? 'bg-red-100 text-red-800' 
                      : control.priorityLevel === PriorityLevel.High 
                      ? 'bg-orange-100 text-orange-800' 
                      : control.priorityLevel === PriorityLevel.Medium 
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {control.priorityLevel}
                  </span>
                )}
              </div>
            </div>
            
            <span className="text-xs font-medium text-gray-700 flex-shrink-0">
              {assigneeName}
            </span>
          </div>

          {/* Content Section */}
          <div className="p-2">
            <div className="flex justify-between items-start">
              <div className="flex-grow min-w-0">
                <div className="flex items-center mb-0.5">
                  <span className="text-xs font-mono bg-black/10 text-gray-700 px-1.5 py-0.5 rounded-sm mr-1.5 flex-shrink-0">
                    DCF-{control.dcfId}
                  </span>
                  
                  <h4 className={`text-sm font-semibold truncate ${statusStyles.color}`}>
                    {control.title}
                  </h4>
                  
                  {/* High priority indicator - medium view */}
                  {isHighPriority && (
                    <span className="ml-1 text-red-500" title={`${control.priorityLevel} Priority`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  
                  {/* External link - medium view */}
                  {control.externalUrl && (
                    <a 
                      href={control.externalUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ml-1.5 text-gray-400 hover:text-indigo-500 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      title="Open in ticketing system"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(e);
                }} 
                className="text-gray-400 hover:text-red-600 p-1 rounded-md flex-shrink-0"
                aria-label="Delete control"
                title="Delete control"
                disabled={isDeleting}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            {/* Progress bar for controls with progress */}
            {control.progress !== undefined && control.progress > 0 && (
              <div className="w-full h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    control.progress >= 100 
                      ? 'bg-emerald-500' 
                      : control.progress >= 75 
                      ? 'bg-indigo-500' 
                      : control.progress >= 50 
                      ? 'bg-amber-500'
                      : control.progress >= 25
                      ? 'bg-orange-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${control.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation modal - rendered outside the card for medium view */}
        {isConfirmingDelete && renderDeleteConfirmationModal()}
      </>
    );
  }

  // Render full view (default)
  return (
    <>
      <div className={`rounded-lg border shadow-md mb-3 overflow-hidden transition-all duration-200 hover:shadow-lg ${statusStyles.border} ${statusStyles.background}`}>
        {/* Top header with DCF ID, Status indicator and menu */}
        <div className="flex items-center justify-between border-b px-3 py-1.5 border-opacity-50">
          <div className="flex items-center">
            {/* DCF ID */}
          {isDcfIdEditing ? (
              <input
                type="text"
                value={dcfIdDraft}
                onChange={(e) => setDcfIdDraft(e.target.value)}
                className="text-xs font-mono bg-white border border-gray-300 rounded px-1 py-0.5 mr-1.5 w-16 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
                onBlur={handleSaveDcfId}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveDcfId()}
              />
          ) : (
            <span 
                className="text-xs font-mono bg-black/5 text-gray-700 px-1 py-0.5 rounded-sm mr-1.5 flex-shrink-0 cursor-pointer hover:bg-black/10"
              onClick={() => setIsDcfIdEditing(true)}
              title="Click to edit DCF ID"
            >
                DCF-{control.dcfId}
            </span>
          )}
          
            {/* Status indicator */}
            <span className={`h-2 w-2 rounded-full mx-1 flex-shrink-0 ${
              control.status === ControlStatus.Complete ? 'bg-emerald-500' : 
              control.status === ControlStatus.InProgress ? 'bg-indigo-500' : 
              control.status === ControlStatus.InReview ? 'bg-amber-500' : 'bg-gray-500'
            }`} title={control.status}></span>
        </div>
        
          {/* Status badge & Menu */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full ${
              control.status === ControlStatus.Complete 
                ? 'bg-emerald-100 text-emerald-800' 
                : control.status === ControlStatus.InProgress 
                ? 'bg-indigo-100 text-indigo-800' 
                : control.status === ControlStatus.InReview
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-800'
            } px-2 py-0.5 text-xs font-medium`}>
              {control.status}
            </span>
            
            {/* Menu button */}
            <div className="relative" ref={menuRef}>
            <button
              onClick={toggleMenu}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-md"
              aria-label="More options"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
            
            {menuOpen && (
              <div className="absolute right-0 mt-1 bg-white rounded-md shadow-lg z-10 border border-gray-200 py-1 w-44">
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setIsEditingTitle(true);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                  </svg>
                  Edit Title
                </button>
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setIsDcfIdEditing(true);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                  </svg>
                  Edit DCF ID
                </button>
                  {/* External URL option */}
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                      setShowUrlDialog(true);
                      setIsEditingUrl(true);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                    {control.externalUrl ? 'Edit Link' : 'Add Link'}
                </button>
            <button 
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      setShowExplanationDialog(true);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
                    View Explanation
            </button>
                  {/* Delete option in menu */}
              <button 
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      handleDeleteClick(e);
                    }}
                disabled={isDeleting}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-2">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Delete
              </button>
            </div>
          )}
            </div>
        </div>
      </div>

        {/* Title Section - Full width and clear visibility */}
        <div className="px-3 py-1.5 border-b border-opacity-20">
          <div className="flex items-center">
            {isEditingTitle ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
                onBlur={handleSaveTitle}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
              />
            ) : (
              <>
                <h4 
                  className={`text-sm font-semibold cursor-pointer hover:text-indigo-600 transition-colors ${statusStyles.color} flex-grow`}
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to edit title"
                >
                  {control.title}
                  
                  {/* High priority indicator - full view */}
                  {isHighPriority && (
                    <span className="inline-block ml-1.5 text-red-500" title={`${control.priorityLevel} Priority`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </h4>
                
                {/* External link - full view */}
                {control.externalUrl && (
                  <a 
                    href={control.externalUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-2 text-gray-400 hover:text-indigo-500 transition-colors flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    title="Open in ticketing system"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M15.75 2.25H21a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V4.81L8.03 17.03a.75.75 0 01-1.06-1.06L19.19 3.75h-3.44a.75.75 0 010-1.5z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M5.25 6.75a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5h10.5a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3H5.25a3 3 0 01-3-3V8.25a3 3 0 013-3H9a.75.75 0 010 1.5H5.25z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs">Details</span>
                  </a>
                )}
              </>
            )}
            </div>
          </div>

        {/* Badge bar for additional info */}
        <div className="flex flex-wrap items-center gap-1 px-3 py-1 border-b border-opacity-20 bg-gray-50/50">
          {/* Assignee badge */}
          <div className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs text-gray-700">
              {assigneeName}
            </span>
          </div>
          
          {/* Time remaining badge - only if not empty */}
          {timeRemaining.text && (
            <div className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={`text-xs ${
                timeRemaining.overdue ? 'text-red-600' : 
                timeRemaining.urgent ? 'text-amber-600' : 
                'text-gray-700'
              }`}>
                {timeRemaining.text}
              </span>
          </div>
        )}
          
          {/* Priority badge - only if exists */}
          {control.priorityLevel && (
            <div className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <span className={`text-xs ${
                control.priorityLevel === PriorityLevel.Critical ? 'text-red-600' : 
                control.priorityLevel === PriorityLevel.High ? 'text-orange-600' : 
                control.priorityLevel === PriorityLevel.Medium ? 'text-blue-600' : 
                'text-green-600'
              }`}>
                {control.priorityLevel}
              </span>
            </div>
          )}
          
          {/* Explanation button */}
          <button 
            onClick={() => setShowExplanationDialog(true)}
            className="ml-auto text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Info</span>
          </button>
        </div>

        {/* Progress bar - if present */}
        {control.progress !== undefined && control.progress > 0 && (
          <div className="w-full h-1 bg-gray-200 overflow-hidden">
            <div 
              className={`h-full ${
                control.progress >= 100 
                  ? 'bg-emerald-500' 
                  : control.progress >= 75 
                  ? 'bg-indigo-500' 
                  : control.progress >= 50 
                  ? 'bg-amber-500'
                  : control.progress >= 25
                  ? 'bg-orange-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${control.progress}%` }}
            />
          </div>
        )}

        {/* Status, Assignee, Date Row - 3-column grid */}
        <div className="grid grid-cols-3 gap-2 text-xs p-2">
        {/* Status Dropdown */}
        <div>
            <label htmlFor={`status-${control.id}`} className="block text-[10px] font-medium text-gray-500 mb-0.5">Status</label>
          <select
            id={`status-${control.id}`}
            value={control.status}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFieldUpdate('status', e.target.value as ControlStatus)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs h-7 px-1.5 py-0 bg-white"
          >
            {Object.values(ControlStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {/* Assignee Dropdown */}
        <div>
            <label htmlFor={`assignee-${control.id}`} className="block text-[10px] font-medium text-gray-500 mb-0.5">Assignee</label>
          <select
            id={`assignee-${control.id}`}
              value={control.assigneeId || ""}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFieldUpdate('assigneeId', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs h-7 px-1.5 py-0 bg-white"
          >
              <option value="">Unassigned</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>

        {/* Estimated Completion Date */}
        <div>
            <label htmlFor={`date-${control.id}`} className="block text-[10px] font-medium text-gray-500 mb-0.5">Est. Completion</label>
          <input
            type="date"
            id={`date-${control.id}`}
            value={(() => {
              if (!control.estimatedCompletionDate) return '';
                try {
                  return formatDateForInput(control.estimatedCompletionDate);
              } catch (error) {
                  return '';
              }
            })()}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldUpdate('estimatedCompletionDate', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs h-7 px-1.5 py-0 bg-white"
          />
        </div>
      </div>

      {/* Update Error Message */}
      {updateError && (
          <p className="text-red-500 text-xs p-2 text-center">{updateError}</p>
      )}
    </div>

      {/* Delete confirmation and Explanation dialogs */}
      {isConfirmingDelete && renderDeleteConfirmationModal()}
      
      {/* External URL Dialog */}
      {showUrlDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                {control.externalUrl ? 'Edit External Link' : 'Add External Link'}
              </h3>
              <button 
                onClick={() => {
                  setShowUrlDialog(false);
                  setIsEditingUrl(false);
                  setUrlDraft(control.externalUrl || '');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-4">
                <label htmlFor="externalUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  URL to ticketing system
                </label>
                <input
                  type="url"
                  id="externalUrl"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://tickets.example.com/ticket/123"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the full URL to the ticket in your external system
                </p>
              </div>
              
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => {
                    setShowUrlDialog(false);
                    setIsEditingUrl(false);
                    setUrlDraft(control.externalUrl || '');
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                {control.externalUrl && (
                  <button 
                    onClick={async () => {
                      try {
                        await onUpdateControl(control.id, { externalUrl: null });
                        setShowUrlDialog(false);
                        setIsEditingUrl(false);
                        setUrlDraft('');
                      } catch (error: any) {
                        console.error("Failed to remove external URL:", error);
                        setUpdateError("Failed to remove external URL.");
                      }
                    }}
                    className="px-3 py-1.5 border border-red-300 rounded text-sm text-red-700 hover:bg-red-50"
                  >
                    Remove Link
                  </button>
                )}
                <button 
                  onClick={handleSaveUrl}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Explanation Dialog */}
      {showExplanationDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Explanation</h3>
              <button 
                onClick={() => setShowExplanationDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              {isEditingExplanation ? (
                <div>
                  <textarea
                    value={explanationDraft}
                    onChange={(e) => setExplanationDraft(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 min-h-[120px]"
                    rows={4}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button 
                      onClick={() => { setIsEditingExplanation(false); setExplanationDraft(control.explanation); }}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveExplanation}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {control.explanation || <span className="text-gray-400 italic">No explanation provided.</span>}
                  </p>
                  <button 
                    onClick={() => setIsEditingExplanation(true)}
                    className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Explanation
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
} 
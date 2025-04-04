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
    case ControlStatus.NotStarted:
      return { 
        color: 'text-amber-700', 
        background: 'bg-gradient-to-r from-amber-50 to-amber-100', 
        border: 'border-amber-200' 
      };
    case ControlStatus.InProgress:
      return { 
        color: 'text-blue-700', 
        background: 'bg-gradient-to-r from-blue-50 to-blue-100', 
        border: 'border-blue-200' 
      };
    case ControlStatus.Complete:
      return { 
        color: 'text-emerald-700', 
        background: 'bg-gradient-to-r from-emerald-50 to-emerald-100', 
        border: 'border-emerald-200' 
      };
    case ControlStatus.OnHold:
      return { 
        color: 'text-red-700', 
        background: 'bg-gradient-to-r from-red-50 to-red-100', 
        border: 'border-red-200' 
      };
    case ControlStatus.InReview:
      return { 
        color: 'text-yellow-700', 
        background: 'bg-gradient-to-r from-yellow-50 to-yellow-100', 
        border: 'border-yellow-200' 
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
  
  const menuRef = React.useRef<HTMLDivElement>(null);
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  
  // Calculate time remaining
  const timeRemaining = getTimeRemaining(control.estimatedCompletionDate, control.status);
  
  // Get status styling
  const statusStyles = getStatusStyles(control.status);
  
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

  // Render compact view
  if (viewDensity === 'compact') {
    return (
      <div className={`rounded-lg border shadow-sm mb-2 overflow-hidden transition-all duration-200 ${statusStyles.border}`}>
        <div className="flex items-center justify-between p-2 gap-2">
          {/* Left side: Status, Title */}
          <div className="flex items-center min-w-0 flex-grow">
            <span className={`h-2 w-2 rounded-full mr-2 flex-shrink-0 ${
              control.status === ControlStatus.Complete ? 'bg-emerald-500' : 
              control.status === ControlStatus.OnHold ? 'bg-red-500' : 
              control.status === ControlStatus.InProgress ? 'bg-blue-500' : 
              control.status === ControlStatus.InReview ? 'bg-amber-500' : 'bg-gray-500'
            }`} />
            <span className="text-xs font-mono bg-black/5 text-gray-700 px-1.5 py-0.5 rounded-sm mr-2 flex-shrink-0">
              {control.dcfId}
            </span>
            <span className="font-medium text-sm truncate">
              {control.title}
            </span>
          </div>
          
          {/* Right side: Priority, Assignee, Due Date */}
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            {control.priorityLevel && (
              <span className={`rounded-full h-2 w-2 flex-shrink-0 ${
                control.priorityLevel === PriorityLevel.Critical ? 'bg-red-500' : 
                control.priorityLevel === PriorityLevel.High ? 'bg-orange-500' : 
                control.priorityLevel === PriorityLevel.Medium ? 'bg-blue-500' : 'bg-green-500'
              }`} />
            )}
            
            <span className="text-gray-500 truncate max-w-[80px]">
              {assigneeName}
            </span>
            
            {control.estimatedCompletionDate && (
              <span className="text-gray-500 whitespace-nowrap">
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
          </div>
        </div>
      </div>
    );
  }

  // Render medium view
  if (viewDensity === 'medium') {
    return (
      <div className={`rounded-lg border shadow-md mb-3 overflow-hidden transition-all duration-200 hover:shadow-lg ${statusStyles.border} ${statusStyles.background}`}>
        {/* Status/Badges Header */}
        <div className="px-3 py-2 flex justify-between items-center border-b border-opacity-50">
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center rounded-full ${
              control.status === ControlStatus.Complete 
                ? 'bg-emerald-100 text-emerald-800' 
                : control.status === ControlStatus.OnHold 
                ? 'bg-red-100 text-red-800' 
                : control.status === ControlStatus.InProgress 
                ? 'bg-blue-100 text-blue-800' 
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
          <span className="inline-flex items-center text-xs font-medium text-gray-700">
            {assigneeName}
          </span>
        </div>

        {/* Content Section */}
        <div className="p-3">
          <div className="flex justify-between items-start mb-1">
            <div className="flex-grow">
              <span className="text-xs font-mono bg-black/10 backdrop-blur-sm text-gray-700 px-1.5 py-0.5 rounded-sm mr-2">
                {control.dcfId}
              </span>
              <h4 className={`text-base font-semibold mt-1 ${statusStyles.color}`}>
                {control.title}
              </h4>
            </div>
            
            <div className="flex flex-shrink-0">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(e);
                }} 
                className="text-gray-500 hover:text-red-600 p-1 rounded-md focus:outline-none disabled:opacity-50"
                aria-label="Delete control"
                title="Delete control"
                disabled={isDeleting}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Progress bar for controls with progress */}
          {control.progress !== undefined && control.progress > 0 && (
            <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  control.progress >= 100 
                    ? 'bg-emerald-500' 
                    : control.progress >= 75 
                    ? 'bg-blue-500' 
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
    );
  }

  // Render full view (default)
  return (
    <div className={`rounded-lg border shadow-md mb-4 overflow-hidden transition-all duration-200 hover:shadow-lg ${statusStyles.border} ${statusStyles.background}`}>
      {/* Status Badge */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-opacity-50">
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center rounded-full ${
            control.status === ControlStatus.Complete 
              ? 'bg-emerald-100 text-emerald-800' 
              : control.status === ControlStatus.OnHold 
              ? 'bg-red-100 text-red-800' 
              : control.status === ControlStatus.InProgress 
              ? 'bg-blue-100 text-blue-800' 
              : control.status === ControlStatus.InReview
              ? 'bg-amber-100 text-amber-800'
              : 'bg-gray-100 text-gray-800'
          } px-3 py-0.5 text-xs font-medium`}>
            {control.status}
          </span>
          {timeRemaining.text && (
            <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium ${
              timeRemaining.overdue ? 'bg-red-100 text-red-800' : 
              timeRemaining.urgent ? 'bg-amber-100 text-amber-800' : 
              'bg-gray-100 text-gray-800'
            }`}>
              {timeRemaining.text}
            </span>
          )}
          {control.priorityLevel && (
            <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium ${
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
        <div className="flex items-center">
          <span className={`inline-flex items-center rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-800`}>
            {assigneeName}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-grow">
            {isDcfIdEditing ? (
              <div className="mb-2">
                <input
                  type="text"
                  value={dcfIdDraft}
                  onChange={(e) => setDcfIdDraft(e.target.value)}
                  className="inline-block text-xs font-mono bg-white border border-gray-300 rounded px-1.5 py-0.5 mr-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                  onBlur={handleSaveDcfId}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveDcfId()}
                />
                <button onClick={handleSaveDcfId} className="text-xs text-blue-600">Save</button>
              </div>
            ) : (
              <span 
                className="text-xs font-mono bg-black/10 backdrop-blur-sm text-gray-700 px-2 py-1 rounded-md mr-2 cursor-pointer hover:bg-black/20 transition-colors"
                onClick={() => setIsDcfIdEditing(true)}
                title="Click to edit DCF ID"
              >
                {control.dcfId}
              </span>
            )}
            
            {isEditingTitle ? (
              <div className="mt-1">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="inline-block text-md border border-gray-300 rounded px-2 py-1 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                />
                <button onClick={handleSaveTitle} className="ml-2 text-xs text-blue-600">Save</button>
              </div>
            ) : (
              <h4 
                className={`text-lg font-bold inline cursor-pointer hover:text-indigo-600 transition-colors ${statusStyles.color}`}
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit title"
              >
                {control.title}
              </h4>
            )}
          </div>
          
          <div className="flex items-center">
            {/* Three-dots menu */}
            <div className="relative mr-1" ref={menuRef}>
              <button
                onClick={toggleMenu}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-md focus:outline-none"
                aria-label="More options"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
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
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      startEditingExplanation();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                    </svg>
                    Edit Explanation
                  </button>
                </div>
              )}
            </div>
            
            {/* Conditional rendering for Delete Button / Confirmation */} 
            {!isConfirmingDelete ? (
              <button 
                onClick={handleDeleteClick} 
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-500 hover:text-red-600 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                aria-label="Delete control"
                title="Delete control"
                disabled={isDeleting} // Disable while delete is in progress
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Delete?</span>
                <button 
                  onClick={handleCancelDelete}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-xs rounded px-2 py-1 border hover:bg-gray-100 disabled:opacity-50"
                  disabled={isDeleting}
                  aria-label="Cancel delete"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-xs rounded px-2 py-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:bg-red-400"
                  disabled={isDeleting}
                  aria-label="Confirm delete"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Explanation Section */}
        <details className="mb-3 group" ref={detailsRef}>
          <summary className="text-sm font-medium cursor-pointer group-open:mb-1 list-none flex items-center">
              <div className="flex items-center">
                <div className="w-6 h-6 mr-2 flex items-center justify-center rounded-full bg-black/5">
                  <span className="transform transition-transform duration-200 group-open:rotate-90">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </span>
                </div>
                <span className="font-medium">Explanation</span>
              </div>
          </summary>
          {isEditingExplanation ? (
            <div className="mt-1">
              <textarea
                value={explanationDraft}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setExplanationDraft(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-sm p-2 min-h-[80px] bg-white"
                rows={3}
                autoFocus
                onBlur={handleSaveExplanation} // Save on blur
              />
              <div className="flex justify-end gap-2 mt-1">
                <button onClick={() => { setIsEditingExplanation(false); setExplanationDraft(control.explanation); }} className="text-xs rounded px-2 py-1 border hover:bg-gray-100">Cancel</button>
                <button onClick={handleSaveExplanation} className="text-xs rounded px-2 py-1 bg-blue-600 text-white hover:bg-blue-700">Save</button>
              </div>
            </div>
          ) : (
            <div onClick={startEditingExplanation} className="text-sm text-gray-700 mt-1 p-3 rounded-md bg-white/50 backdrop-blur-sm min-h-[40px] cursor-text hover:bg-white/70 whitespace-pre-wrap">
              {control.explanation || <span className="text-gray-400 italic">Click to add explanation...</span>}
            </div>
          )}
        </details>

        {/* Status, Assignee, Date Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mt-2">
          {/* Status Dropdown */}
          <div>
            <label htmlFor={`status-${control.id}`} className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              id={`status-${control.id}`}
              value={control.status}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFieldUpdate('status', e.target.value as ControlStatus)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
            >
              {Object.values(ControlStatus).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* Assignee Dropdown */}
          <div>
            <label htmlFor={`assignee-${control.id}`} className="block text-xs font-medium text-gray-500 mb-1">Assignee</label>
            <select
              id={`assignee-${control.id}`}
              value={control.assigneeId || ""} // Use empty string for "Unassigned" value
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFieldUpdate('assigneeId', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
            >
              <option value="">-- Unassigned --</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>

          {/* Estimated Completion Date */}
          <div>
            <label htmlFor={`date-${control.id}`} className="block text-xs font-medium text-gray-500 mb-1">Est. Completion</label>
            {/* First validate the timestamp before calling formatDateForInput */}
            <input
              type="date"
              id={`date-${control.id}`}
              value={(() => {
                // IIFE to contain our validation logic 
                if (!control.estimatedCompletionDate) return '';
                
                try {
                  // Check format of the timestamp
                  if (typeof control.estimatedCompletionDate === 'string') {
                    // If it's a string (shouldn't happen, but just in case), try to format it
                    const date = new Date(control.estimatedCompletionDate);
                    if (!isNaN(date.getTime())) {
                      const year = date.getUTCFullYear();
                      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
                      const day = date.getUTCDate().toString().padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    }
                    return '';
                  }
                  
                  // If it's a Firebase Timestamp
                  if (control.estimatedCompletionDate instanceof Timestamp) {
                    // First validate it has valid components
                    const { seconds, nanoseconds } = control.estimatedCompletionDate;
                    if (typeof seconds !== 'number' || isNaN(seconds) ||
                        typeof nanoseconds !== 'number' || isNaN(nanoseconds)) {
                      return ''; // Invalid timestamp values
                    }
                    
                    // If we get here, it's safe to use formatDateForInput
                    return formatDateForInput(control.estimatedCompletionDate);
                  }
                  
                  // If it's a raw object with seconds (from our API response)
                  if (typeof control.estimatedCompletionDate === 'object' && 
                      control.estimatedCompletionDate !== null) {
                    const obj = control.estimatedCompletionDate as any;
                    if ('seconds' in obj && typeof obj.seconds === 'number' && !isNaN(obj.seconds)) {
                      // Convert seconds to date and format
                      const milliseconds = obj.seconds * 1000;
                      const date = new Date(milliseconds);
                      if (!isNaN(date.getTime())) {
                        const year = date.getUTCFullYear();
                        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
                        const day = date.getUTCDate().toString().padStart(2, '0');
                        return `${year}-${month}-${day}`;
                      }
                    }
                  }
                  
                  return ''; // Default case - empty string for any unknown format
                } catch (error) {
                  console.error(`Error rendering date for control ${control.id}:`, error);
                  return ''; // Return empty string for any errors
                }
              })()}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldUpdate('estimatedCompletionDate', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
            />
          </div>
        </div>

        {/* Update Error Message */}
        {updateError && (
            <p className="text-red-500 text-xs mt-2 text-right">{updateError}</p>
        )}
      </div>
    </div>
  );
} 
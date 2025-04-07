"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskStatus, Technician, ViewDensity, PriorityLevel } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';

interface TaskCardProps {
  task: Task;
  technicians: Technician[];
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  viewDensity?: ViewDensity;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
}

// Helper to format Firestore Timestamp to YYYY-MM-DD for date input
function formatDateForInput(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  try {
    // Check if timestamp is a Firestore Timestamp or has seconds property
    let date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      // Handle case where it might be a raw Firestore timestamp object
      date = new Date((timestamp as any).seconds * 1000);
    } else if (typeof timestamp === 'string') {
      // Handle case where it might be a date string
      date = new Date(timestamp);
    } else {
      return '';
    }

    if (isNaN(date.getTime())) { return ''; }
    
    // Use UTC methods to prevent timezone shifts
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) { 
    console.error("Error formatting date:", error, timestamp);
    return ''; 
  }
}

// Get time remaining until completion date
function getTimeRemaining(timestamp: Timestamp | null | any, status?: TaskStatus): { days: number; urgent: boolean; overdue: boolean; text: string } {
  if (!timestamp) return { days: 0, urgent: false, overdue: false, text: 'No date set' };
  if (status === TaskStatus.Resolved) { return { days: 0, urgent: false, overdue: false, text: 'Completed' }; }
  try {
    let date: Date;
    if (timestamp instanceof Timestamp) { date = timestamp.toDate(); }
    else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) { date = new Date(timestamp.seconds * 1000); }
    else if (typeof timestamp === 'string') { date = new Date(timestamp); }
    else { return { days: 0, urgent: false, overdue: false, text: 'Invalid date' }; }
    if (isNaN(date.getTime())) { return { days: 0, urgent: false, overdue: false, text: 'Invalid date' }; }
    
    // Use UTC dates for comparison to avoid timezone issues
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dateUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const diffTime = dateUTC.getTime() - todayUTC.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) { return { days: Math.abs(diffDays), urgent: false, overdue: true, text: `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'} overdue` }; }
    else if (diffDays === 0) { return { days: 0, urgent: true, overdue: false, text: 'Due today' }; }
    else if (diffDays <= 3) { return { days: diffDays, urgent: true, overdue: false, text: `${diffDays} ${diffDays === 1 ? 'day' : 'days'} left` }; }
    else { return { days: diffDays, urgent: false, overdue: false, text: `${diffDays} days left` }; }
  } catch (error) { return { days: 0, urgent: false, overdue: false, text: 'Error' }; }
}

// Get status color and background (with dark variants) - smoother palette
function getStatusStyles(status: TaskStatus): { color: string; background: string; border: string; darkColor: string; darkBackground: string; darkBorder: string; } {
  switch (status) {
    case TaskStatus.Open: return { color: 'text-blue-600', background: 'bg-blue-50', border: 'border-blue-100', darkColor: 'dark:text-blue-300', darkBackground: 'dark:bg-blue-900/20', darkBorder: 'dark:border-blue-800/30' };
    case TaskStatus.Pending: return { color: 'text-orange-600', background: 'bg-orange-50', border: 'border-orange-100', darkColor: 'dark:text-orange-300', darkBackground: 'dark:bg-orange-900/20', darkBorder: 'dark:border-orange-800/30' };
    case TaskStatus.Resolved: return { color: 'text-green-600', background: 'bg-green-50', border: 'border-green-100', darkColor: 'dark:text-green-300', darkBackground: 'dark:bg-green-900/20', darkBorder: 'dark:border-green-800/30' };
    default: return { color: 'text-gray-600', background: 'bg-gray-50', border: 'border-gray-100', darkColor: 'dark:text-gray-300', darkBackground: 'dark:bg-gray-800/20', darkBorder: 'dark:border-gray-700/30' };
  }
}

export function TaskCard({ 
  task, 
  technicians, 
  onUpdateTask, 
  onDeleteTask, 
  viewDensity = 'medium',
  isSelected = false,
  onSelect
}: TaskCardProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false); // Animation state for removal
  const [showDescription, setShowDescription] = useState(false); // For collapsible description
  const [menuOpen, setMenuOpen] = useState(false); // For three-dot menu
  const menuRef = useRef<HTMLDivElement>(null);

  // Derived State & Styles
  const timeRemaining = getTimeRemaining(task.estimatedCompletionDate, task.status);
  const statusStyles = getStatusStyles(task.status);
  const assigneeName = task.assigneeId ? technicians.find(tech => tech.id === task.assigneeId)?.name || 'Unknown' : 'Unassigned';
  const isHighPriority = task.priorityLevel === PriorityLevel.High || task.priorityLevel === PriorityLevel.Critical;

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

  // Handler for status change
  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as TaskStatus;
    try {
      await onUpdateTask(task.id, { status: newStatus });
    } catch (error: any) {
      setUpdateError(`Failed to update status: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for assignee change
  const handleAssigneeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAssigneeId = e.target.value || null;
    try {
      await onUpdateTask(task.id, { assigneeId: newAssigneeId });
    } catch (error: any) {
      setUpdateError(`Failed to update assignee: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for delete button click
  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsConfirmingDelete(true);
    setMenuOpen(false);
    setUpdateError(null);
  };

  // Handler for confirming delete
  const handleConfirmDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDeleting(true);
    setUpdateError(null);
    
    try {
      // First start the removal animation
      setIsRemoving(true);
      
      // Wait for animation to complete before actual deletion
      setTimeout(async () => {
        await onDeleteTask(task.id);
      }, 300); // Match this with the CSS transition duration
    } catch (error: any) {
      setUpdateError("Failed to delete task.");
      setIsDeleting(false);
      setIsConfirmingDelete(false);
      setIsRemoving(false);
    }
  };

  // Handler for canceling delete
  const handleCancelDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsConfirmingDelete(false);
    setIsDeleting(false);
    setIsRemoving(false);
    setUpdateError(null);
  };

  // Handler for selection checkbox
  const handleSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onSelect) {
      onSelect(e.target.checked);
    }
  };

  // Toggle description visibility
  const toggleDescription = () => {
    setShowDescription(!showDescription);
  };

  // Toggle menu
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  // Determine card size based on view density
  const cardClasses = viewDensity === 'compact' 
    ? 'p-3 text-sm' 
    : viewDensity === 'medium' 
      ? 'p-4' 
      : 'p-5';

  return (
    <div className={`border ${statusStyles.border} ${statusStyles.darkBorder} rounded-lg shadow-sm hover:shadow-md ${statusStyles.background} ${statusStyles.darkBackground} ${cardClasses} 
    transition-all duration-300 ease-in-out relative ${isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''} 
    ${isRemoving ? 'opacity-0 transform scale-95 -translate-x-4' : 'opacity-100 transform scale-100 translate-x-0'}`}>
      {/* Header with title and action buttons */}
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-50 text-lg pr-2">
          {task.title}
        </h3>
        
        <div className="flex items-center gap-2">
          {/* Selection checkbox */}
          {onSelect && (
            <div>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={handleSelectChange}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            </div>
          )}
          
          {/* Menu button and dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={toggleMenu}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
            </button>
            
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 z-10">
                <div className="py-1">
                  <button
                    onClick={handleDeleteClick}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Delete Ticket
                  </button>
                  {/* Add more menu options here as needed */}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error message if any */}
      {updateError && (
        <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-2 mb-3 rounded-md text-sm">
          {updateError}
        </div>
      )}

      {/* Ticket ID instead of internal ID */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {task.ticketNumber ? (
          <a
            href={task.ticketUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded">
              Ticket ID: {task.ticketNumber}
            </span>
          </a>
        ) : (
          <span className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">
            Ticket ID: Pending
          </span>
        )}
      </div>

      {/* Description toggle button */}
      {task.explanation && (
        <div>
          <button 
            onClick={toggleDescription}
            className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center mb-3 bg-gray-50 dark:bg-gray-800/70 px-2 py-1 rounded"
          >
            {showDescription ? (
              <>
                <ChevronUpIcon className="h-4 w-4 mr-1" />
                Hide Description
              </>
            ) : (
              <>
                <ChevronDownIcon className="h-4 w-4 mr-1" />
                Show Description
              </>
            )}
          </button>
          
          {/* Collapsible description */}
          {showDescription && (
            <div className="mb-4 text-sm text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-black/20 p-3 rounded-md border border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in">
              {task.explanation}
            </div>
          )}
        </div>
      )}
      
      {/* Task details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        {/* Status selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Status
          </label>
          <select
            value={task.status}
            onChange={handleStatusChange}
            className={`w-full ${statusStyles.color} ${statusStyles.darkColor} text-sm rounded-md border ${statusStyles.border} ${statusStyles.darkBorder} py-1.5 px-2 bg-white/50 dark:bg-black/20`}
          >
            <option value={TaskStatus.Open}>Open</option>
            <option value={TaskStatus.Pending}>Pending</option>
            <option value={TaskStatus.Resolved}>Resolved</option>
          </select>
        </div>

        {/* Assignee selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Assignee
          </label>
          <select
            value={task.assigneeId || ""}
            onChange={handleAssigneeChange}
            className="w-full text-sm rounded-md border border-gray-100 dark:border-gray-700 py-1.5 px-2 bg-white/50 dark:bg-black/20 text-gray-700 dark:text-gray-200"
          >
            <option value="">Unassigned</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>

        {/* Due date - without the days left text */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Due Date
          </label>
          <div className={`w-full text-sm py-1.5 px-2 rounded-md ${timeRemaining.overdue ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' : timeRemaining.urgent ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300'}`}>
            {task.estimatedCompletionDate ? 
              formatDateForInput(task.estimatedCompletionDate) :
              'No date set'
            }
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {isConfirmingDelete && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-md p-3">
          <p className="text-sm text-red-600 dark:text-red-300 mb-2">
            Are you sure you want to delete this task?
          </p>
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleCancelDelete}
              className="px-3 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs flex items-center"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </>
              ) : (
                'Confirm Delete'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { TaskStatus, Technician, BatchOperation, Group } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

interface BatchOperationsToolbarProps {
  selectedIds: string[];
  technicians: Technician[];
  groups: Group[];
  onBatchOperation: (operation: BatchOperation) => Promise<void>;
  onClearSelection: () => void;
  selectedCount: number;
  onDeleteTasks?: (taskIds: string[]) => Promise<void>;
  onAnalyzeTasks?: () => void;
}

export function BatchOperationsToolbar({
  selectedIds,
  technicians,
  groups,
  onBatchOperation,
  onClearSelection,
  selectedCount,
  onDeleteTasks,
  onAnalyzeTasks
}: BatchOperationsToolbarProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State to track which dropdown is open
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  
  // State for the date picker
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // State for delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // State for dragging functionality
  const [position, setPosition] = useState({ x: 0, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isTop, setIsTop] = useState(true);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical-left' | 'vertical-right'>('horizontal');
  const dragRef = useRef<HTMLDivElement>(null);
  
  // Set initial position from localStorage or center
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Center calculation
        const centerToolbar = () => {
          if (dragRef.current) {
            const width = dragRef.current.offsetWidth;
            return { x: (window.innerWidth - width) / 2, y: 20 };
          }
          // Fallback if ref isn't available yet
          return { x: window.innerWidth / 2 - 200, y: 20 };
        };

        const savedPosition = localStorage.getItem('toolbarPosition');
        const savedOrientation = localStorage.getItem('toolbarOrientation');
        
        if (savedPosition) {
          const pos = JSON.parse(savedPosition);
          setPosition(pos);
          setIsTop(pos.y < window.innerHeight / 2);
        } else {
          // If no saved position, center it
          setPosition(centerToolbar());
        }
        
        if (savedOrientation) {
          setOrientation(savedOrientation as 'horizontal' | 'vertical-left' | 'vertical-right');
        }

        // Force center on first load by using a flag in localStorage
        const hasLoadedBefore = localStorage.getItem('toolbarHasLoaded');
        if (!hasLoadedBefore) {
          // Set a small delay to allow the component to render first
          setTimeout(() => {
            setPosition(centerToolbar());
            localStorage.setItem('toolbarHasLoaded', 'true');
            localStorage.setItem('toolbarPosition', JSON.stringify(centerToolbar()));
          }, 100);
        }
      } catch (e) {
        // If there's an error, just position it in the center
        const centerX = Math.max(window.innerWidth / 2 - 200, 0);
        setPosition({ x: centerX, y: 20 });
      }
    }
  }, []);

  // Save position to localStorage when it changes
  useEffect(() => {
    if (!isDragging && typeof window !== 'undefined') {
      localStorage.setItem('toolbarPosition', JSON.stringify(position));
      localStorage.setItem('toolbarOrientation', orientation);
    }
  }, [position, isDragging, orientation]);
  
  // Refs for dropdown elements
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({
    status: null,
    assignee: null,
    group: null,
    dueDate: null
  });
  
  // Toggle dropdown visibility
  const toggleDropdown = (e: React.MouseEvent, name: string) => {
    e.stopPropagation(); // Prevent event from bubbling
    
    if (openDropdown === name) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(name);
    }
  };

  // Close all dropdowns when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if we're submitting
      if (isSubmitting) return;
      
      // Check if the click was inside any dropdown
      const clickedInsideDropdown = Object.keys(dropdownRefs.current).some(key => {
        const ref = dropdownRefs.current[key];
        return ref && ref.contains(event.target as Node);
      });
      
      if (!clickedInsideDropdown) {
        setOpenDropdown(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSubmitting]);

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (dragRef.current) {
      setIsDragging(true);
      const rect = dragRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // Reset position to center
  const resetPosition = () => {
    // Calculate center position
    const centerPosition = () => {
      if (dragRef.current) {
        const width = dragRef.current.offsetWidth;
        return { x: (window.innerWidth - width) / 2, y: 20 };
      }
      return { x: window.innerWidth / 2 - 200, y: 20 };
    };
    
    const newPosition = centerPosition();
    setPosition(newPosition);
    setOrientation('horizontal');
    setIsTop(true);
    
    // Save to localStorage
    localStorage.setItem('toolbarPosition', JSON.stringify(newPosition));
    localStorage.setItem('toolbarOrientation', 'horizontal');
  };

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Calculate new position
        let newX = e.clientX - dragOffset.x;
        let newY = e.clientY - dragOffset.y;
        
        // Add boundary constraints
        if (dragRef.current) {
          const width = dragRef.current.offsetWidth;
          const height = dragRef.current.offsetHeight;
          
          // Keep within window boundaries
          newX = Math.max(0, Math.min(newX, window.innerWidth - width));
          newY = Math.max(0, Math.min(newY, window.innerHeight - height));
          
          // Check if near the left or right edge and update orientation
          const EDGE_THRESHOLD = 40;
          if (newX < EDGE_THRESHOLD) {
            setOrientation('vertical-left');
          } else if (newX > window.innerWidth - width - EDGE_THRESHOLD) {
            setOrientation('vertical-right');
          } else {
            setOrientation('horizontal');
          }
        }
        
        setPosition({ x: newX, y: newY });
        
        // Determine if toolbar is now at top or bottom half of viewport
        setIsTop(newY < window.innerHeight / 2);
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Add styles to prevent text selection during drag
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.userSelect = '';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging, dragOffset]);

  // Batch update status
  const handleUpdateStatus = async (status: TaskStatus) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onBatchOperation({
        taskIds: selectedIds,
        updates: { status }
      });
      onClearSelection();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      setError(err.message || 'Failed to update status');
    } finally {
      setIsSubmitting(false);
      setOpenDropdown(null);
    }
  };

  // Batch update assignee
  const handleUpdateAssignee = async (assigneeId: string | null) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onBatchOperation({
        taskIds: selectedIds,
        updates: { assigneeId }
      });
      onClearSelection();
    } catch (err: any) {
      console.error('Failed to update assignee:', err);
      setError(err.message || 'Failed to update assignee');
    } finally {
      setIsSubmitting(false);
      setOpenDropdown(null);
    }
  };

  // Batch update group
  const handleUpdateGroup = async (groupId: string | null) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onBatchOperation({
        taskIds: selectedIds,
        updates: { groupId }
      });
      onClearSelection();
    } catch (err: any) {
      console.error('Failed to update group:', err);
      setError(err.message || 'Failed to update group');
    } finally {
      setIsSubmitting(false);
      setOpenDropdown(null);
    }
  };
  
  // Batch update due date
  const handleUpdateDueDate = async () => {
    if (!selectedDate) {
      setOpenDropdown(null);
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Convert string date to Timestamp
      const dateObj = new Date(selectedDate);
      const estimatedCompletionDate = Timestamp.fromDate(dateObj);
      
      await onBatchOperation({
        taskIds: selectedIds,
        updates: { estimatedCompletionDate }
      });
      onClearSelection();
    } catch (err: any) {
      console.error('Failed to update due date:', err);
      setError(err.message || 'Failed to update due date');
    } finally {
      setIsSubmitting(false);
      setOpenDropdown(null);
    }
  };
  
  // Batch delete tasks
  const handleDeleteTasks = async () => {
    if (!onDeleteTasks) {
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onDeleteTasks(selectedIds);
      onClearSelection();
      setShowDeleteConfirm(false);
    } catch (err: any) {
      console.error('Failed to delete tasks:', err);
      setError(err.message || 'Failed to delete tasks');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get dropdown position based on the toolbar's orientation
  const getDropdownPosition = (dropdown: string) => {
    if (orientation === 'horizontal') {
      return isTop ? 'top-full' : 'bottom-full mb-1';
    } else if (orientation === 'vertical-left') {
      return 'left-full ml-1';
    } else {
      return 'right-full mr-1';
    }
  };

  return (
    <div 
      ref={dragRef}
      className={`py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-800 dark:to-indigo-800 border-2 border-blue-400 dark:border-blue-600 rounded-xl shadow-xl animate-fade-in-down text-white ${
        orientation.startsWith('vertical') ? 'max-w-[150px]' : 'max-w-[90vw]'
      }`}
      style={{ 
        position: 'fixed',
        left: `${position.x}px`, 
        top: `${position.y}px`,
        zIndex: 100,
        opacity: isDragging ? 0.8 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'opacity 0.2s ease',
      }}
    >
      {/* Drag handle */}
      <div 
        className="w-full flex items-center justify-center mb-1 cursor-grab active:cursor-grabbing group"
        onMouseDown={handleMouseDown}
        onDoubleClick={resetPosition}
        title="Double-click to center"
      >
        <div className="w-10 h-1 bg-white/40 dark:bg-white/30 rounded-full group-hover:bg-white/60 transition-all"></div>
        <span className="sr-only">Drag to move | Double-click to center</span>
      </div>
      
      <div className={`${orientation.startsWith('vertical') ? 'flex flex-col space-y-2' : 'flex flex-wrap items-center gap-2'}`}>
        <div className="text-white text-sm font-medium flex items-center mb-1">
          <span className="flex items-center justify-center bg-white/20 text-white w-6 h-6 rounded-full mr-1.5 font-semibold">
            {selectedCount}
          </span>
          <span>{selectedCount === 1 ? 'task' : 'tasks'}</span>
        </div>
        
        {/* Batch set status dropdown */}
        <div 
          className="relative" 
          ref={(el) => { dropdownRefs.current.status = el; }}
        >
          <button 
            disabled={isSubmitting}
            onClick={(e) => toggleDropdown(e, 'status')}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-full text-xs font-medium disabled:opacity-50 transition whitespace-nowrap"
          >
            Set Status ▾
          </button>
          {openDropdown === 'status' && (
            <div 
              className={`absolute z-10 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 ${getDropdownPosition('status')}`}
              onClick={e => e.stopPropagation()}
            >
              {Object.values(TaskStatus).map(status => (
                <button
                  key={status}
                  onClick={() => handleUpdateStatus(status)}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Batch assign dropdown */}
        <div 
          className="relative"
          ref={(el) => { dropdownRefs.current.assignee = el; }}
        >
          <button 
            disabled={isSubmitting}
            onClick={(e) => toggleDropdown(e, 'assignee')}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-full text-xs font-medium disabled:opacity-50 transition whitespace-nowrap"
          >
            Assign To ▾
          </button>
          {openDropdown === 'assignee' && (
            <div 
              className={`absolute z-10 mt-1 w-40 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 ${getDropdownPosition('assignee')}`}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => handleUpdateAssignee(null)}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Unassigned
              </button>
              {technicians.map(tech => (
                <button
                  key={tech.id}
                  onClick={() => handleUpdateAssignee(tech.id)}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {tech.name}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Batch set group dropdown */}
        <div 
          className="relative"
          ref={(el) => { dropdownRefs.current.group = el; }}
        >
          <button 
            disabled={isSubmitting}
            onClick={(e) => toggleDropdown(e, 'group')}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-full text-xs font-medium disabled:opacity-50 transition whitespace-nowrap"
          >
            Set Group ▾
          </button>
          {openDropdown === 'group' && (
            <div 
              className={`absolute z-10 mt-1 w-40 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 ${getDropdownPosition('group')}`}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => handleUpdateGroup(null)}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                No Group
              </button>
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => handleUpdateGroup(group.id)}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {group.name}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Set Due Date dropdown */}
        <div 
          className="relative"
          ref={(el) => { dropdownRefs.current.dueDate = el; }}
        >
          <button 
            disabled={isSubmitting}
            onClick={(e) => toggleDropdown(e, 'dueDate')}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-full text-xs font-medium disabled:opacity-50 transition whitespace-nowrap"
          >
            Set Due Date ▾
          </button>
          {openDropdown === 'dueDate' && (
            <div 
              className={`absolute z-10 mt-1 p-2 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 ${getDropdownPosition('dueDate')}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-2">
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 p-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs"
                />
              </div>
              <button
                onClick={handleUpdateDueDate}
                className="w-full px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                disabled={!selectedDate}
              >
                Apply Date
              </button>
            </div>
          )}
        </div>
        
        {/* Analyze Tasks button */}
        {onAnalyzeTasks && (
          <button
            onClick={onAnalyzeTasks}
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-indigo-500/40 hover:bg-indigo-500/60 text-white border border-indigo-300/50 rounded-full text-xs font-medium disabled:opacity-50 flex items-center transition whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            Analyze
          </button>
        )}
        
        {/* Delete button */}
        {onDeleteTasks && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-red-500/40 hover:bg-red-500/60 text-white border border-red-300/50 rounded-full text-xs font-medium disabled:opacity-50 transition whitespace-nowrap"
          >
            Delete
          </button>
        )}
        
        {/* Clear selection button */}
        <button
          onClick={onClearSelection}
          disabled={isSubmitting}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-full text-xs font-medium disabled:opacity-50 transition whitespace-nowrap"
        >
          Clear
        </button>
        
        {/* Loading indicator */}
        {isSubmitting && (
          <div className="flex-none ml-1">
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mt-1 text-xs text-red-200">
          {error}
        </div>
      )}
      
      {/* Modern Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center mb-4 text-red-600 dark:text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Confirm Deletion</h3>
            </div>
            
            <div className="mb-5">
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to delete {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'}? This action cannot be undone.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleDeleteTasks}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors flex items-center"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
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

  return (
    <div className="py-2 px-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-blue-700 dark:text-blue-300 text-sm font-medium">
          {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} selected
        </div>
        
        {/* Batch set status dropdown */}
        <div 
          className="relative" 
          ref={(el) => { dropdownRefs.current.status = el; }}
        >
          <button 
            disabled={isSubmitting}
            onClick={(e) => toggleDropdown(e, 'status')}
            className="px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Set Status ▾
          </button>
          {openDropdown === 'status' && (
            <div 
              className="absolute z-10 mt-1 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
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
            className="px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Assign To ▾
          </button>
          {openDropdown === 'assignee' && (
            <div 
              className="absolute z-10 mt-1 w-40 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
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
            className="px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Set Group ▾
          </button>
          {openDropdown === 'group' && (
            <div 
              className="absolute z-10 mt-1 w-40 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
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
            className="px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Set Due Date ▾
          </button>
          {openDropdown === 'dueDate' && (
            <div 
              className="absolute z-10 mt-1 p-2 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
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
            className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800/50 rounded text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/30 disabled:opacity-50 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            Analyze Tasks
          </button>
        )}
        
        {/* Delete button */}
        {onDeleteTasks && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSubmitting}
            className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-300 dark:border-red-800/50 rounded text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800/30 disabled:opacity-50"
          >
            Delete Selected
          </button>
        )}
        
        {/* Clear selection button */}
        <button
          onClick={onClearSelection}
          disabled={isSubmitting}
          className="px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Clear Selection
        </button>
        
        {/* Loading indicator */}
        {isSubmitting && (
          <div className="flex-none ml-1">
            <svg className="animate-spin h-4 w-4 text-blue-700 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mt-1 text-xs text-red-700 dark:text-red-300">
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
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Task, Technician, TaskStatus, ViewDensity, Group, Category } from '@/lib/types';
import { TaskCard } from './TaskCard';
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface TaskGroupViewProps {
  tasks: Task[];
  technicians: Technician[];
  groups: Group[];
  categories?: Category[];
  groupBy: 'status' | 'assignee' | 'group' | 'none';
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  viewDensity: ViewDensity;
  selectedTaskIds: string[];
  onTaskSelection: (taskId: string, selected: boolean) => void;
  getGroupName: (groupId: string | null) => string;
}

// Non-draggable Group Component
function GroupItem({
  groupKey,
  groupTitle,
  groupTasks,
  isCollapsed,
  onToggleCollapse,
  children,
  className
}: {
  groupKey: string;
  groupTitle: string;
  groupTasks: Task[];
  isCollapsed: boolean;
  onToggleCollapse: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div 
      className={`relative bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 rounded-2xl shadow-2xl transition-all overflow-hidden w-full ${className || ''}`}
    >
      {/* Group header */}
      <div 
        className="px-6 py-4 flex justify-between items-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm rounded-t-2xl border-b border-gray-200 dark:border-gray-700"
      >
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
            {groupTitle}
            <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5 text-gray-700 dark:text-gray-300">
              {groupTasks.length}
            </span>
          </h3>
        </div>
        
        {/* Collapse/Expand button */}
        <button 
          onClick={() => onToggleCollapse(groupKey)}
          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          aria-label={isCollapsed ? "Expand group" : "Collapse group"}
        >
          {isCollapsed ? (
            <ChevronDownIcon className="w-5 h-5" />
          ) : (
            <ChevronUpIcon className="w-5 h-5" />
          )}
        </button>
      </div>
      
      {/* Group content - collapsible */}
      <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-full'}`}>
        <div className="p-6">
          <div className="space-y-6">
            {children}
          </div>
          
          {/* Empty state */}
          {groupTasks.length === 0 && (
            <div className="text-center py-4">
              <p className="text-gray-500 dark:text-gray-400">No tasks in this group</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaskGroupView({
  tasks,
  technicians,
  groups,
  categories = [],
  groupBy,
  onUpdateTask,
  onDeleteTask,
  viewDensity,
  selectedTaskIds,
  onTaskSelection,
  getGroupName
}: TaskGroupViewProps) {
  // State for pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right' | null>(null);
  const [columnsPerPage, setColumnsPerPage] = useState(3); // Default to 3 columns
  
  // State for collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  
  // State for group order (default ordering, no longer draggable)
  const [groupOrder, setGroupOrder] = useState<string[]>([]);

  // Group tasks by the specified grouping
  const groupedTasks = React.useMemo(() => {
    const taskGroups: Map<string, Task[]> = new Map<string, Task[]>();
    
    if (groupBy === 'status') {
      // Initialize groups for all statuses
      Object.values(TaskStatus).forEach(status => {
        taskGroups.set(status, []);
      });
      
      // Group tasks by status
      tasks.forEach(task => {
        const group = taskGroups.get(task.status) || [];
        group.push(task);
        taskGroups.set(task.status, group);
      });
    } 
    else if (groupBy === 'assignee') {
      // Initialize a group for unassigned
      taskGroups.set('unassigned', []);
      
      // Initialize groups for all technicians
      technicians.forEach(tech => {
        taskGroups.set(tech.id, []);
      });
      
      // Group tasks by assignee
      tasks.forEach(task => {
        const assigneeId = task.assigneeId || 'unassigned';
        const group = taskGroups.get(assigneeId) || [];
        group.push(task);
        taskGroups.set(assigneeId, group);
      });
    }
    else if (groupBy === 'group') {
      // Initialize a group for no group
      taskGroups.set('nogroup', []);
      
      // Initialize groups for all defined groups
      groups.forEach(group => {
        taskGroups.set(group.id, []);
      });
      
      // Group tasks by group
      tasks.forEach(task => {
        const groupId = task.groupId || 'nogroup';
        const group = taskGroups.get(groupId) || [];
        group.push(task);
        taskGroups.set(groupId, group);
      });
    }
    
    // Remove empty groups
    for (const [key, value] of taskGroups.entries()) {
      if (value.length === 0) {
        taskGroups.delete(key);
      }
    }
    
    return taskGroups;
  }, [tasks, groupBy, technicians, groups]);

  // Get group title
  const getGroupTitle = (groupKey: string) => {
    if (groupBy === 'status') {
      return groupKey; // Use status as is
    } 
    else if (groupBy === 'assignee') {
      if (groupKey === 'unassigned') {
        return 'Unassigned';
      }
      const technician = technicians.find(tech => tech.id === groupKey);
      return technician ? technician.name : 'Unknown';
    }
    else if (groupBy === 'group') {
      if (groupKey === 'nogroup') {
        return 'No Group';
      }
      const group = groups.find(g => g.id === groupKey);
      return group ? group.name : 'Unknown Group';
    }
    return 'Unknown Group';
  };

  // Get group count for summary
  const getGroupSummary = (tasks: Task[]) => {
    const openCount = tasks.filter(task => task.status === TaskStatus.Open).length;
    const pendingCount = tasks.filter(task => task.status === TaskStatus.Pending).length;
    const resolvedCount = tasks.filter(task => task.status === TaskStatus.Resolved).length;
    
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        <span className="text-indigo-600 dark:text-indigo-400">{openCount} open</span>
        {pendingCount > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400">{pendingCount} pending</span>}
        {resolvedCount > 0 && <span className="ml-2 text-emerald-600 dark:text-emerald-400">{resolvedCount} resolved</span>}
      </div>
    );
  };

  // Update group order when groupedTasks changes
  useEffect(() => {
    const keys = Array.from(groupedTasks.keys());
    if (!groupOrder.length || !arraysHaveSameElements(groupOrder, keys)) {
      setGroupOrder(keys);
    }
  }, [groupedTasks, groupOrder]);

  // Helper to compare arrays
  function arraysHaveSameElements(arr1: string[], arr2: string[]) {
    if (arr1.length !== arr2.length) return false;
    const set1 = new Set(arr1);
    return arr2.every(item => set1.has(item));
  }

  // Define currentGroups with proper typing
  const currentGroups: [string, Task[]][] = React.useMemo(() => {
    const orderedGroups: [string, Task[]][] = [];
    
    groupOrder.forEach(key => {
      const tasks = groupedTasks.get(key);
      if (tasks && tasks.length > 0) {
        orderedGroups.push([key, tasks]);
      }
    });
    
    // Calculate start and end indices for pagination
    const startIdx = currentPage * columnsPerPage;
    let endIdx = startIdx + columnsPerPage;
    
    // Ensure we don't exceed the array bounds
    if (endIdx > orderedGroups.length) {
      endIdx = orderedGroups.length;
    }
    
    // Return the sliced array for current page
    return orderedGroups.slice(startIdx, endIdx);
  }, [groupedTasks, groupOrder, currentPage, columnsPerPage]);

  // Calculate all group entries for determining total pages 
  const groupEntries: [string, Task[]][] = React.useMemo(() => {
    return groupOrder
      .filter(key => groupedTasks.has(key))
      .map(key => [key, groupedTasks.get(key)!]);
  }, [groupOrder, groupedTasks]);

  // Calculate total pages
  const totalPages = Math.ceil(groupEntries.length / columnsPerPage);

  // Navigate to previous page with animation
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 0 && !isAnimating) {
      setIsAnimating(true);
      setAnimationDirection('right');
      
      // Allow animation to complete before changing page
      setTimeout(() => {
        setCurrentPage(prev => prev - 1);
        setTimeout(() => {
          setIsAnimating(false);
        }, 50);
      }, 250);
    }
  }, [currentPage, isAnimating]);

  // Navigate to next page with animation
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1 && !isAnimating) {
      setIsAnimating(true);
      setAnimationDirection('left');
      
      // Allow animation to complete before changing page
      setTimeout(() => {
        setCurrentPage(prev => prev + 1);
        setTimeout(() => {
          setIsAnimating(false);
        }, 50);
      }, 250);
    }
  }, [currentPage, isAnimating, totalPages]);

  // Reset animation direction when animation ends
  useEffect(() => {
    if (!isAnimating) {
      setAnimationDirection(null);
    }
  }, [isAnimating]);

  // Determine animation classes
  const getAnimationClasses = () => {
    if (!isAnimating && animationDirection === null) {
      return 'transform transition-all duration-300 opacity-100 translate-x-0';
    }
    
    if (isAnimating) {
      if (animationDirection === 'left') {
        return 'transform transition-all duration-300 opacity-0 -translate-x-10';
      } else {
        return 'transform transition-all duration-300 opacity-0 translate-x-10';
      }
    }
    
    return '';
  };

  // Handle keyboard navigation for left/right arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keypresses if we have pagination
      if (totalPages <= 1) return;
      
      if (e.key === 'ArrowLeft' && currentPage > 0) {
        goToPreviousPage();
      } else if (e.key === 'ArrowRight' && currentPage < totalPages - 1) {
        goToNextPage();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPage, goToNextPage, goToPreviousPage, totalPages]);

  // Listen for custom column count change event (now matching TaskFilterBar dispatch)
  useEffect(() => {
    const handleColumnCountChange = (event: CustomEvent) => {
      const count = event.detail.count;
      if (count >= 2 && count <= 4) {
        setColumnsPerPage(count);
        // If changing columns would put us past the end, go back to page 0
        if (currentPage * count >= groupEntries.length) {
          setCurrentPage(0);
        }
      }
    };
    
    // Now listening to 'setColumnCount' to match dispatch in TaskFilterBar
    window.addEventListener('setColumnCount' as any, handleColumnCountChange);
    return () => {
      window.removeEventListener('setColumnCount' as any, handleColumnCountChange);
    };
  }, [currentPage, groupEntries.length]);

  // Dynamically adjust columns: avoid blank columns when fewer groups than chosen count
  const effectiveColumns = currentGroups.length > 0
    ? Math.min(columnsPerPage, currentGroups.length)
    : columnsPerPage;

  return (
    <div className="relative">
      {/* Pagination controls */}
      {totalPages > 1 && (
        <>
          <button 
            onClick={goToPreviousPage}
            disabled={currentPage <= 0 || isAnimating}
            className={`fixed left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700
              ${(currentPage <= 0 || isAnimating) 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-700'
              } transition-all z-50`}
            aria-label="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <button 
            onClick={goToNextPage}
            disabled={currentPage >= totalPages - 1 || isAnimating}
            className={`fixed right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700
              ${(currentPage >= totalPages - 1 || isAnimating) 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-700'
              } transition-all z-50`}
            aria-label="Next page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      
      {/* Page indicator */}
      {totalPages > 1 && (
        <div className="fixed bottom-4 right-4 text-xs py-1 px-2 bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 opacity-80 z-40">
          {currentPage + 1}/{totalPages}
        </div>
      )}
      
      {/* Main content with non-draggable groups */}
      <div className="px-4 py-6 space-y-12">
        {/* Render current page groups one after another, with cards flowing in a grid */}
        {currentGroups.map(([groupKey, groupTasks]) => {
          const isCollapsed = collapsedGroups[groupKey] || false;
          
          return (
            <div 
              key={groupKey} 
              className={`relative bg-gradient-to-br from-white to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-3xl shadow-2xl hover:shadow-3xl transition-all ${columnsPerPage === 4 ? 'p-3 space-y-2' : 'p-6 space-y-6'}`}
            >
              {/* Group header */}
              <div className={`flex justify-between items-center ${columnsPerPage === 4 ? 'mb-1' : 'mb-4'}`}>
                <div>
                  <h3 className={`${columnsPerPage === 4 ? 'text-sm' : 'text-xl'} font-semibold text-gray-900 dark:text-gray-100 flex items-center`}>
                    {getGroupTitle(groupKey)}
                    <span className={`${columnsPerPage === 4 ? 'ml-1 text-xs px-1.5 py-0' : 'ml-2 text-sm px-3 py-1'} bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 rounded-full`}>
                      {groupTasks.length}
                    </span>
                  </h3>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Select All button - only show if there are tasks in the group */}
                  {groupTasks.length > 0 && (
                    <button
                      onClick={() => {
                        // Check if all tasks in this group are already selected
                        const allSelected = groupTasks.every(task => selectedTaskIds.includes(task.id));
                        
                        // If all are selected, deselect all. Otherwise, select all
                        groupTasks.forEach(task => {
                          onTaskSelection(task.id, !allSelected);
                        });
                      }}
                      className={`${columnsPerPage === 4 ? 'p-1 text-xs' : 'p-1.5 text-sm'} rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30 
                        text-indigo-600 dark:text-indigo-400 transition flex items-center`}
                      title={groupTasks.every(task => selectedTaskIds.includes(task.id)) 
                        ? "Deselect all tasks in this group" 
                        : "Select all tasks in this group"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className={`${columnsPerPage === 4 ? 'w-3.5 h-3.5' : 'w-4 h-4'} mr-1`} 
                           fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span className={columnsPerPage === 4 ? 'hidden' : 'inline'}>
                        {groupTasks.every(task => selectedTaskIds.includes(task.id)) ? "Deselect All" : "Select All"}
                      </span>
                    </button>
                  )}
                
                  {/* Collapse/Expand button */}
                  <button 
                    onClick={() => setCollapsedGroups(prev => ({...prev, [groupKey]: !prev[groupKey]}))}
                    className={`${columnsPerPage === 4 ? 'p-1' : 'p-2'} rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition`}
                    aria-label={isCollapsed ? "Expand group" : "Collapse group"}
                  >
                    {isCollapsed ? (
                      <ChevronDownIcon className={`${columnsPerPage === 4 ? 'w-4 h-4' : 'w-6 h-6'}`} />
                    ) : (
                      <ChevronUpIcon className={`${columnsPerPage === 4 ? 'w-4 h-4' : 'w-6 h-6'}`} />
                    )}
                  </button>
                </div>
              </div>
              
              {/* Cards grid */}
              <div 
                className={`transition-all duration-500 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0 invisible' : 'max-h-full opacity-100 visible'}`}
              >
                <div 
                  className={`grid ${columnsPerPage === 4 ? 'gap-2' : 'gap-8'} ${getAnimationClasses()}`}
                  style={{ gridTemplateColumns: `repeat(${columnsPerPage}, minmax(0, 1fr))` }}
                >
                  {(groupTasks as Task[]).map(task => (
                    <div key={task.id} className={`transform ${columnsPerPage === 4 ? 'hover:-translate-y-0.5' : 'hover:-translate-y-1.5'} transition-transform duration-200`}>
                      <TaskCard
                        task={task}
                        technicians={technicians}
                        categories={categories}
                        onUpdateTask={onUpdateTask}
                        onDeleteTask={onDeleteTask}
                        viewDensity={viewDensity}
                        isSelected={selectedTaskIds.includes(task.id)}
                        onSelect={(selected) => onTaskSelection(task.id, selected)}
                      />
                    </div>
                  ))}
                </div>
                
                {/* Empty state */}
                {groupTasks.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-gray-500 dark:text-gray-400">No tasks in this group</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 
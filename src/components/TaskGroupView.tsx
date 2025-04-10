"use client";

import React, { useState, useEffect } from 'react';
import { Task, Technician, TaskStatus, ViewDensity, Group, Category } from '@/lib/types';
import { TaskCard } from './TaskCard';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

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
  const columnsPerPage = 3;
  
  // Group tasks by the specified grouping
  const groupedTasks = React.useMemo(() => {
    const taskGroups = new Map<string, Task[]>();
    
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

  // Convert Map to Array for pagination
  const groupEntries = Array.from(groupedTasks.entries());
  const totalPages = Math.ceil(groupEntries.length / columnsPerPage);

  // Get the current page's groups
  const currentGroups = groupEntries.slice(
    currentPage * columnsPerPage,
    (currentPage + 1) * columnsPerPage
  );

  // Navigate to previous page with animation
  const goToPreviousPage = () => {
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
  };

  // Navigate to next page with animation
  const goToNextPage = () => {
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
  };

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

  return (
    <div className="relative">
      {/* Pagination controls */}
      {totalPages > 1 && (
        <>
          {/* Left arrow */}
          <button 
            onClick={goToPreviousPage}
            disabled={currentPage === 0 || isAnimating}
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 p-2 rounded-full 
              ${(currentPage === 0 || isAnimating) 
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              } transition-colors z-10`}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          
          {/* Right arrow */}
          <button 
            onClick={goToNextPage}
            disabled={currentPage >= totalPages - 1 || isAnimating}
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 p-2 rounded-full
              ${(currentPage >= totalPages - 1 || isAnimating) 
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              } transition-colors z-10`}
            aria-label="Next page"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        </>
      )}
      
      {/* Page indicator */}
      {totalPages > 1 && (
        <div className="flex justify-center mb-4 text-sm text-gray-500 dark:text-gray-400">
          Page {currentPage + 1} of {totalPages}
        </div>
      )}
      
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${getAnimationClasses()}`}>
        {/* Render current page groups */}
        {currentGroups.map(([groupKey, groupTasks]) => (
          <div key={groupKey} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            {/* Group header */}
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {getGroupTitle(groupKey)}
              </h3>
              {getGroupSummary(groupTasks)}
            </div>
            
            {/* Tasks in this group */}
            <div className="space-y-4">
              {groupTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  technicians={technicians}
                  categories={categories}
                  onUpdateTask={onUpdateTask}
                  onDeleteTask={onDeleteTask}
                  viewDensity={viewDensity}
                  isSelected={selectedTaskIds.includes(task.id)}
                  onSelect={(selected) => onTaskSelection(task.id, selected)}
                />
              ))}
            </div>
            
            {/* Empty state */}
            {groupTasks.length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500 dark:text-gray-400">No tasks in this group</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 
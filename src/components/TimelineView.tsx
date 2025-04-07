"use client";

import React, { useMemo } from 'react';
import { Task, Technician, Group, ViewDensity, TaskStatus } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

interface TimelineViewProps {
  tasks: Task[];
  technicians: Technician[];
  groups: Group[];
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  viewDensity: ViewDensity;
}

interface TimelineGroup {
  id: string;
  title: string;
  rightTitle?: string;
  tasks: Task[];
}

export function TimelineView({
  tasks,
  technicians,
  groups,
  onUpdateTask,
  viewDensity
}: TimelineViewProps) {
  // Format a date for display
  const formatDate = (timestamp: Timestamp | null): string => {
    if (!timestamp) return 'No date';
    
    try {
      let date: Date;
      if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
        date = new Date((timestamp as any).seconds * 1000);
      } else {
        return 'Invalid date';
      }
      
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Get status color classes
  const getStatusClasses = (status: TaskStatus): string => {
    switch (status) {
      case TaskStatus.Open:
        return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700';
      case TaskStatus.Pending:
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700';
      case TaskStatus.Resolved:
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  // Group tasks by due date
  const tasksByDueDate = useMemo(() => {
    // Create groups for different timeframes
    const groups: { [key: string]: TimelineGroup } = {
      'overdue': { id: 'overdue', title: 'Overdue', tasks: [] },
      'today': { id: 'today', title: 'Today', tasks: [] },
      'tomorrow': { id: 'tomorrow', title: 'Tomorrow', tasks: [] },
      'thisWeek': { id: 'thisWeek', title: 'This Week', tasks: [] },
      'nextWeek': { id: 'nextWeek', title: 'Next Week', tasks: [] },
      'later': { id: 'later', title: 'Later', tasks: [] },
      'noDate': { id: 'noDate', title: 'No Due Date', tasks: [] }
    };
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get tomorrow's date
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get date for end of this week (Sunday)
    const thisWeekEnd = new Date(today);
    const daysUntilSunday = 7 - today.getDay();
    thisWeekEnd.setDate(thisWeekEnd.getDate() + daysUntilSunday);
    
    // Get date for end of next week
    const nextWeekEnd = new Date(thisWeekEnd);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    
    // Group tasks by due date
    tasks.forEach(task => {
      if (!task.estimatedCompletionDate) {
        groups.noDate.tasks.push(task);
        return;
      }
      
      // Convert to Date object
      let dueDate: Date;
      if (task.estimatedCompletionDate instanceof Timestamp) {
        dueDate = task.estimatedCompletionDate.toDate();
      } else if (typeof task.estimatedCompletionDate === 'object' && 'seconds' in task.estimatedCompletionDate) {
        dueDate = new Date((task.estimatedCompletionDate as any).seconds * 1000);
      } else {
        groups.noDate.tasks.push(task);
        return;
      }
      
      // Normalize time
      dueDate.setHours(0, 0, 0, 0);
      
      // Determine which group this task belongs to
      if (dueDate < today) {
        groups.overdue.tasks.push(task);
      } else if (dueDate.getTime() === today.getTime()) {
        groups.today.tasks.push(task);
      } else if (dueDate.getTime() === tomorrow.getTime()) {
        groups.tomorrow.tasks.push(task);
      } else if (dueDate <= thisWeekEnd) {
        groups.thisWeek.tasks.push(task);
      } else if (dueDate <= nextWeekEnd) {
        groups.nextWeek.tasks.push(task);
      } else {
        groups.later.tasks.push(task);
      }
    });
    
    // Remove empty groups and sort tasks within each group
    return Object.values(groups)
      .filter(group => group.tasks.length > 0)
      .map(group => ({
        ...group,
        tasks: group.tasks.sort((a, b) => {
          // Sort by status first
          const statusOrder = { [TaskStatus.Open]: 0, [TaskStatus.Pending]: 1, [TaskStatus.Resolved]: 2 };
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) return statusDiff;
          
          // Then sort by due date
          const dateA = a.estimatedCompletionDate ? (a.estimatedCompletionDate instanceof Timestamp ? a.estimatedCompletionDate.toDate() : new Date((a.estimatedCompletionDate as any).seconds * 1000)) : new Date(9999, 11, 31);
          const dateB = b.estimatedCompletionDate ? (b.estimatedCompletionDate instanceof Timestamp ? b.estimatedCompletionDate.toDate() : new Date((b.estimatedCompletionDate as any).seconds * 1000)) : new Date(9999, 11, 31);
          return dateA.getTime() - dateB.getTime();
        })
      }));
  }, [tasks]);

  // Get task groups for the timeline
  const getTaskGroups = () => {
    if (tasksByDueDate.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No tasks with due dates found</p>
        </div>
      );
    }
    
    return tasksByDueDate.map(group => (
      <div key={group.id} className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
          {group.title}
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
            ({group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'})
          </span>
        </h3>
        
        <div className="space-y-2">
          {group.tasks.map(task => (
            <div 
              key={task.id} 
              className={`border rounded-lg p-3 ${getStatusClasses(task.status)}`}
            >
              <div className="flex justify-between items-start">
                <h4 className="font-medium">{task.title}</h4>
                <div className="text-xs px-2 py-1 rounded-full bg-white/50 dark:bg-black/20">
                  {task.status}
                </div>
              </div>
              
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {task.assigneeId && (
                  <div className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    <span>
                      {technicians.find(t => t.id === task.assigneeId)?.name || 'Unknown'}
                    </span>
                  </div>
                )}
                
                {task.groupId && (
                  <div className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                    </svg>
                    <span>
                      {groups.find(g => g.id === task.groupId)?.name || 'Unknown Group'}
                    </span>
                  </div>
                )}
                
                {task.estimatedCompletionDate && (
                  <div className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    <span>
                      {formatDate(task.estimatedCompletionDate)}
                    </span>
                  </div>
                )}
                
                {task.ticketNumber && (
                  <div className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <a 
                      href={task.ticketUrl || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {task.ticketNumber}
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg">
      {getTaskGroups()}
    </div>
  );
} 
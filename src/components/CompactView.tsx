"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Task, Technician, Group, ViewDensity, TaskStatus, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { ChevronUpIcon, ChevronDownIcon, EllipsisHorizontalIcon, CheckIcon, ClockIcon, ArrowPathIcon, DocumentIcon, LinkIcon, PlusIcon } from '@heroicons/react/24/outline';
import DOMPurify from 'dompurify';

interface CompactViewProps {
  tasks: Task[];
  technicians: Technician[];
  groups: Group[];
  categories?: Category[];
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  viewDensity: ViewDensity;
  selectedTaskIds: string[];
  onTaskSelection: (taskId: string, selected: boolean) => void;
}

type SortKey = 'title' | 'status' | 'assignee' | 'due' | 'priority' | 'group' | 'category';
type SortDirection = 'asc' | 'desc';

export function CompactView({
  tasks,
  technicians,
  groups,
  categories = [],
  onUpdateTask,
  onDeleteTask,
  viewDensity,
  selectedTaskIds,
  onTaskSelection
}: CompactViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [isCreatingTicket, setIsCreatingTicket] = useState<string | null>(null);
  const [isDeletingTicket, setIsDeletingTicket] = useState<string | null>(null);

  // Row height based on view density
  const rowHeight = useMemo(() => {
    switch (viewDensity) {
      case 'compact': return 'h-8';
      case 'medium': return 'h-10';
      case 'full': return 'h-12';
      default: return 'h-10';
    }
  }, [viewDensity]);

  // Handle sort click
  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Format date for display
  const formatDate = (timestamp: Timestamp | null): string => {
    if (!timestamp) return '—';
    
    try {
      let date: Date;
      if (timestamp instanceof Timestamp) {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
        date = new Date((timestamp as any).seconds * 1000);
      } else {
        return '—';
      }
      
      // Format as MM/DD/YYYY
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return '—';
    }
  };

  // Get days left indicator
  const getDaysLeft = (timestamp: Timestamp | null, status: TaskStatus): { text: string; className: string } => {
    if (!timestamp || status === TaskStatus.Resolved) {
      return { text: '—', className: 'text-gray-400' };
    }
    
    try {
      let dueDate: Date;
      if (timestamp instanceof Timestamp) {
        dueDate = timestamp.toDate();
      } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
        dueDate = new Date((timestamp as any).seconds * 1000);
      } else {
        return { text: '—', className: 'text-gray-400' };
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        return { 
          text: `${Math.abs(diffDays)}d overdue`, 
          className: 'text-red-600 font-medium'
        };
      } else if (diffDays === 0) {
        return { 
          text: 'Today', 
          className: 'text-amber-600 font-medium'
        };
      } else if (diffDays === 1) {
        return { 
          text: 'Tomorrow', 
          className: 'text-amber-600'
        };
      } else if (diffDays <= 3) {
        return { 
          text: `${diffDays} days`, 
          className: 'text-amber-600'
        };
      } else {
        return { 
          text: `${diffDays} days`, 
          className: 'text-gray-600'
        };
      }
    } catch (error) {
      console.error('Error calculating days left:', error);
      return { text: '—', className: 'text-gray-400' };
    }
  };
  
  // Get status indicator component
  const getStatusIndicator = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.Open:
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2"></div>
            <span className="text-indigo-600 dark:text-indigo-400">Open</span>
          </div>
        );
      case TaskStatus.Pending:
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
            <span className="text-amber-600 dark:text-amber-400">Pending</span>
          </div>
        );
      case TaskStatus.Resolved:
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
            <span className="text-emerald-600 dark:text-emerald-400">Resolved</span>
          </div>
        );
      default:
        return <span>Unknown</span>;
    }
  };

  // Get priority badge
  const getPriorityBadge = (priority: PriorityLevel | null) => {
    if (!priority) return null;
    
    switch (priority) {
      case PriorityLevel.Low:
        return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Low</span>;
      case PriorityLevel.Medium:
        return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">Medium</span>;
      case PriorityLevel.High:
        return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300">High</span>;
      case PriorityLevel.Critical:
        return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300">Critical</span>;
      default:
        return null;
    }
  };

  // Toggle task expansion
  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * direction;
        
        case 'status': {
          const statusOrder = { [TaskStatus.Open]: 0, [TaskStatus.Pending]: 1, [TaskStatus.Resolved]: 2 };
          return (statusOrder[a.status] - statusOrder[b.status]) * direction;
        }
        
        case 'assignee': {
          const aName = a.assigneeId 
            ? technicians.find(t => t.id === a.assigneeId)?.name || 'ZZZ'
            : 'ZZZ';
          const bName = b.assigneeId
            ? technicians.find(t => t.id === b.assigneeId)?.name || 'ZZZ'
            : 'ZZZ';
          return aName.localeCompare(bName) * direction;
        }
        
        case 'due': {
          const aDate = a.estimatedCompletionDate
            ? (a.estimatedCompletionDate instanceof Timestamp 
              ? a.estimatedCompletionDate.toDate() 
              : new Date((a.estimatedCompletionDate as any).seconds * 1000))
            : new Date(9999, 11, 31);
          
          const bDate = b.estimatedCompletionDate
            ? (b.estimatedCompletionDate instanceof Timestamp 
              ? b.estimatedCompletionDate.toDate() 
              : new Date((b.estimatedCompletionDate as any).seconds * 1000))
            : new Date(9999, 11, 31);
          
          return (aDate.getTime() - bDate.getTime()) * direction;
        }
        
        case 'priority': {
          const priorityOrder: Record<string, number> = {
            [PriorityLevel.Low]: 0,
            [PriorityLevel.Medium]: 1,
            [PriorityLevel.High]: 2,
            [PriorityLevel.Critical]: 3,
            'null': -1
          };
          
          const aPriority = a.priorityLevel ? priorityOrder[a.priorityLevel] : priorityOrder['null'];
          const bPriority = b.priorityLevel ? priorityOrder[b.priorityLevel] : priorityOrder['null'];
          
          return (aPriority - bPriority) * direction;
        }
        
        case 'group': {
          const aGroup = a.groupId 
            ? groups.find(g => g.id === a.groupId)?.name || 'ZZZ'
            : 'ZZZ';
          const bGroup = b.groupId
            ? groups.find(g => g.id === b.groupId)?.name || 'ZZZ'
            : 'ZZZ';
          return aGroup.localeCompare(bGroup) * direction;
        }
        
        case 'category': {
          const aCategory = a.categoryId 
            ? categories.find(c => c.id === a.categoryId)?.value || 'ZZZ'
            : 'ZZZ';
          const bCategory = b.categoryId
            ? categories.find(c => c.id === b.categoryId)?.value || 'ZZZ'
            : 'ZZZ';
          return aCategory.localeCompare(bCategory) * direction;
        }
        
        default:
          return 0;
      }
    });
  }, [tasks, sortKey, sortDirection, technicians, groups, categories]);

  // Sort indicator
  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return (
        <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-50">
          <ChevronUpIcon className="w-4 h-4" />
        </div>
      );
    }
    
    return sortDirection === 'asc' ? (
      <div className="w-4 h-4 ml-1">
        <ChevronUpIcon className="w-4 h-4" />
      </div>
    ) : (
      <div className="w-4 h-4 ml-1">
        <ChevronDownIcon className="w-4 h-4" />
      </div>
    );
  };

  // Quick status update
  const handleQuickStatusUpdate = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await onUpdateTask(taskId, { status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  // Add ticket handling functions
  // Create a FreshService ticket
  const handleCreateTicket = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    setIsCreatingTicket(taskId);
    
    try {
      // Get category name
      const categoryName = task.categoryId ? categories.find(c => c.id === task.categoryId)?.value : null;
      
      // Format due date if available
      const dueDate = task.estimatedCompletionDate 
        ? (task.estimatedCompletionDate instanceof Timestamp 
            ? task.estimatedCompletionDate.toDate() 
            : new Date((task.estimatedCompletionDate as any).seconds * 1000))
        : null;
      
      // If no due date is available, set it to a week from now
      const oneDueDate = dueDate 
        ? dueDate.toISOString().split('T')[0]
        : (() => {
            const date = new Date();
            date.setDate(date.getDate() + 7);
            return date.toISOString().split('T')[0];
          })();
      
      // Prepare the request data
      const requestData = {
        taskId: task.id,
        subject: task.title,
        description: task.explanation || 'No description',
        responderId: task.assigneeId,
        dueDate: oneDueDate,
        categoryName
      };
      
      // Call the API endpoint
      const response = await fetch('/api/freshservice/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create ticket');
      }
      
      // Process successful response
      const data = await response.json();
      
      // Update the task with ticket information
      await onUpdateTask(task.id, {
        ticketNumber: String(data.ticketId),
        ticketUrl: data.ticketUrl
      });
      
    } catch (error: any) {
      console.error('Error creating ticket:', error);
    } finally {
      setIsCreatingTicket(null);
    }
  };
  
  // Open ticket URL in a new tab
  const openTicketUrl = (ticketUrl: string) => {
    if (ticketUrl) {
      window.open(ticketUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  // Delete a ticket
  const handleDeleteTicket = async (taskId: string, ticketNumber: string) => {
    if (!ticketNumber) return;
    
    setIsDeletingTicket(taskId);
    
    try {
      // Call the FreshService API to delete the ticket
      const response = await fetch(`/api/freshservice/tickets/${ticketNumber}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete ticket');
      }
      
      // Update the task to remove the ticket information
      await onUpdateTask(taskId, {
        ticketNumber: null,
        ticketUrl: null
      });
      
    } catch (error: any) {
      console.error('Error deleting ticket:', error);
    } finally {
      setIsDeletingTicket(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No tasks found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" className="px-3 py-3 w-8">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-indigo-400"
                      checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all tasks
                          tasks.forEach(task => {
                            if (!selectedTaskIds.includes(task.id)) {
                              onTaskSelection(task.id, true);
                            }
                          });
                        } else {
                          // Deselect all tasks
                          selectedTaskIds.forEach(id => {
                            onTaskSelection(id, false);
                          });
                        }
                      }}
                    />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group"
                  onClick={() => handleSortClick('title')}
                >
                  <div className="flex items-center">
                    <span>Task</span>
                    <SortIndicator column="title" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group"
                  onClick={() => handleSortClick('status')}
                >
                  <div className="flex items-center">
                    <span>Status</span>
                    <SortIndicator column="status" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group"
                  onClick={() => handleSortClick('assignee')}
                >
                  <div className="flex items-center">
                    <span>Assignee</span>
                    <SortIndicator column="assignee" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group"
                  onClick={() => handleSortClick('due')}
                >
                  <div className="flex items-center">
                    <span>Due Date</span>
                    <SortIndicator column="due" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group"
                  onClick={() => handleSortClick('priority')}
                >
                  <div className="flex items-center">
                    <span>Priority</span>
                    <SortIndicator column="priority" />
                  </div>
                </th>
                <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {sortedTasks.map(task => {
                const isExpanded = expandedTaskIds.includes(task.id);
                const daysLeftIndicator = getDaysLeft(task.estimatedCompletionDate, task.status);
                const isHovered = hoveredRow === task.id;
                
                return (
                  <React.Fragment key={task.id}>
                    <tr 
                      className={`${rowHeight} ${isHovered ? 'bg-gray-50 dark:bg-gray-800/50' : ''} hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group`}
                      onMouseEnter={() => setHoveredRow(task.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-indigo-400"
                          checked={selectedTaskIds.includes(task.id)}
                          onChange={(e) => onTaskSelection(task.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center">
                          <button 
                            className="mr-2 flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                            onClick={() => toggleTaskExpansion(task.id)}
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="h-4 w-4" />
                            ) : (
                              <ChevronUpIcon className="h-4 w-4 rotate-180" />
                            )}
                          </button>
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                            {task.title}
                            {task.ticketNumber && (
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTicketUrl(task.ticketUrl || '');
                                }}
                                className="ml-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                title="View ticket in FreshService"
                              >
                                #{task.ticketNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm">{getStatusIndicator(task.status)}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {task.assigneeId
                            ? technicians.find(t => t.id === task.assigneeId)?.name || 'Unknown'
                            : '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {formatDate(task.estimatedCompletionDate)}
                          </div>
                          <div className={`text-xs ${daysLeftIndicator.className}`}>
                            {daysLeftIndicator.text}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {task.priorityLevel ? getPriorityBadge(task.priorityLevel) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {task.status !== TaskStatus.Resolved && (
                            <button
                              onClick={() => handleQuickStatusUpdate(task.id, TaskStatus.Resolved)}
                              className="p-1 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                              title="Mark as resolved"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </button>
                          )}
                          {task.status !== TaskStatus.Pending && (
                            <button
                              onClick={() => handleQuickStatusUpdate(task.id, TaskStatus.Pending)}
                              className="p-1 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/30 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400"
                              title="Mark as pending"
                            >
                              <ClockIcon className="h-4 w-4" />
                            </button>
                          )}
                          {task.status !== TaskStatus.Open && (
                            <button
                              onClick={() => handleQuickStatusUpdate(task.id, TaskStatus.Open)}
                              className="p-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                              title="Reopen task"
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                            </button>
                          )}
                          
                          {task.ticketNumber ? (
                            <>
                              <button
                                onClick={() => openTicketUrl(task.ticketUrl || '')}
                                className="p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                title={`View ticket #${task.ticketNumber}`}
                              >
                                <LinkIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTicket(task.id, task.ticketNumber || '')}
                                disabled={isDeletingTicket === task.id}
                                className={`p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 ${
                                  isDeletingTicket === task.id ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                title="Delete ticket"
                              >
                                <DocumentIcon className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleCreateTicket(task.id)}
                              disabled={isCreatingTicket === task.id}
                              className={`p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 ${
                                isCreatingTicket === task.id ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              title="Create ticket"
                            >
                              {isCreatingTicket === task.id ? (
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <PlusIcon className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-800/30">
                        <td colSpan={7} className="px-3 py-3">
                          <div className="task-details text-sm text-gray-700 dark:text-gray-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-1">Category</p>
                                {task.categoryId
                                  ? categories.find(c => c.id === task.categoryId)?.value || '—'
                                  : '—'}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-1">Group</p>
                                {task.groupId
                                  ? groups.find(g => g.id === task.groupId)?.name || '—'
                                  : '—'}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-1">Tags</p>
                                <div className="flex flex-wrap gap-1">
                                  {task.tags && task.tags.length > 0
                                    ? task.tags.map(tag => (
                                        <span key={tag} className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-xs rounded">
                                          {tag}
                                        </span>
                                      ))
                                    : '—'}
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 font-medium mb-1">Description</p>
                              <div className="prose prose-sm max-w-none dark:prose-invert">
                                {task.explanation ? 
                                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(task.explanation, {
                                    ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'h1', 'h2', 'h3', 'h4', 'br', 'span'],
                                    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class']
                                  }) }} />
                                : '—'}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 
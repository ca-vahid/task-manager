"use client";

import React, { useState, useEffect } from 'react';
import { Task, Technician, TaskStatus, ViewMode, ViewDensity, Group } from '@/lib/types';

interface TaskFilterBarProps {
  tasks: Task[];
  technicians: Technician[];
  groups: Group[];
  onFilterChange: (filteredTasks: Task[]) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  viewDensity: ViewDensity;
  setViewDensity: (density: ViewDensity) => void;
  groupBy: 'status' | 'assignee' | 'group' | 'none';
  setGroupBy: (groupBy: 'status' | 'assignee' | 'group' | 'none') => void;
  hasSelection: boolean;
  onClearSelection: () => void;
}

export function TaskFilterBar({
  tasks,
  technicians,
  groups,
  onFilterChange,
  viewMode,
  setViewMode,
  viewDensity,
  setViewDensity,
  groupBy,
  setGroupBy,
  hasSelection,
  onClearSelection
}: TaskFilterBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  // Apply filters whenever filter criteria change
  useEffect(() => {
    const filteredTasks = tasks.filter(task => {
      // Text search (case insensitive)
      let matchesSearch = !searchTerm;
      
      if (searchTerm) {
        const searchTermLower = searchTerm.toLowerCase();
        
        // Check if task title, explanation, or ticket number contains the search term
        const taskFieldsMatch = 
          task.title.toLowerCase().includes(searchTermLower) ||
          task.explanation.toLowerCase().includes(searchTermLower) ||
          (task.ticketNumber && task.ticketNumber.toLowerCase().includes(searchTermLower));
        
        // Check if assigned technician name contains the search term
        let technicianNameMatches = false;
        if (task.assigneeId) {
          const assignedTechnician = technicians.find(tech => tech.id === task.assigneeId);
          if (assignedTechnician) {
            technicianNameMatches = assignedTechnician.name.toLowerCase().includes(searchTermLower);
          }
        }
        
        matchesSearch = taskFieldsMatch || technicianNameMatches;
      }
      
      // Status filter
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(task.status);
      
      // Assignee filter
      const matchesAssignee = selectedAssignees.length === 0 || 
        (task.assigneeId && selectedAssignees.includes(task.assigneeId)) ||
        (selectedAssignees.includes('unassigned') && !task.assigneeId);
      
      // Group filter
      const matchesGroup = selectedGroups.length === 0 || 
        (task.groupId && selectedGroups.includes(task.groupId)) ||
        (selectedGroups.includes('nogroup') && !task.groupId);
      
      return matchesSearch && matchesStatus && matchesAssignee && matchesGroup;
    });
    
    onFilterChange(filteredTasks);
  }, [tasks, searchTerm, selectedStatuses, selectedAssignees, selectedGroups, onFilterChange, technicians]);

  // Listen for custom reapplyFilters event
  useEffect(() => {
    const handleReapplyFilters = () => {
      // Re-trigger the filter effect by creating a new array for one of the filter states
      setSelectedStatuses([...selectedStatuses]);
    };
    
    window.addEventListener('reapplyFilters', handleReapplyFilters);
    
    return () => {
      window.removeEventListener('reapplyFilters', handleReapplyFilters);
    };
  }, [selectedStatuses]);

  // Toggle status filter
  const toggleStatusFilter = (status: TaskStatus) => {
    setSelectedStatuses(prev => 
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  // Toggle assignee filter
  const toggleAssigneeFilter = (assigneeId: string) => {
    setSelectedAssignees(prev => 
      prev.includes(assigneeId)
        ? prev.filter(a => a !== assigneeId)
        : [...prev, assigneeId]
    );
  };

  // Toggle group filter
  const toggleGroupFilter = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(g => g !== groupId)
        : [...prev, groupId]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedStatuses([]);
    setSelectedAssignees([]);
    setSelectedGroups([]);
  };

  // Count active filters
  const activeFilterCount = selectedStatuses.length + selectedAssignees.length + selectedGroups.length + (searchTerm ? 1 : 0);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-sm">
      {/* Top controls row: combines view options, density, and column selector */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {/* View mode selector with icons */}
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`${viewMode === 'kanban' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} px-2 py-1 text-sm font-medium rounded-l-md border border-gray-200 dark:border-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 flex items-center`}
              title="Kanban View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm6 0a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zm6 0a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
              </svg>
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`${viewMode === 'timeline' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} px-2 py-1 text-sm font-medium border-t border-b border-gray-200 dark:border-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 flex items-center`}
              title="Timeline View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`${viewMode === 'compact' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} px-2 py-1 text-sm font-medium rounded-r-md border border-gray-200 dark:border-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 flex items-center`}
              title="Compact View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Compact
            </button>
          </div>
        </div>
        
        {/* Right side with group by, column selector and filters */}
        <div className="flex items-center space-x-2">
          {/* Group by selector */}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'status' | 'assignee' | 'group' | 'none')}
            className="text-sm rounded-md border border-gray-300 dark:border-gray-600 py-1 px-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <option value="none">No Grouping</option>
            <option value="status">Group by Status</option>
            <option value="assignee">Group by Assignee</option>
            <option value="group">Group by Group</option>
          </select>
          
          {/* Column selector when in kanban view */}
          {viewMode === 'kanban' && (
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => {
                  // Communicate with TaskGroupView
                  window.dispatchEvent(new CustomEvent('setColumnCount', { detail: { count: 3 } }));
                }}
                className="px-2 py-1 text-sm font-medium rounded-l-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                title="3 Columns"
              >
                3 Cols
              </button>
              <button
                type="button"
                onClick={() => {
                  // Communicate with TaskGroupView
                  window.dispatchEvent(new CustomEvent('setColumnCount', { detail: { count: 4 } }));
                }}
                className="px-2 py-1 text-sm font-medium rounded-r-md border border-gray-200 dark:border-gray-600 border-l-0 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                title="4 Columns"
              >
                4 Cols
              </button>
            </div>
          )}
          
          {/* Clear filters button */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center"
              title="Clear all filters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear ({activeFilterCount})
            </button>
          )}
          
          {/* Selection management */}
          {hasSelection && (
            <button
              onClick={onClearSelection}
              className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-800/40 flex items-center"
              title="Clear selection"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Clear Selection
            </button>
          )}
        </div>
      </div>

      {/* Bottom row with search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full pl-10 pr-10 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 sm:text-sm"
          placeholder="Search tasks by title, details, ticket #, or technician..."
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
          >
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
} 
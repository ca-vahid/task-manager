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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm">
      {/* View mode toggle moved to top */}
      <div className="mb-3">
        <div className="inline-flex rounded-md shadow-sm" role="group">
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`${viewMode === 'kanban' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} px-3 py-1.5 text-sm font-medium rounded-l-lg border border-gray-200 dark:border-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400`}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`${viewMode === 'timeline' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} px-3 py-1.5 text-sm font-medium border-t border-b border-gray-200 dark:border-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400`}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compact')}
            className={`${viewMode === 'compact' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'} px-3 py-1.5 text-sm font-medium rounded-r-lg border border-gray-200 dark:border-gray-600 focus:z-10 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400`}
          >
            Compact
          </button>
        </div>
      </div>

      {/* Combined search bar and group by selector */}
      <div className="flex items-center space-x-2 mb-3">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 sm:text-sm"
            placeholder="Search tasks by title, details, ticket #, or technician..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
            >
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Group by selector */}
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as 'status' | 'assignee' | 'group' | 'none')}
          className="text-sm rounded-md border border-gray-300 dark:border-gray-600 py-2 px-3 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="none">No Grouping</option>
          <option value="status">Group by Status</option>
          <option value="assignee">Group by Assignee</option>
          <option value="group">Group by Group</option>
        </select>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Clear filters button */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Clear Filters ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  );
} 
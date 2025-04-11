'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Control, ControlStatus, Technician, PriorityLevel, ControlFilters, Company } from '@/lib/types';
import Image from 'next/image';

interface ControlFilterBarProps {
  technicians: Technician[];
  onFilterChange: (filteredControls: Control[]) => void;
  controls: Control[];
  onBatchSelectionChange?: (selectedIds: string[]) => void;
}

export function ControlFilterBar({ 
  technicians, 
  onFilterChange, 
  controls,
  onBatchSelectionChange
}: ControlFilterBarProps) {
  const [filters, setFilters] = useState<ControlFilters>({
    search: '',
    status: null,
    priority: null, // Keep in the state but don't expose in UI
    assignee: null,
    tags: null,
    company: null, // Add company filter
    dateRange: null
  });

  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Apply filters whenever they change
  const applyFilters = () => {
    applyFiltersWithState(filters);
  };
  
  // Update a specific filter value and apply filters
  const updateFilter = <K extends keyof ControlFilters>(key: K, value: ControlFilters[K]) => {
    // Create the new filters state
    const newFilters = { ...filters, [key]: value };
    
    // Update the state
    setFilters(newFilters);
    
    // Apply filters immediately with the new state
    applyFiltersWithState(newFilters);
  };
  
  // Apply filters using a specific filter state
  const applyFiltersWithState = (filterState: ControlFilters) => {
    let filtered = [...controls];
    
    // Text search filter (searches across title, ID, explanation, and technician names)
    if (filterState.search?.trim()) {
      const searchLower = filterState.search.toLowerCase();
      filtered = filtered.filter(control => {
        // Check standard fields
        if (
          control.title.toLowerCase().includes(searchLower) || 
          control.dcfId.toLowerCase().includes(searchLower) ||
          control.explanation?.toLowerCase().includes(searchLower) ||
          (control.tags?.some(tag => tag.toLowerCase().includes(searchLower)))
        ) {
          return true;
        }
        
        // Check technician name if control has an assignee
        if (control.assigneeId) {
          const technician = technicians.find(tech => tech.id === control.assigneeId);
          if (technician && technician.name.toLowerCase().includes(searchLower)) {
            return true;
          }
        }
        
        return false;
      });
    }
    
    // Status filter
    if (filterState.status && filterState.status.length > 0) {
      filtered = filtered.filter(control => 
        filterState.status?.includes(control.status)
      );
    }
    
    // Assignee filter
    if (filterState.assignee && filterState.assignee.length > 0) {
      filtered = filtered.filter(control => {
        // If "unassigned" is selected and this control has no assignee
        if (filterState.assignee?.includes('unassigned') && !control.assigneeId) {
          return true;
        }
        
        // If this control has an assignee and that assignee is in our filter list
        if (control.assigneeId && filterState.assignee?.includes(control.assigneeId)) {
          return true;
        }
        
        // Otherwise, this control doesn't match our filter criteria
        return false;
      });
    }
    
    // Company filter
    if (filterState.company && filterState.company.length > 0) {
      filtered = filtered.filter(control => {
        // Company.None should match all companies
        if (control.company === Company.None) {
          return true;
        }
        
        // If control.company is undefined or null, don't include it
        if (!control.company) {
          return false;
        }
        
        return filterState.company?.includes(control.company);
      });
    }
    
    // Tags filter
    if (filterState.tags && filterState.tags.length > 0) {
      filtered = filtered.filter(control => {
        if (!control.tags || control.tags.length === 0) return false;
        return filterState.tags?.some(tag => control.tags?.includes(tag));
      });
    }
    
    // Date range filter
    if (filterState.dateRange && (filterState.dateRange.start || filterState.dateRange.end)) {
      filtered = filtered.filter(control => {
        if (!control.estimatedCompletionDate) return false;
        
        const dueDate = control.estimatedCompletionDate.toDate();
        
        if (filterState.dateRange?.start && filterState.dateRange?.end) {
          return dueDate >= filterState.dateRange.start.toDate() && 
                 dueDate <= filterState.dateRange.end.toDate();
        }
        
        if (filterState.dateRange?.start) {
          return dueDate >= filterState.dateRange.start.toDate();
        }
        
        if (filterState.dateRange?.end) {
          return dueDate <= filterState.dateRange.end.toDate();
        }
        
        return true;
      });
    }
    
    onFilterChange(filtered);
  };
  
  // Listen for reapplyFilters event
  useEffect(() => {
    const handleReapplyFilters = () => {
      // Reapply current filters when the event is triggered
      applyFiltersWithState(filters);
    };
    
    // Add event listener
    window.addEventListener('reapplyFilters', handleReapplyFilters);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('reapplyFilters', handleReapplyFilters);
    };
  }, [filters, controls]); // Re-add listener if filters or controls change
  
  // Reapply filters when controls change (to maintain filtered view)
  useEffect(() => {
    // Only reapply if there are active filters
    if (hasActiveFilters(filters)) {
      applyFiltersWithState(filters);
    }
  }, [controls, applyFiltersWithState, filters]);
  
  // Helper to check if there are any active filters
  const hasActiveFilters = (filterState: ControlFilters): boolean => {
    return !!(
      filterState.search?.trim() || 
      (filterState.status && filterState.status.length > 0) ||
      (filterState.assignee && filterState.assignee.length > 0) ||
      (filterState.company && filterState.company.length > 0) ||
      (filterState.tags && filterState.tags.length > 0) ||
      (filterState.dateRange && (filterState.dateRange.start || filterState.dateRange.end))
    );
  };
  
  const clearFilters = () => {
    const newFilters = {
      search: '',
      status: null,
      priority: null,
      assignee: null,
      tags: null,
      company: null,
      dateRange: null
    };
    
    // Update the state
    setFilters(newFilters);
    
    // Reset to full list immediately
    onFilterChange(controls);
    
    // Focus the search input after clearing
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Toggle a status filter with immediate apply
  const toggleStatusFilter = (status: ControlStatus) => {
    const currentStatus = filters.status || [];
    const newStatus = currentStatus.includes(status)
      ? currentStatus.filter(s => s !== status)
      : [...currentStatus, status];
    
    const newFilters = {
      ...filters,
      status: newStatus.length > 0 ? newStatus : null
    };
    
    // Update state
    setFilters(newFilters);
    
    // Apply filters immediately with new state
    applyFiltersWithState(newFilters);
  };
  
  // Toggle a company filter with immediate apply
  const toggleCompanyFilter = (company: Company) => {
    const currentCompany = filters.company || [];
    const newCompany = currentCompany.includes(company)
      ? currentCompany.filter(c => c !== company)
      : [...currentCompany, company];
    
    const newFilters = {
      ...filters,
      company: newCompany.length > 0 ? newCompany : null
    };
    
    // Update state
    setFilters(newFilters);
    
    // Apply filters immediately with new state
    applyFiltersWithState(newFilters);
  };
  
  // Toggle an assignee filter with immediate apply
  const toggleAssigneeFilter = (assigneeId: string) => {
    const currentAssignee = filters.assignee || [];
    const newAssignee = currentAssignee.includes(assigneeId)
      ? currentAssignee.filter(a => a !== assigneeId)
      : [...currentAssignee, assigneeId];
    
    const newFilters = {
      ...filters,
      assignee: newAssignee.length > 0 ? newAssignee : null
    };
    
    // Update state
    setFilters(newFilters);
    
    // Apply filters immediately with new state
    applyFiltersWithState(newFilters);
  };
  
  // Handle batch selection for multiple controls
  const toggleAllSelection = () => {
    if (selectedControlIds.length === controls.length) {
      // If all are selected, deselect all
      setSelectedControlIds([]);
    } else {
      // Otherwise, select all
      setSelectedControlIds(controls.map(c => c.id));
    }
  };

  // Update the parent component when selection changes
  useEffect(() => {
    if (onBatchSelectionChange) {
      onBatchSelectionChange(selectedControlIds);
    }
  }, [selectedControlIds, onBatchSelectionChange]);

  // Count active filters for the badge
  const activeFilterCount = [
    filters.status && filters.status.length > 0,
    filters.assignee && filters.assignee.length > 0,
    filters.company && filters.company.length > 0,
    filters.tags && filters.tags.length > 0,
    filters.dateRange && (filters.dateRange.start || filters.dateRange.end)
  ].filter(Boolean).length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6 overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Search Bar Always Visible */}
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search controls by title, ID, description, technician, or tags..."
              className="border border-gray-300 dark:border-gray-600 rounded-md px-10 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400"
              value={filters.search || ''}
              onChange={(e) => updateFilter('search', e.target.value)}
            />
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            
            {filters.search && (
              <button
                onClick={() => updateFilter('search', '')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 text-gray-500 dark:text-gray-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 text-xs font-medium px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
          
          {onBatchSelectionChange && (
            <button
              onClick={toggleAllSelection}
              className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 text-gray-500 dark:text-gray-400" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Batch Select
            </button>
          )}
          
          {(activeFilterCount > 0 || filters.search) && (
            <button 
              onClick={clearFilters}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              Clear All
            </button>
          )}
        </div>
        
        {/* Filter Chips */}
        {showFilters && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            {/* Company Filter Chips */}
            <div className="mb-4">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Company:</span>
              <div className="flex flex-wrap gap-2">
                {Object.values(Company).map(company => {
                  const isActive = filters.company?.includes(company) || false;
                  let chipClass = "flex items-center px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ";
                  let bgColor, textColor;
                  
                  switch(company) {
                    case Company.BGC:
                      bgColor = isActive ? "bg-blue-200 dark:bg-blue-700" : "bg-blue-50 dark:bg-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-800/60";
                      textColor = isActive ? "text-blue-800 dark:text-blue-100" : "text-blue-600 dark:text-blue-300";
                      break;
                    case Company.Cambio:
                      bgColor = isActive ? "bg-emerald-200 dark:bg-emerald-700" : "bg-emerald-50 dark:bg-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-800/60";
                      textColor = isActive ? "text-emerald-800 dark:text-emerald-100" : "text-emerald-600 dark:text-emerald-300";
                      break;
                    case Company.None:
                      bgColor = isActive ? "bg-purple-200 dark:bg-cyan-700" : "bg-purple-50 dark:bg-cyan-900/50 hover:bg-purple-100 dark:hover:bg-cyan-800/60";
                      textColor = isActive ? "text-purple-800 dark:text-cyan-100" : "text-purple-600 dark:text-cyan-300";
                      break;
                    default:
                      bgColor = isActive ? "bg-gray-200 dark:bg-gray-600" : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600";
                      textColor = isActive ? "text-gray-800 dark:text-gray-100" : "text-gray-600 dark:text-gray-300";
                  }
                  
                  chipClass += `${bgColor} ${textColor}`;
                  
                  return (
                    <button
                      key={company}
                      className={chipClass}
                      onClick={() => toggleCompanyFilter(company)}
                    >
                      {company === Company.BGC && (
                        <div className="w-4 h-4 mr-1 relative flex items-center justify-center">
                          <Image 
                            src="/logos/bgc-logo.png" 
                            alt="BGC Logo" 
                            width={16}
                            height={16}
                            className="object-contain"
                          />
                        </div>
                      )}
                      
                      {company === Company.Cambio && (
                        <div className="w-4 h-4 mr-1 relative flex items-center justify-center">
                          <Image 
                            src="/logos/cambio-logo.png" 
                            alt="Cambio Logo" 
                            width={16}
                            height={16}
                            className="object-contain"
                          />
                        </div>
                      )}
                      
                      {company === Company.None && (
                        <div className="w-4 h-4 mr-1 relative">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-4 h-4 relative">
                              <div className="absolute top-0 left-0 w-4 h-2 overflow-hidden flex items-center justify-center">
                                <Image 
                                  src="/logos/bgc-logo.png" 
                                  alt="BGC Logo" 
                                  width={14}
                                  height={14}
                                  className="object-contain"
                                />
                              </div>
                              <div className="absolute bottom-0 left-0 w-4 h-2 overflow-hidden flex items-center justify-center">
                                <Image 
                                  src="/logos/cambio-logo.png" 
                                  alt="Cambio Logo" 
                                  width={14}
                                  height={14}
                                  className="object-contain"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {company}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Status Filter Chips */}
            <div className="mb-4">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status:</span>
              <div className="flex flex-wrap gap-2">
                {Object.values(ControlStatus).map(status => {
                  const isActive = filters.status?.includes(status) || false;
                  let chipClass = "px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ";
                  
                  switch(status) {
                    case ControlStatus.InProgress:
                      chipClass += isActive ? "bg-indigo-200 dark:bg-indigo-700 text-indigo-800 dark:text-indigo-100" : "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/60";
                      break;
                    case ControlStatus.InReview:
                      chipClass += isActive ? "bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100" : "bg-amber-50 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/60";
                      break;
                    case ControlStatus.Complete:
                      chipClass += isActive ? "bg-emerald-200 dark:bg-emerald-700 text-emerald-800 dark:text-emerald-100" : "bg-emerald-50 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/60";
                      break;
                    default:
                      chipClass += isActive ? "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600";
                  }
                  
                  return (
                    <button
                      key={status}
                      className={chipClass}
                      onClick={() => toggleStatusFilter(status)}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Assignee Filter Section */}
            <div className="mb-4">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assignee:</span>
              <div>
                <select
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent dark:bg-gray-700 dark:text-gray-300"
                  onChange={(e) => {
                    if (e.target.value === "all") {
                      updateFilter('assignee', null);
                    } else {
                      toggleAssigneeFilter(e.target.value);
                    }
                  }}
                  value="all" // This is a dummy value as we're using multi-select
                >
                  <option value="all">Select Assignee</option>
                  <option value="unassigned">Unassigned</option>
                  {technicians.map(tech => (
                    <option key={tech.id} value={tech.id}>{tech.name}</option>
                  ))}
                </select>
                {/* Selected assignees chips */}
                {filters.assignee && filters.assignee.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {filters.assignee.map(id => {
                      const name = id === 'unassigned' 
                        ? 'Unassigned' 
                        : technicians.find(t => t.id === id)?.name || id;
                      
                      return (
                        <span 
                          key={id} 
                          className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1"
                        >
                          {name}
                          <button 
                            onClick={() => toggleAssigneeFilter(id)}
                            className="text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
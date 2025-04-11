'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Control, Technician, ControlStatus, ViewDensity } from '@/lib/types';
import { ControlCard } from './ControlCard';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from './SortableItem';

interface ControlGroupViewProps {
  controls: Control[];
  technicians: Technician[];
  groupBy: 'status' | 'assignee' | 'none';
  viewDensity?: ViewDensity;
  onUpdateControl: (id: string, updates: Partial<Omit<Control, 'id'>>) => Promise<void>;
  onDeleteControl: (id: string) => Promise<void>;
  onDragEnd: (event: DragEndEvent) => void;
  columnsPerPage?: number;
}

export function ControlGroupView(props: ControlGroupViewProps) {
  const {
    controls,
    technicians,
    groupBy,
    viewDensity = 'medium',
    onUpdateControl,
    onDeleteControl,
    onDragEnd,
    columnsPerPage = 3
  } = props;

  // Define state variables
  const [activeControl, setActiveControl] = useState<Control | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Define refs
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Configure drag sensors with minimal settings
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );
  
  // Generate groups based on the groupBy parameter with simple structure
  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return { 'All Controls': controls };
    }
    
    const result: Record<string, Control[]> = {};
    
    if (groupBy === 'status') {
      // Initialize groups for all statuses
      Object.values(ControlStatus).forEach(status => {
        result[status] = [];
      });
      
      // Add controls to their status groups
      controls.forEach(control => {
        if (result[control.status]) {
          result[control.status].push(control);
        } else {
          result[ControlStatus.InProgress].push(control);
        }
      });
    } else if (groupBy === 'assignee') {
      // Create a map of technician IDs to names
      const techMap: Record<string, string> = {};
      technicians.forEach(tech => {
        techMap[tech.id] = tech.name;
      });
      
      // Group by assignee
      controls.forEach(control => {
        const assigneeName = control.assigneeId 
          ? techMap[control.assigneeId] || 'Unknown Technician'
          : 'Unassigned';
          
        if (!result[assigneeName]) {
          result[assigneeName] = [];
        }
        
        result[assigneeName].push(control);
      });
    }
    
    // Remove empty groups
    Object.keys(result).forEach(key => {
      if (result[key].length === 0) {
        delete result[key];
      }
    });
    
    return result;
  }, [controls, technicians, groupBy]);
  
  // Basic statusOrder and styles to avoid complex calculations
  const statusOrder = Object.values(ControlStatus);
  const statusStyles = {
    [ControlStatus.InProgress]: {
      bg: 'bg-indigo-100',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      darkBg: 'dark:bg-indigo-900/50',
      darkText: 'dark:text-indigo-300',
      darkBorder: 'dark:border-indigo-700',
    },
    [ControlStatus.InReview]: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      border: 'border-amber-200',
      darkBg: 'dark:bg-amber-900/50',
      darkText: 'dark:text-amber-300',
      darkBorder: 'dark:border-amber-700',
    },
    [ControlStatus.Complete]: {
      bg: 'bg-emerald-100',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      darkBg: 'dark:bg-emerald-900/50',
      darkText: 'dark:text-emerald-300',
      darkBorder: 'dark:border-emerald-700',
    }
  };

  // Sort group names with simple logic
  const sortedGroupNames = useMemo(() => {
    const names = Object.keys(groups);
    
    if (groupBy === 'status') {
      return names.sort((a, b) => 
        statusOrder.indexOf(a as ControlStatus) - statusOrder.indexOf(b as ControlStatus)
      );
    } else if (groupBy === 'assignee') {
      return names.sort((a, b) => {
        if (a === 'Unassigned') return -1;
        if (b === 'Unassigned') return 1;
        return a.localeCompare(b);
      });
    }
    
    return names;
  }, [groups, groupBy, statusOrder]);

  // Simple pagination logic
  const pagesWithContent = useMemo(() => {
    const pages = [];
    for (let i = 0; i < Math.ceil(sortedGroupNames.length / columnsPerPage); i++) {
      pages.push(i);
    }
    return pages;
  }, [sortedGroupNames.length, columnsPerPage]);

  const totalPages = pagesWithContent.length;
  const hasMultiplePages = totalPages > 1;

  // Simple navigation functions
  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Control IDs by group for SortableContext
  const controlIdsByGroup = useMemo(() => {
    const result: Record<string, string[]> = {};
    Object.entries(groups).forEach(([groupName, groupControls]) => {
      result[groupName] = groupControls.map(control => control.id);
    });
    return result;
  }, [groups]);

  // Simple drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = active.id as string;
    
    // Find active group
    let group = null;
    for (const [groupName, groupControls] of Object.entries(groups)) {
      if (groupControls.some(control => control.id === id)) {
        group = groupName;
        break;
      }
    }
    
    setActiveGroup(group);
    setActiveControl(controls.find(c => c.id === id) || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveControl(null);
    setActiveGroup(null);
    
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onDragEnd(event);
    }
  };

  // Get simple style for a group
  const getGroupStyle = (groupName: string) => {
    if (groupBy === 'status') {
      return statusStyles[groupName as ControlStatus] || {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        border: 'border-gray-200',
        darkBg: 'dark:bg-gray-800/50',
        darkText: 'dark:text-gray-300',
        darkBorder: 'dark:border-gray-600',
      };
    } else {
      // Assignee styling - simple version
      return {
        bg: 'bg-indigo-100',
        text: 'text-indigo-900',
        border: 'border-indigo-200',
        darkBg: 'dark:bg-indigo-900/50',
        darkText: 'dark:text-indigo-300',
        darkBorder: 'dark:border-indigo-700',
      };
    }
  };

  // Scroll to current page
  useEffect(() => {
    if (containerRef.current) {
      const scrollPosition = containerRef.current.offsetWidth * currentPage;
      containerRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth',
      });
    }
  }, [currentPage]);

  // Handle keyboard navigation for left/right arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevPage();
      } else if (e.key === 'ArrowRight') {
        goToNextPage();
      }
    };

    // Add the event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove the event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPage]); // Re-add when currentPage changes

  // Render layout
  return (
    <div className="relative px-16">
      {/* Pagination UI - Fixed position */}
      {hasMultiplePages && (
        <>
          <button 
            onClick={goToPrevPage}
            disabled={currentPage === 0}
            className={`fixed left-4 top-1/2 -translate-y-1/2 z-50 bg-indigo-600 hover:bg-indigo-700 rounded-full p-4 shadow-lg transition-all ${
              currentPage === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110'
            }`}
            aria-label="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <button 
            onClick={goToNextPage}
            disabled={currentPage === totalPages - 1}
            className={`fixed right-4 top-1/2 -translate-y-1/2 z-50 bg-indigo-600 hover:bg-indigo-700 rounded-full p-4 shadow-lg transition-all ${
              currentPage === totalPages - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110'
            }`}
            aria-label="Next page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Pagination Indicator */}
      {hasMultiplePages && (
        <div className="flex justify-center mt-2 mb-6 gap-2">
          {pagesWithContent.map((pageIndex) => (
            <button
              key={pageIndex}
              onClick={() => setCurrentPage(pageIndex)}
              className={`transition-all duration-300 ${
                currentPage === pageIndex
                  ? 'h-3 w-10 bg-indigo-600'
                  : 'h-3 w-3 bg-gray-300 dark:bg-gray-600 hover:bg-indigo-400 dark:hover:bg-indigo-500'
              } rounded-full`}
              aria-label={`Go to page ${pageIndex + 1}`}
            />
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Outer container */}
        <div className="overflow-hidden relative"> 
          {/* Scrolling container */}
          <div
            ref={containerRef}
            className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar"
          >
            {/* Pages */}
            {pagesWithContent.map((pageIndex) => {
              const startIndex = pageIndex * columnsPerPage;
              const endIndex = Math.min(startIndex + columnsPerPage, sortedGroupNames.length);
              const pageGroupNames = sortedGroupNames.slice(startIndex, endIndex);

              return (
                <div
                  key={pageIndex}
                  className="flex-shrink-0 w-full snap-start"
                >
                  {/* Grid layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-3">
                    {pageGroupNames.map(groupName => {
                      const style = getGroupStyle(groupName);
                      return (
                        <div 
                          key={groupName} 
                          className={`bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border ${style.border} ${style.darkBorder}`}
                        >
                          {/* Column Header */}
                          <div className={`px-4 py-3 flex justify-between items-center ${style.bg} ${style.darkBg} border-b ${style.border} ${style.darkBorder}`}>
                            <h3 className={`font-semibold ${style.text} ${style.darkText}`}>
                              {groupName}
                              <span className="ml-2 text-xs bg-white dark:bg-gray-700 rounded-full px-2 py-0.5 shadow-inner text-gray-700 dark:text-gray-300">
                                {groups[groupName].length}
                              </span>
                            </h3>
                          </div>
                          
                          {/* Column Content */}
                          <SortableContext 
                            items={controlIdsByGroup[groupName] || []} 
                            strategy={verticalListSortingStrategy}
                          >
                            <div className={`${ 
                              viewDensity === 'compact' 
                                ? 'p-2 space-y-2' 
                                : viewDensity === 'medium' 
                                ? 'p-3 space-y-3' 
                                : 'p-4 space-y-4'
                            } min-h-[100px] bg-white dark:bg-gray-800`}> 
                              {groups[groupName].map(control => (
                                <SortableItem
                                  key={control.id}
                                  id={control.id}
                                  control={control}
                                  technicians={technicians}
                                  onUpdateControl={onUpdateControl}
                                  onDeleteControl={onDeleteControl}
                                  viewDensity={viewDensity}
                                  disabled={activeGroup !== null && activeGroup !== groupName}
                                />
                              ))}
                              
                              {groups[groupName].length === 0 && (
                                <div className="p-8 text-center text-gray-500 dark:text-gray-400 italic">
                                  No controls in this group
                                </div>
                              )}
                            </div>
                          </SortableContext>
                        </div>
                      );
                    })}
                    
                    {/* Placeholders */}
                    {Array.from({ length: columnsPerPage - pageGroupNames.length }).map((_, i) => (
                       <div key={`placeholder-${pageIndex}-${i}`} aria-hidden="true" className="invisible"></div> 
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Empty message */}
            {sortedGroupNames.length === 0 && (
              <div className="w-full flex-shrink-0 flex items-center justify-center p-8">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                  No controls match your filter criteria
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeControl ? (
            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg opacity-90 w-full max-w-md">
              <ControlCard
                control={activeControl}
                technicians={technicians}
                onUpdateControl={onUpdateControl}
                onDeleteControl={onDeleteControl}
                viewDensity={viewDensity}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
} 
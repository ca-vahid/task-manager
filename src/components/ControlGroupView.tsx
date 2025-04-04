'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
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
  columnsPerPage?: number; // New prop for customizing columns per page
}

export function ControlGroupView({
  controls,
  technicians,
  groupBy,
  viewDensity = 'medium',
  onUpdateControl,
  onDeleteControl,
  onDragEnd,
  columnsPerPage = 3 // Default to 3 columns per page
}: ControlGroupViewProps) {
  
  const [activeControl, setActiveControl] = React.useState<Control | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Configure sensors for improved drag experience
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Increase activation distance to prevent accidental drags
      activationConstraint: {
        distance: 8, // 8px minimum drag distance
      },
    })
  );
  
  // Generate groups based on the groupBy parameter
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
        // Check if the status exists in our result object
        // This handles cases where database has controls with status values not in the current enum
        if (result[control.status]) {
          result[control.status].push(control);
        } else {
          // For controls with obsolete status values, put them in In Progress by default
          result[ControlStatus.InProgress].push(control);
          
          // Optionally, you could update the control's status in the database here
          // by calling onUpdateControl(control.id, { status: ControlStatus.InProgress })
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
  
  // For status groups, define the order and styles
  const statusOrder = Object.values(ControlStatus);
  const statusStyles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    [ControlStatus.InProgress]: {
      bg: 'bg-gradient-to-br from-indigo-50 to-indigo-100',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    [ControlStatus.InReview]: {
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )
    },
    [ControlStatus.Complete]: {
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      )
    }
  };
  
  const assigneeIcons: Record<string, React.ReactNode> = {
    'Unassigned': (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    // Default icon for other assignees
    'default': (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  };

  // Sort the group names
  const sortedGroupNames = useMemo(() => {
    const names = Object.keys(groups);
    
    if (groupBy === 'status') {
      // Sort by status order
      return names.sort((a, b) => 
        statusOrder.indexOf(a as ControlStatus) - statusOrder.indexOf(b as ControlStatus)
      );
    } else if (groupBy === 'assignee') {
      // Put Unassigned first, then sort alphabetically
      return names.sort((a, b) => {
        if (a === 'Unassigned') return -1;
        if (b === 'Unassigned') return 1;
        return a.localeCompare(b);
      });
    }
    
    return names;
  }, [groups, groupBy, statusOrder]);

  // Fix the pagination calculation and navigation logic
  // Get exact pages that have content for pagination
  const pagesWithContent = useMemo(() => {
    const pages = [];
    
    for (let i = 0; i < Math.ceil(sortedGroupNames.length / columnsPerPage); i++) {
      const startIndex = i * columnsPerPage;
      const endIndex = Math.min(startIndex + columnsPerPage, sortedGroupNames.length);
      const pageGroupNames = sortedGroupNames.slice(startIndex, endIndex);
      
      if (pageGroupNames.length > 0) {
        pages.push(i);
      }
    }
    
    return pages;
  }, [sortedGroupNames, columnsPerPage]);

  // Calculate the actual number of pages with content
  const totalPages = pagesWithContent.length;
  const hasMultiplePages = totalPages > 1;

  // Corrected page navigation logic
  const goToNextPage = () => {
    const currentIndex = pagesWithContent.indexOf(currentPage);
    if (currentIndex < pagesWithContent.length - 1) {
      setCurrentPage(pagesWithContent[currentIndex + 1]);
    }
  };

  const goToPrevPage = () => {
    const currentIndex = pagesWithContent.indexOf(currentPage);
    if (currentIndex > 0) {
      setCurrentPage(pagesWithContent[currentIndex - 1]);
    }
  };

  // Use scrollLeft for smooth transitions
  useEffect(() => {
    if (containerRef.current) {
      // Calculate the target scroll position based on the current page's index
      const visiblePageIndex = pagesWithContent.indexOf(currentPage);
      const targetScrollLeft = containerRef.current.offsetWidth * visiblePageIndex;

      containerRef.current.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth',
      });
    }
    // Removed pagesWithContent from dependency array as offsetWidth handles dynamic width changes
  }, [currentPage, totalPages]); 

  const getGroupStyle = (groupName: string) => {
    if (groupBy === 'status') {
      return statusStyles[groupName as ControlStatus] || {
        bg: 'bg-gradient-to-br from-gray-50 to-gray-100',
        text: 'text-gray-800',
        border: 'border-gray-200',
        icon: null
      };
    } else {
      // Assignee styling
      return {
        bg: 'bg-gradient-to-br from-indigo-50 to-indigo-100',
        text: 'text-indigo-900',
        border: 'border-indigo-200',
        icon: assigneeIcons[groupName] || assigneeIcons.default
      };
    }
  };

  // Get all control IDs for drag context
  const allControlIds = useMemo(() => controls.map(c => c.id), [controls]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const draggedControl = controls.find(c => c.id === active.id);
    if (draggedControl) {
      setActiveControl(draggedControl);
    }
  };

  // Handle drag end and reset state
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveControl(null);
    onDragEnd(event);
  };

  return (
    <div className="relative px-16">
      {/* Pagination UI */}
      {hasMultiplePages && (
        <>
          {/* Left Arrow - Positioned outside columns */}
          <button 
            onClick={goToPrevPage}
            disabled={pagesWithContent.indexOf(currentPage) === 0}
            className={`absolute -left-16 top-1/2 -translate-y-1/2 z-20 bg-indigo-600 hover:bg-indigo-700 rounded-full p-3 shadow-lg border border-white transition-all ${
              pagesWithContent.indexOf(currentPage) === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110'
            }`}
            aria-label="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          {/* Right Arrow - Positioned outside columns */}
          <button 
            onClick={goToNextPage}
            disabled={pagesWithContent.indexOf(currentPage) === pagesWithContent.length - 1}
            className={`absolute -right-16 top-1/2 -translate-y-1/2 z-20 bg-indigo-600 hover:bg-indigo-700 rounded-full p-3 shadow-lg border border-white transition-all ${
              pagesWithContent.indexOf(currentPage) === pagesWithContent.length - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:scale-110'
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
          {pagesWithContent.map((pageIndex, index) => (
            <button
              key={pageIndex}
              onClick={() => setCurrentPage(pageIndex)}
              className={`transition-all duration-300 ${
                currentPage === pageIndex
                  ? 'h-3 w-10 bg-indigo-600'
                  : 'h-3 w-3 bg-gray-300 hover:bg-indigo-400'
              } rounded-full`}
              aria-label={`Go to page ${index + 1}`}
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
        {/* Outer container clips the scrolling content */}
        <div className="overflow-hidden relative"> 
          {/* Container that scrolls horizontally */}
          <div
            ref={containerRef}
            // Use flex, enable horizontal scrolling, add smooth behavior & snapping
            className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar"
            // Let flexbox determine the full width based on children
          >
            {/* Loop through VALID page indexes */} 
            {pagesWithContent.map((pageIndex) => {
              const startIndex = pageIndex * columnsPerPage;
              const endIndex = Math.min(startIndex + columnsPerPage, sortedGroupNames.length);
              const pageGroupNames = sortedGroupNames.slice(startIndex, endIndex);

              // Container for one page's worth of columns
              return (
                <div
                  key={pageIndex}
                  // Each page takes full width of the viewport and snaps to the start
                  className="flex-shrink-0 w-full snap-start"
                >
                  {/* Grid layout FOR THE COLUMNS ON THIS PAGE */}
                  {/* Added px-3 here to act as padding/gap between snapped pages */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-3">
                    {pageGroupNames.map(groupName => {
                      const style = getGroupStyle(groupName);
                      return (
                        <div 
                          key={groupName} 
                          className={`bg-white rounded-lg shadow-md overflow-hidden border ${style.border} transition-all duration-200 hover:shadow-lg`}
                        >
                          {/* Column Header */}
                          <div className={`px-4 py-3 flex justify-between items-center ${style.bg} border-b ${style.border}`}>
                            <h3 className={`font-semibold flex items-center ${style.text}`}>
                              {style.icon}
                              {groupName}
                              <span className="ml-2 text-xs bg-white bg-opacity-80 rounded-full px-2 py-0.5 shadow-inner">
                                {groups[groupName].length}
                              </span>
                            </h3>
                          </div>
                          
                          {/* Column Content */}
                          <SortableContext 
                            items={allControlIds} 
                            strategy={verticalListSortingStrategy}
                          >
                            <div className={`${ 
                              viewDensity === 'compact' 
                                ? 'p-2 space-y-2' 
                                : viewDensity === 'medium' 
                                ? 'p-3 space-y-3' 
                                : 'p-4 space-y-4'
                            } ${groups[groupName].length === 0 ? 'p-0' : ''} min-h-[100px]`}> {/* Added min-height */} 
                              {groups[groupName].map(control => (
                                <SortableItem
                                  key={control.id}
                                  id={control.id}
                                  control={control}
                                  technicians={technicians}
                                  onUpdateControl={onUpdateControl}
                                  onDeleteControl={onDeleteControl}
                                  viewDensity={viewDensity}
                                />
                              ))}
                              
                              {groups[groupName].length === 0 && (
                                <div className="p-8 text-center text-gray-500 italic">
                                  No controls in this group
                                </div>
                              )}
                            </div>
                          </SortableContext>
                        </div>
                      );
                    })}
                    {/* Add invisible placeholders to maintain grid structure on last page */}
                    {Array.from({ length: columnsPerPage - pageGroupNames.length }).map((_, i) => (
                       <div key={`placeholder-${pageIndex}-${i}`} aria-hidden="true" className="invisible"></div> 
                    ))}
                  </div> {/* End of inner grid */} 
                </div> // End of page container
              );
            })}

             {/* Message if no groups/controls match filters */} 
             {sortedGroupNames.length === 0 && (
              <div className="w-full flex-shrink-0 flex items-center justify-center p-8">
                <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 border border-gray-200">
                  No controls match your filter criteria
                </div>
              </div>
            )}
          </div> {/* End of scrolling container */} 
        </div> {/* End of overflow-hidden container */} 

        {/* Drag Overlay for the currently dragged item */}
        <DragOverlay adjustScale={true}>
          {activeControl ? (
            <div className="bg-white border shadow-lg rounded-lg opacity-90 w-full max-w-md">
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
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Task, Technician, TaskStatus, ViewDensity, Group, Category } from '@/lib/types';
import { TaskCard } from './TaskCard';
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';

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

// Sortable Group Component
function SortableGroupItem({
  id,
  groupKey,
  groupTitle,
  groupTasks,
  isCollapsed,
  onToggleCollapse,
  children
}: {
  id: string;
  groupKey: string;
  groupTitle: string;
  groupTasks: Task[];
  isCollapsed: boolean;
  onToggleCollapse: (key: string) => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
    >
      {/* Group header - draggable */}
      <div 
        className="mb-0 px-4 py-3 flex justify-between items-center cursor-grab bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
        {...attributes}
        {...listeners}
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
          onClick={(e) => {
            e.stopPropagation(); // Prevent dragging when clicking the button
            onToggleCollapse(groupKey);
          }}
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
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}>
        <div className="p-4">
          <div className="space-y-4">
            {children}
          </div>
          
          {/* Empty state */}
          {groupTasks.length === 0 && (
            <div className="text-center py-6">
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
  
  // State for group order
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  
  // State for active dragged group
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

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

  // Convert Map to Array for pagination based on groupOrder
  const groupEntries = groupOrder
    .filter(key => groupedTasks.has(key))
    .map(key => [key, groupedTasks.get(key)!]);
  const totalPages = Math.ceil(groupEntries.length / columnsPerPage);

  // Get the current page's groups
  const currentGroups = groupEntries.slice(
    currentPage * columnsPerPage,
    (currentPage + 1) * columnsPerPage
  );

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 } // Requires dragging at least 8px to start
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  
  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveGroup(event.active.id as string);
  }, []);
  
  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Find the indices of the dragged group and the target position
      const oldIndex = groupOrder.indexOf(active.id as string);
      const newIndex = groupOrder.indexOf(over.id as string);
      
      // Reorder the groups
      if (oldIndex !== -1 && newIndex !== -1) {
        setGroupOrder(arrayMove(groupOrder, oldIndex, newIndex));
      }
    }
    
    setActiveGroup(null);
  }, [groupOrder]);

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
      if (e.key === 'ArrowLeft') {
        goToPreviousPage();
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
  }, [goToPreviousPage, goToNextPage]); // Add all dependencies used inside the effect

  // Listen for column count change events
  useEffect(() => {
    const handleColumnCountChange = (event: CustomEvent) => {
      if (event.detail && event.detail.count) {
        setColumnsPerPage(event.detail.count);
      }
    };

    // Add the event listener (need to cast as any due to CustomEvent typing)
    window.addEventListener('setColumnCount', handleColumnCountChange as any);
    
    // Remove the event listener on cleanup
    return () => {
      window.removeEventListener('setColumnCount', handleColumnCountChange as any);
    };
  }, []);

  return (
    <div className="relative">
      {/* Column count selector */}
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-md shadow-sm">
          <button
            onClick={() => setColumnsPerPage(3)}
            className={`px-3 py-2 text-sm font-medium rounded-l-md ${
              columnsPerPage === 3 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            } border border-gray-300 dark:border-gray-600`}
          >
            3 Columns
          </button>
          <button
            onClick={() => setColumnsPerPage(4)}
            className={`px-3 py-2 text-sm font-medium rounded-r-md ${
              columnsPerPage === 4 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            } border border-gray-300 dark:border-gray-600 border-l-0`}
          >
            4 Columns
          </button>
        </div>
      </div>
      
      {/* Pagination controls - now fixed to viewport edges */}
      {totalPages > 1 && (
        <>
          {/* Left arrow - fixed position */}
          <button 
            onClick={goToPreviousPage}
            disabled={currentPage === 0 || isAnimating}
            className={`fixed left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700
              ${(currentPage === 0 || isAnimating) 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-700'
              } transition-all z-50`}
            aria-label="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          {/* Right arrow - fixed position */}
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
        <div className="flex justify-center mb-4 py-2 text-sm font-medium bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 px-3 mx-auto w-fit">
          Page {currentPage + 1} of {totalPages}
        </div>
      )}
      
      {/* Main content with drag and drop for groups */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`grid grid-cols-1 md:grid-cols-2 ${
          columnsPerPage === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
        } gap-6 ${getAnimationClasses()}`}>
          <SortableContext items={currentGroups.map(([groupKey]) => groupKey)} strategy={verticalListSortingStrategy}>
            {/* Render current page groups */}
            {currentGroups.map(([groupKey, groupTasks]) => (
              <SortableGroupItem
                key={groupKey}
                id={groupKey}
                groupKey={groupKey}
                groupTitle={getGroupTitle(groupKey)}
                groupTasks={groupTasks as Task[]}
                isCollapsed={collapsedGroups[groupKey] || false}
                onToggleCollapse={(key) => setCollapsedGroups(prev => ({
                  ...prev,
                  [key]: !prev[key]
                }))}
              >
                {(groupTasks as Task[]).map(task => (
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
              </SortableGroupItem>
            ))}
          </SortableContext>
          
          {/* Drag Overlay */}
          <DragOverlay>
            {activeGroup && (
              <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 opacity-75">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {getGroupTitle(activeGroup)}
                  </h3>
                </div>
                <div className="p-4">
                  <div className="h-24 flex items-center justify-center">
                    <p className="text-gray-500 dark:text-gray-400">Moving group...</p>
                  </div>
                </div>
              </div>
            )}
          </DragOverlay>
        </div>
      </DndContext>
    </div>
  );
} 
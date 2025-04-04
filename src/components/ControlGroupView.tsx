'use client';

import React, { useMemo } from 'react';
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
}

export function ControlGroupView({
  controls,
  technicians,
  groupBy,
  viewDensity = 'medium',
  onUpdateControl,
  onDeleteControl,
  onDragEnd
}: ControlGroupViewProps) {
  
  const [activeControl, setActiveControl] = React.useState<Control | null>(null);

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Switch to a horizontal layout for groups when there are few groups */}
      <div className={`${sortedGroupNames.length <= 3 ? 'md:grid md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-8'}`}>
        {sortedGroupNames.map(groupName => {
          const style = getGroupStyle(groupName);
          
          return (
            <div 
              key={groupName} 
              className={`bg-white rounded-lg shadow-md overflow-hidden border ${style.border} transition-all duration-200 hover:shadow-lg`}
            >
              <div className={`px-4 py-3 flex justify-between items-center ${style.bg} border-b ${style.border}`}>
                <h3 className={`font-semibold flex items-center ${style.text}`}>
                  {style.icon}
                  {groupName}
                  <span className="ml-2 text-xs bg-white bg-opacity-80 rounded-full px-2 py-0.5 shadow-inner">
                    {groups[groupName].length}
                  </span>
                </h3>
              </div>
              
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
                } ${groups[groupName].length === 0 ? 'p-0' : ''}`}>
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
        
        {sortedGroupNames.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 border border-gray-200">
            No controls match your filter criteria
          </div>
        )}
      </div>
      
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
  );
} 
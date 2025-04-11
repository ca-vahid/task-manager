"use client";

import React, { useMemo, useState } from 'react';
import { Task, Technician, Group, ViewDensity, TaskStatus, Category, PriorityLevel } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import Timeline from 'react-calendar-timeline';
import moment from 'moment';

interface TimelineViewProps {
  tasks: Task[];
  technicians: Technician[];
  groups: Group[];
  categories?: Category[];
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  viewDensity: ViewDensity;
}

export function TimelineView({
  tasks,
  technicians,
  groups,
  categories = [],
  onUpdateTask,
  viewDensity
}: TimelineViewProps) {
  const [visibleTimeStart, setVisibleTimeStart] = useState<number>(moment().add(-2, 'day').valueOf());
  const [visibleTimeEnd, setVisibleTimeEnd] = useState<number>(moment().add(30, 'day').valueOf());
  
  // Timeline unit size based on view density
  const unitSize = useMemo(() => {
    switch (viewDensity) {
      case 'compact': return 20;
      case 'medium': return 25;
      case 'full': return 30;
      default: return 25;
    }
  }, [viewDensity]);

  // Convert Firestore Timestamp to Date
  const timestampToDate = (timestamp: Timestamp | null | any): Date | null => {
    if (!timestamp) return null;
    try {
      if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
      } else if (typeof timestamp === 'object' && 'seconds' in timestamp) {
        return new Date(timestamp.seconds * 1000);
      } else if (typeof timestamp === 'string') {
        return new Date(timestamp);
      }
      return null;
    } catch (error) {
      console.error("Error converting timestamp:", error);
      return null;
    }
  };

  // Prepare groups for timeline
  const timelineGroups = useMemo(() => {
    const defaultGroups = [
      { id: 'unassigned', title: 'Unassigned' }
    ];
    
    // Create groups from technicians for the assignee view
    const technicianGroups = technicians.map(tech => ({
      id: tech.id,
      title: tech.name
    }));
    
    return [
      ...defaultGroups,
      ...technicianGroups
    ];
  }, [technicians]);

  // Prepare items for timeline
  const timelineItems = useMemo(() => {
    return tasks.map(task => {
      // Get due date, default to 7 days from now if not set
      const dueDate = timestampToDate(task.estimatedCompletionDate) || 
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      // Set start time to due date minus 2 days for visibility
      const startTime = moment(dueDate).subtract(2, 'day').valueOf();
      const endTime = moment(dueDate).add(1, 'day').valueOf();
      
      // Get group ID (assignee or unassigned)
      const groupId = task.assigneeId || 'unassigned';
      
      // Set item color based on status
      let itemColor = '#6366f1'; // Indigo for open
      let textColor = 'white';
      
      switch (task.status) {
        case TaskStatus.Open:
          itemColor = '#6366f1'; // Indigo
          break;
        case TaskStatus.Pending:
          itemColor = '#f59e0b'; // Amber
          break;
        case TaskStatus.Resolved:
          itemColor = '#10b981'; // Emerald
          break;
      }
      
      // Add priority indicator
      let borderLeft = '3px solid transparent';
      if (task.priorityLevel === PriorityLevel.High) {
        borderLeft = '3px solid #ef4444'; // Red border for high priority
      } else if (task.priorityLevel === PriorityLevel.Critical) {
        borderLeft = '3px solid #7f1d1d'; // Dark red border for critical
      }
      
      // Get category name if available
      const categoryName = task.categoryId && categories.length > 0
        ? categories.find(c => c.id === task.categoryId)?.value || null
        : null;
      
      // Format tooltip content with rich details
      const tooltipContent = `
        <div class="p-2">
          <div class="font-bold mb-1">${task.title}</div>
          <div class="text-sm mb-1">Status: ${task.status}</div>
          ${task.assigneeId ? `<div class="text-sm mb-1">Assignee: ${technicians.find(t => t.id === task.assigneeId)?.name || 'Unknown'}</div>` : ''}
          ${task.priorityLevel ? `<div class="text-sm mb-1">Priority: ${task.priorityLevel}</div>` : ''}
          ${categoryName ? `<div class="text-sm mb-1">Category: ${categoryName}</div>` : ''}
        </div>
      `;
      
      return {
        id: task.id,
        group: groupId,
        title: task.title,
        start_time: startTime,
        end_time: endTime,
        itemProps: {
          style: {
            backgroundColor: itemColor,
            color: textColor,
            borderLeft: borderLeft,
            borderRadius: '4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
          },
          title: task.title // Simple HTML tooltip
        }
      };
    });
  }, [tasks, technicians, categories]);

  // Handle time change
  const handleTimeChange = (visibleTimeStart: number, visibleTimeEnd: number) => {
    setVisibleTimeStart(visibleTimeStart);
    setVisibleTimeEnd(visibleTimeEnd);
  };

  // Handle item click
  const handleItemClick = (itemId: string | number, e: React.MouseEvent) => {
    const task = tasks.find(t => t.id === String(itemId));
    if (!task) return;
    
    // Could expand to show more details or open a modal
    console.log("Task clicked:", task);
  };

  // Handle item context menu
  const handleItemContextMenu = (itemId: string | number, e: React.MouseEvent) => {
    e.preventDefault();
    // Could open a context menu with actions
    console.log("Context menu for task:", itemId);
  };

  return (
    <div className="timeline-container bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No tasks found</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col sm:flex-row justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2 sm:mb-0">
              Task Timeline
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  const now = moment().valueOf();
                  setVisibleTimeStart(moment(now).add(-2, 'day').valueOf());
                  setVisibleTimeEnd(moment(now).add(14, 'day').valueOf());
                }}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const start = moment(visibleTimeStart);
                  const end = moment(visibleTimeEnd);
                  const diff = end.diff(start, 'days');
                  setVisibleTimeStart(moment(visibleTimeStart).add(-diff/2, 'days').valueOf());
                  setVisibleTimeEnd(moment(visibleTimeEnd).add(-diff/2, 'days').valueOf());
                }}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                « Back
              </button>
              <button
                onClick={() => {
                  const start = moment(visibleTimeStart);
                  const end = moment(visibleTimeEnd);
                  const diff = end.diff(start, 'days');
                  setVisibleTimeStart(moment(visibleTimeStart).add(diff/2, 'days').valueOf());
                  setVisibleTimeEnd(moment(visibleTimeEnd).add(diff/2, 'days').valueOf());
                }}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Forward »
              </button>
            </div>
          </div>
          
          <div className="dark:text-white">
            <Timeline
              groups={timelineGroups}
              items={timelineItems}
              visibleTimeStart={visibleTimeStart}
              visibleTimeEnd={visibleTimeEnd}
              onTimeChange={handleTimeChange}
              lineHeight={unitSize * 2}
              itemHeightRatio={0.6}
              stackItems
              sidebarWidth={150}
              canMove={false}
              canResize={false}
              canChangeGroup={false}
              onItemClick={handleItemClick}
              onItemContextMenu={handleItemContextMenu}
              className="react-calendar-timeline"
            />
          </div>
        </>
      )}
    </div>
  );
} 
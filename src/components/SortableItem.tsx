'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Control, Technician, ViewDensity } from '@/lib/types';
import { ControlCard } from './ControlCard';

interface SortableItemProps {
  id: string;
  control: Control;
  technicians: Technician[];
  onUpdateControl: (id: string, updates: Partial<Omit<Control, 'id'>>) => Promise<void>;
  onDeleteControl: (id: string) => Promise<void>;
  viewDensity?: ViewDensity;
}

export function SortableItem({
  id,
  control,
  technicians,
  onUpdateControl,
  onDeleteControl,
  viewDensity = 'medium'
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative group transition-all duration-200 ${isDragging ? 'scale-105' : ''}`}
    >
      {/* Improved drag handle with visual feedback */}
      <div 
        {...attributes} 
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-70 transition-opacity touch-manipulation"
        aria-label="Drag to reorder"
      >
        <div className="w-6 h-10 flex flex-col items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors">
          <div className="w-4 h-0.5 bg-gray-400 dark:bg-gray-500 mb-1 rounded-full"></div>
          <div className="w-4 h-0.5 bg-gray-400 dark:bg-gray-500 mb-1 rounded-full"></div>
          <div className="w-4 h-0.5 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
        </div>
      </div>
      
      {/* Add a subtle highlight effect when dragging */}
      <div className={`pl-6 transition-all duration-200 ${isDragging ? 'ring-2 ring-indigo-300 dark:ring-indigo-600 ring-opacity-50 dark:ring-opacity-50 rounded-lg' : ''}`}>
        <ControlCard
          control={control}
          technicians={technicians}
          onUpdateControl={onUpdateControl}
          onDeleteControl={onDeleteControl}
          viewDensity={viewDensity}
        />
      </div>
    </div>
  );
} 
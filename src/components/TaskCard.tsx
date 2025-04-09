"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskStatus, Technician, ViewDensity, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';

interface TaskCardProps {
  task: Task;
  technicians: Technician[];
  categories?: Category[];
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  viewDensity?: ViewDensity;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
}

// Helper to format Firestore Timestamp to YYYY-MM-DD for date input
function formatDateForInput(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  try {
    // Check if timestamp is a Firestore Timestamp or has seconds property
    let date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      // Handle case where it might be a raw Firestore timestamp object
      date = new Date((timestamp as any).seconds * 1000);
    } else if (typeof timestamp === 'string') {
      // Handle case where it might be a date string
      date = new Date(timestamp);
    } else {
      return '';
    }

    if (isNaN(date.getTime())) { return ''; }
    
    // Use UTC methods to prevent timezone shifts
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) { 
    console.error("Error formatting date:", error, timestamp);
    return ''; 
  }
}

// Get time remaining until completion date
function getTimeRemaining(timestamp: Timestamp | null | any, status?: TaskStatus): { days: number; urgent: boolean; overdue: boolean; text: string } {
  if (!timestamp) return { days: 0, urgent: false, overdue: false, text: 'No date set' };
  if (status === TaskStatus.Resolved) { return { days: 0, urgent: false, overdue: false, text: 'Completed' }; }
  try {
    let date: Date;
    if (timestamp instanceof Timestamp) { date = timestamp.toDate(); }
    else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) { date = new Date(timestamp.seconds * 1000); }
    else if (typeof timestamp === 'string') { date = new Date(timestamp); }
    else { return { days: 0, urgent: false, overdue: false, text: 'Invalid date' }; }
    if (isNaN(date.getTime())) { return { days: 0, urgent: false, overdue: false, text: 'Invalid date' }; }
    
    // Use UTC dates for comparison to avoid timezone issues
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dateUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    const diffTime = dateUTC.getTime() - todayUTC.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) { return { days: Math.abs(diffDays), urgent: false, overdue: true, text: `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'} overdue` }; }
    else if (diffDays === 0) { return { days: 0, urgent: true, overdue: false, text: 'Due today' }; }
    else if (diffDays <= 3) { return { days: diffDays, urgent: true, overdue: false, text: `${diffDays} ${diffDays === 1 ? 'day' : 'days'} left` }; }
    else { return { days: diffDays, urgent: false, overdue: false, text: `${diffDays} days left` }; }
  } catch (error) { return { days: 0, urgent: false, overdue: false, text: 'Error' }; }
}

// Get status color and background (with dark variants) - smoother palette
function getStatusStyles(status: TaskStatus): { color: string; background: string; border: string; darkColor: string; darkBackground: string; darkBorder: string; } {
  switch (status) {
    case TaskStatus.Open: return { color: 'text-blue-600', background: 'bg-blue-50', border: 'border-blue-100', darkColor: 'dark:text-blue-300', darkBackground: 'dark:bg-blue-900/20', darkBorder: 'dark:border-blue-800/30' };
    case TaskStatus.Pending: return { color: 'text-orange-600', background: 'bg-orange-50', border: 'border-orange-100', darkColor: 'dark:text-orange-300', darkBackground: 'dark:bg-orange-900/20', darkBorder: 'dark:border-orange-800/30' };
    case TaskStatus.Resolved: return { color: 'text-green-600', background: 'bg-green-50', border: 'border-green-100', darkColor: 'dark:text-green-300', darkBackground: 'dark:bg-green-900/20', darkBorder: 'dark:border-green-800/30' };
    default: return { color: 'text-gray-600', background: 'bg-gray-50', border: 'border-gray-100', darkColor: 'dark:text-gray-300', darkBackground: 'dark:bg-gray-800/20', darkBorder: 'dark:border-gray-700/30' };
  }
}

// Get category icon and color based on category name
function getCategoryDisplay(categoryName: string | null): { icon: string; color: string; background: string; border: string; darkColor: string; darkBackground: string; } {
  if (!categoryName) return {
    icon: '❓',
    color: 'text-gray-600',
    background: 'bg-gray-50',
    border: 'border-gray-200',
    darkColor: 'dark:text-gray-300',
    darkBackground: 'dark:bg-gray-800/50'
  };
  
  // Convert to lowercase for easier matching
  const name = categoryName.toLowerCase();
  
  // Security related
  if (name.includes('security alert') || name.includes('phishing') || name.includes('spam')) {
    return {
      icon: '🚨',
      color: 'text-red-600',
      background: 'bg-red-50',
      border: 'border-red-200',
      darkColor: 'dark:text-red-300',
      darkBackground: 'dark:bg-red-900/30'
    };
  } else if (name.includes('security incident')) {
    return {
      icon: '🔒',
      color: 'text-red-600',
      background: 'bg-red-50',
      border: 'border-red-200',
      darkColor: 'dark:text-red-300',
      darkBackground: 'dark:bg-red-900/30'
    };
  } else if (name.includes('physical security') || name.includes('video security')) {
    return {
      icon: '📹',
      color: 'text-indigo-600',
      background: 'bg-indigo-50',
      border: 'border-indigo-200',
      darkColor: 'dark:text-indigo-300',
      darkBackground: 'dark:bg-indigo-900/30'
    };
  } else if (name.includes('password') || name.includes('mfa')) {
    return {
      icon: '🔑',
      color: 'text-amber-600',
      background: 'bg-amber-50',
      border: 'border-amber-200',
      darkColor: 'dark:text-amber-300',
      darkBackground: 'dark:bg-amber-900/30'
    };
  } else if (name.includes('permissions')) {
    return {
      icon: '🔐',
      color: 'text-amber-600',
      background: 'bg-amber-50',
      border: 'border-amber-200',
      darkColor: 'dark:text-amber-300',
      darkBackground: 'dark:bg-amber-900/30'
    };
  } 
  // Network and Infrastructure
  else if (name.includes('network') || name.includes('wifi infra')) {
    return {
      icon: '🔌',
      color: 'text-blue-600',
      background: 'bg-blue-50',
      border: 'border-blue-200',
      darkColor: 'dark:text-blue-300',
      darkBackground: 'dark:bg-blue-900/30'
    };
  } else if (name.includes('server') || name.includes('infrastructure') || name.includes('azure')) {
    return {
      icon: '🖥️',
      color: 'text-blue-600',
      background: 'bg-blue-50',
      border: 'border-blue-200',
      darkColor: 'dark:text-blue-300',
      darkBackground: 'dark:bg-blue-900/30'
    };
  } else if (name.includes('active directory')) {
    return {
      icon: '🔍',
      color: 'text-blue-600',
      background: 'bg-blue-50',
      border: 'border-blue-200',
      darkColor: 'dark:text-blue-300',
      darkBackground: 'dark:bg-blue-900/30'
    };
  } else if (name.includes('wifi client')) {
    return {
      icon: '📶',
      color: 'text-green-600',
      background: 'bg-green-50',
      border: 'border-green-200',
      darkColor: 'dark:text-green-300',
      darkBackground: 'dark:bg-green-900/30'
    };
  } else if (name.includes('vpn')) {
    return {
      icon: '🔒',
      color: 'text-violet-600',
      background: 'bg-violet-50',
      border: 'border-violet-200',
      darkColor: 'dark:text-violet-300',
      darkBackground: 'dark:bg-violet-900/30'
    };
  } else if (name.includes('isp')) {
    return {
      icon: '🌐',
      color: 'text-yellow-600',
      background: 'bg-yellow-50',
      border: 'border-yellow-200',
      darkColor: 'dark:text-yellow-300',
      darkBackground: 'dark:bg-yellow-900/30'
    };
  } else if (name.includes('global outage')) {
    return {
      icon: '⚠️',
      color: 'text-red-600',
      background: 'bg-red-50',
      border: 'border-red-200',
      darkColor: 'dark:text-red-300',
      darkBackground: 'dark:bg-red-900/30'
    };
  }
  // Hardware and Devices
  else if (name.includes('computer') || name.includes('workstation')) {
    return {
      icon: '💻',
      color: 'text-teal-600',
      background: 'bg-teal-50',
      border: 'border-teal-200',
      darkColor: 'dark:text-teal-300',
      darkBackground: 'dark:bg-teal-900/30'
    };
  } else if (name.includes('mobile') || name.includes('ipad')) {
    return {
      icon: '📱',
      color: 'text-emerald-600',
      background: 'bg-emerald-50',
      border: 'border-emerald-200',
      darkColor: 'dark:text-emerald-300',
      darkBackground: 'dark:bg-emerald-900/30'
    };
  } else if (name.includes('macbook')) {
    return {
      icon: '🍎',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  } else if (name.includes('printer')) {
    return {
      icon: '🖨️',
      color: 'text-purple-600',
      background: 'bg-purple-50',
      border: 'border-purple-200',
      darkColor: 'dark:text-purple-300',
      darkBackground: 'dark:bg-purple-900/30'
    };
  } else if (name.includes('peripheral')) {
    return {
      icon: '🖱️',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  } else if (name.includes('hololens')) {
    return {
      icon: '👓',
      color: 'text-indigo-600',
      background: 'bg-indigo-50',
      border: 'border-indigo-200',
      darkColor: 'dark:text-indigo-300',
      darkBackground: 'dark:bg-indigo-900/30'
    };
  } else if (name.includes('boardroom') || name.includes('a/v')) {
    return {
      icon: '📽️',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  }
  // Software and Support
  else if (name.includes('software')) {
    return {
      icon: '📀',
      color: 'text-indigo-600',
      background: 'bg-indigo-50',
      border: 'border-indigo-200',
      darkColor: 'dark:text-indigo-300',
      darkBackground: 'dark:bg-indigo-900/30'
    };
  } else if (name.includes('sharepoint') || name.includes('coreshack')) {
    return {
      icon: '📁',
      color: 'text-blue-600',
      background: 'bg-blue-50',
      border: 'border-blue-200',
      darkColor: 'dark:text-blue-300',
      darkBackground: 'dark:bg-blue-900/30'
    };
  } else if (name.includes('beyondtrust')) {
    return {
      icon: '🛡️',
      color: 'text-amber-600',
      background: 'bg-amber-50',
      border: 'border-amber-200',
      darkColor: 'dark:text-amber-300',
      darkBackground: 'dark:bg-amber-900/30'
    };
  } else if (name.includes('licensing')) {
    return {
      icon: '📜',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  } else if (name.includes('backup') || name.includes('restore')) {
    return {
      icon: '💾',
      color: 'text-emerald-600',
      background: 'bg-emerald-50',
      border: 'border-emerald-200',
      darkColor: 'dark:text-emerald-300',
      darkBackground: 'dark:bg-emerald-900/30'
    };
  } else if (name.includes('scripting') || name.includes('dev ops')) {
    return {
      icon: '⌨️',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  }
  // HR and Administration 
  else if (name.includes('onboarding')) {
    return {
      icon: '👋',
      color: 'text-green-600',
      background: 'bg-green-50',
      border: 'border-green-200',
      darkColor: 'dark:text-green-300',
      darkBackground: 'dark:bg-green-900/30'
    };
  } else if (name.includes('offboarding')) {
    return {
      icon: '👋',
      color: 'text-amber-600',
      background: 'bg-amber-50',
      border: 'border-amber-200',
      darkColor: 'dark:text-amber-300',
      darkBackground: 'dark:bg-amber-900/30'
    };
  } else if (name.includes('it administration') || name.includes('it orders') || name.includes('purchases')) {
    return {
      icon: '📋',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  } else if (name.includes('warranty')) {
    return {
      icon: '📑',
      color: 'text-gray-600',
      background: 'bg-gray-50',
      border: 'border-gray-200',
      darkColor: 'dark:text-gray-300',
      darkBackground: 'dark:bg-gray-800/50'
    };
  } else if (name.includes('office move') || name.includes('expansions')) {
    return {
      icon: '🏢',
      color: 'text-blue-600',
      background: 'bg-blue-50',
      border: 'border-blue-200',
      darkColor: 'dark:text-blue-300',
      darkBackground: 'dark:bg-blue-900/30'
    };
  } else if (name.includes('projects')) {
    return {
      icon: '📊',
      color: 'text-indigo-600',
      background: 'bg-indigo-50',
      border: 'border-indigo-200',
      darkColor: 'dark:text-indigo-300',
      darkBackground: 'dark:bg-indigo-900/30'
    };
  } else if (name.includes('bst')) {
    return {
      icon: '🧰',
      color: 'text-orange-600',
      background: 'bg-orange-50',
      border: 'border-orange-200',
      darkColor: 'dark:text-orange-300',
      darkBackground: 'dark:bg-orange-900/30'
    };
  } else {
    // Default case for other categories (including "Other")
    return {
      icon: '🏷️',
      color: 'text-purple-600',
      background: 'bg-purple-50',
      border: 'border-purple-200',
      darkColor: 'dark:text-purple-300',
      darkBackground: 'dark:bg-purple-900/30'
    };
  }
}

export function TaskCard({ 
  task, 
  technicians,
  categories = [],
  onUpdateTask, 
  onDeleteTask, 
  viewDensity = 'medium',
  isSelected = false,
  onSelect
}: TaskCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false); // Animation state for removal
  const [showDescription, setShowDescription] = useState(false); // For collapsible description
  const [menuOpen, setMenuOpen] = useState(false); // For three-dot menu
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false); // Add state for category update UI
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  
  // Menu positioning
  const [menuPosition, setMenuPosition] = useState({ vertical: 'bottom', horizontal: 'right' });
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });

  // Derived State & Styles
  const timeRemaining = getTimeRemaining(task.estimatedCompletionDate, task.status);
  const statusStyles = getStatusStyles(task.status);
  const assigneeName = task.assigneeId ? technicians.find(tech => tech.id === task.assigneeId)?.name || 'Unknown' : 'Unassigned';
  const isHighPriority = task.priorityLevel === PriorityLevel.High || task.priorityLevel === PriorityLevel.Critical;

  // Get category name and style if available
  const categoryName = task.categoryId && categories.length > 0
    ? categories.find(c => c.id === task.categoryId)?.value || null
    : null;
  const categoryStyles = getCategoryDisplay(categoryName);

  // Add state to track if we can render portals (only client-side)
  const [canUseDOM, setCanUseDOM] = useState(false);

  // Only try to use portals when on client side
  useEffect(() => {
    setCanUseDOM(typeof window !== 'undefined' && window.document !== undefined);
  }, []);

  // Determine dropdown position when menu opens
  useEffect(() => {
    if (menuOpen && toggleButtonRef.current) {
      const buttonRect = toggleButtonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      
      // Calculate available space in different directions
      const spaceBelow = windowHeight - buttonRect.bottom;
      const spaceRight = windowWidth - buttonRect.right;
      
      // Determine best position (vertical)
      const vertical = spaceBelow < 250 ? 'top' : 'bottom';
      
      // Determine best position (horizontal)
      const horizontal = spaceRight < 200 ? 'left' : 'right';
      
      // Set the absolute coordinates for the menu
      if (vertical === 'top') {
        // Position above the button
        setMenuCoords({
          top: buttonRect.top - 5, // slight offset
          left: horizontal === 'left' ? buttonRect.right - 224 : buttonRect.left
        });
      } else {
        // Position below the button
        setMenuCoords({
          top: buttonRect.bottom + 5, // slight offset
          left: horizontal === 'left' ? buttonRect.right - 224 : buttonRect.left
        });
      }
      
      // Update position state
      setMenuPosition({ vertical, horizontal });
    }
  }, [menuOpen]);

  // Create portal for menu to avoid z-index issues with neighboring cards
  useEffect(() => {
    // Handler for global click outside to close menu
    const handleGlobalClick = (event: MouseEvent) => {
      // Don't close if clicking on the toggle button (that has its own handler)
      if (toggleButtonRef.current?.contains(event.target as Node)) return;
      
      // Close if clicking outside menu
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    
    if (menuOpen) {
      document.addEventListener('mousedown', handleGlobalClick);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, [menuOpen]);

  // Handler for status change
  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as TaskStatus;
    try {
      await onUpdateTask(task.id, { status: newStatus });
    } catch (error: any) {
      setUpdateError(`Failed to update status: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for assignee change
  const handleAssigneeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAssigneeId = e.target.value || null;
    try {
      await onUpdateTask(task.id, { assigneeId: newAssigneeId });
    } catch (error: any) {
      setUpdateError(`Failed to update assignee: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for category change
  const handleCategoryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategoryId = e.target.value || null;
    setIsUpdatingCategory(false);
    setMenuOpen(false);
    
    try {
      await onUpdateTask(task.id, { categoryId: newCategoryId });
    } catch (error: any) {
      setUpdateError(`Failed to update category: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for delete button click - now just initiates the callback
  const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setMenuOpen(false);
    
    // We're now going to directly trigger the delete action 
    // with the checkbox-based selection UI handling confirmation
    try {
      // First start the removal animation
      setIsRemoving(true);
      setIsDeleting(true);
      
      // Wait for animation to complete before calling parent delete function
      setTimeout(async () => {
        await onDeleteTask(task.id);
      }, 300); // Match this with the CSS transition duration
    } catch (error: any) {
      setUpdateError("Failed to delete task.");
      setIsDeleting(false);
      setIsRemoving(false);
    }
  };

  // Handler for selection checkbox
  const handleSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onSelect) {
      onSelect(e.target.checked);
    }
  };

  // Toggle description visibility
  const toggleDescription = () => {
    setShowDescription(!showDescription);
  };

  // Toggle menu
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  // Determine card size based on view density
  const cardClasses = viewDensity === 'compact' 
    ? 'p-3 text-sm' 
    : viewDensity === 'medium' 
      ? 'p-4' 
      : 'p-5';

  // Sanitize HTML content
  const sanitizeHtml = (html: string) => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'h1', 'h2', 'h3', 'h4', 'br', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class']
    });
  };

  // CSS animation keyframes (as inline style for portability)
  const animationStyles = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes scaleIn {
      from { transform: scale(0.95); }
      to { transform: scale(1); }
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      <div className={`border ${statusStyles.border} ${statusStyles.darkBorder} rounded-lg shadow-sm hover:shadow-md ${statusStyles.background} ${statusStyles.darkBackground} ${cardClasses} 
      transition-all duration-300 ease-in-out relative ${isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''} 
      ${isRemoving ? 'opacity-0 transform scale-95 -translate-x-4' : 'opacity-100 transform scale-100 translate-x-0'}`}>
        {/* Header with title and action buttons */}
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50 text-lg pr-2">
            {task.title}
          </h3>
          
          <div className="flex items-center gap-2">
            {/* Selection checkbox */}
            {onSelect && (
              <div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={handleSelectChange}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
              </div>
            )}
            
            {/* Menu button and dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                ref={toggleButtonRef}
                onClick={toggleMenu}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <EllipsisVerticalIcon className="h-5 w-5" />
              </button>
              
              {menuOpen && canUseDOM && createPortal(
                <div 
                  ref={menuContainerRef}
                  className="fixed shadow-xl rounded-md border border-gray-200 dark:border-gray-700 z-50"
                  style={{ 
                    top: `${menuCoords.top}px`,
                    left: `${menuCoords.left}px`,
                    width: '224px',
                    maxHeight: '80vh', 
                    overflowY: 'auto',
                    backgroundColor: 'white',
                    backgroundImage: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  <div className="py-1 divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {/* Task actions section */}
                    <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Task Actions</div>
                    
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Mark as complete action
                          onUpdateTask(task.id, { status: TaskStatus.Resolved });
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Mark as Complete
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          // Copy title to clipboard
                          navigator.clipboard.writeText(task.title);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                          <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
                        </svg>
                        Copy Task Title
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setIsUpdatingCategory(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        Update Category
                      </button>
                    </div>
                    
                    {/* Danger zone section */}
                    <div>
                      <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Danger Zone</div>
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Delete Task
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>

        {/* Error message if any */}
        {updateError && (
          <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-2 mb-3 rounded-md text-sm">
            {updateError}
          </div>
        )}

        {/* Category display next to ticket ID for better space usage */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Ticket ID */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {task.ticketNumber ? (
              <a
                href={task.ticketUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
              >
                <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded">
                  Ticket ID: {task.ticketNumber}
                </span>
              </a>
            ) : (
              <span className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">
                Ticket ID: Pending
              </span>
            )}
          </div>
          
          {/* Category with icon */}
          {categoryName && (
            <div className={`text-xs ${categoryStyles.color} ${categoryStyles.darkColor} ${categoryStyles.background} ${categoryStyles.darkBackground} border ${categoryStyles.border} px-2 py-0.5 rounded-full flex items-center`}>
              <span className="mr-1">{categoryStyles.icon}</span>
              <span className="text-sm">{categoryName}</span>
            </div>
          )}
        </div>

        {/* Description toggle button */}
        {task.explanation && (
          <div>
            <button 
              onClick={toggleDescription}
              className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center mb-3 bg-gray-50 dark:bg-gray-800/70 px-2 py-1 rounded"
            >
              {showDescription ? (
                <>
                  <ChevronUpIcon className="h-4 w-4 mr-1" />
                  Hide Description
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-4 w-4 mr-1" />
                  Show Description
                </>
              )}
            </button>
            
            {/* Collapsible description */}
            {showDescription && (
              <div 
                className="mb-4 text-sm text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-black/20 p-3 rounded-md border border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in rich-text-content"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.explanation || '') }}
              />
            )}
          </div>
        )}
        
        {/* Task details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          {/* Status selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Status
            </label>
            <select
              value={task.status}
              onChange={handleStatusChange}
              className={`w-full ${statusStyles.color} ${statusStyles.darkColor} text-sm rounded-md border ${statusStyles.border} ${statusStyles.darkBorder} py-1.5 px-2 bg-white/50 dark:bg-black/20`}
            >
              <option value={TaskStatus.Open}>Open</option>
              <option value={TaskStatus.Pending}>Pending</option>
              <option value={TaskStatus.Resolved}>Resolved</option>
            </select>
          </div>

          {/* Assignee selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Assignee
            </label>
            <select
              value={task.assigneeId || ""}
              onChange={handleAssigneeChange}
              className="w-full text-sm rounded-md border border-gray-100 dark:border-gray-700 py-1.5 px-2 bg-white/50 dark:bg-black/20 text-gray-700 dark:text-gray-200"
            >
              <option value="">Unassigned</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>

          {/* Due date - without the days left text */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Due Date
            </label>
            <div className={`w-full text-sm py-1.5 px-2 rounded-md ${timeRemaining.overdue ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' : timeRemaining.urgent ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300'}`}>
              {task.estimatedCompletionDate ? 
                formatDateForInput(task.estimatedCompletionDate) :
                'No date set'
              }
            </div>
          </div>
        </div>

        {/* Category update UI */}
        {isUpdatingCategory && (
          <div className="mt-4 p-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/70 dark:to-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-md">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Update Category
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
              <select
                value={task.categoryId || ""}
                onChange={handleCategoryChange}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 py-1.5 px-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
              >
                <option value="">No Category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.value}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsUpdatingCategory(false)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                {/* Preview of the selected category if any */}
                {categoryName && (
                  <div className={`flex items-center px-3 py-1.5 rounded-md ${categoryStyles.background} ${categoryStyles.darkBackground} ${categoryStyles.color} ${categoryStyles.darkColor} border ${categoryStyles.border}`}>
                    <span className="mr-1">{categoryStyles.icon}</span>
                    <span className="text-sm">{categoryName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
} 
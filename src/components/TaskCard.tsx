"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskStatus, Technician, ViewDensity, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { 
  ChevronDownIcon, 
  ChevronUpIcon, 
  EllipsisVerticalIcon,
  UserIcon,
  ClockIcon,
  CheckIcon,
  ClipboardDocumentListIcon,
  PauseIcon
} from '@heroicons/react/24/outline';
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
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false); // For bottom category update UI
  const [isEditingCategoryInPlace, setIsEditingCategoryInPlace] = useState(false); // For in-place category editing
  const [isCreatingTicket, setIsCreatingTicket] = useState(false); // Add state for ticket creation
  const [isCheckingExistingTickets, setIsCheckingExistingTickets] = useState(false);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const categorySelectRef = useRef<HTMLSelectElement>(null); // Ref for the category select element
  
  // Menu positioning
  const [menuPosition, setMenuPosition] = useState({ vertical: 'bottom', horizontal: 'right' });
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, maxHeight: '80vh' });

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
      const menuHeight = 350; // Approximate max height of the menu
      const menuWidth = 224; // Width of the menu
      
      // Calculate available spaces
      const spaceBelow = windowHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const spaceRight = windowWidth - buttonRect.right;
      
      // Initialize variables for position
      let top = 0;
      let maxMenuHeight = 0;
      
      // Use more adaptive positioning to minimize scrolling and improve appearance
      if (spaceBelow >= 250) {
        // Plenty of space below - position normally
        top = buttonRect.bottom + 5;
        maxMenuHeight = Math.min(menuHeight, windowHeight - top - 20);
      } 
      else if (spaceBelow >= 150) {
        // Some space below, but not a lot - use a more compact menu
        top = buttonRect.bottom + 5;
        maxMenuHeight = spaceBelow - 15; // Use almost all available space
      }
      else if (spaceAbove >= 200) {
        // Not much room below, but plenty above - show above the button
        maxMenuHeight = Math.min(menuHeight, spaceAbove - 15);
        top = buttonRect.top - maxMenuHeight - 5;
      }
      else {
        // Limited space both above and below - center the menu on the button
        // and make it fill most of the screen height
        const totalSpace = windowHeight - 30; // Allow for margin at top and bottom
        maxMenuHeight = Math.min(menuHeight, totalSpace);
        
        // Center vertically on the toggle button
        const buttonCenter = buttonRect.top + buttonRect.height / 2;
        top = Math.max(15, Math.min(buttonCenter - maxMenuHeight / 2, windowHeight - maxMenuHeight - 15));
      }
      
      // Set horizontal position first (easier)
      const horizontal = spaceRight < menuWidth ? 'left' : 'right';
      let left;
      if (horizontal === 'left') {
        left = Math.max(10, buttonRect.right - menuWidth);
      } else {
        left = Math.min(buttonRect.left, windowWidth - menuWidth - 10);
      }
      
      // Make sure we have at least a minimum usable height
      maxMenuHeight = Math.max(100, maxMenuHeight);
      
      // Set the coordinates and maxHeight
      setMenuCoords({ 
        top,
        left,
        maxHeight: `${maxMenuHeight}px`
      });
      
      // Update position state for any UI that depends on it
      setMenuPosition({ 
        vertical: top < buttonRect.top ? 'top' : 'bottom',
        horizontal
      });
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

  // Update this effect
  useEffect(() => {
    // Only check if the task doesn't already have a ticket number
    // and it's not already creating/checking tickets
    if (!task.ticketNumber && !isCreatingTicket && !isCheckingExistingTickets) {
      // Use a flag to prevent multiple checks for the same task
      const taskCheckedFlag = sessionStorage.getItem(`ticket-checked-${task.id}`);
      if (!taskCheckedFlag) {
        checkForExistingTickets();
        // Mark this task as checked to prevent future API calls
        sessionStorage.setItem(`ticket-checked-${task.id}`, 'true');
      }
    }
  }, [task.id, task.ticketNumber, isCreatingTicket, isCheckingExistingTickets, onUpdateTask]);

  // Then update the function to better handle errors
  const checkForExistingTickets = async () => {
    try {
      setIsCheckingExistingTickets(true);
      
      // Make API call to search for tickets with the same subject
      const response = await fetch('/api/freshservice/tickets/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: task.title
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error("FreshService API error:", data.error || "Unknown error", data.details || "");
        return; // Just return without throwing to avoid the error in the UI
      }
      
      // If we found any tickets, use the first one's ID
      if (data.tickets && data.tickets.length > 0) {
        const firstTicket = data.tickets[0];
        
        // Update the task with the existing ticket information
        await onUpdateTask(task.id, {
          ticketNumber: String(firstTicket.id),
          ticketUrl: firstTicket.url
        });
        
        console.log(`Found existing ticket #${firstTicket.id} for task ${task.id}`);
      }
    } catch (error) {
      console.error('Error checking for existing tickets:', error);
      // Don't show errors to the user for this automatic check
    } finally {
      setIsCheckingExistingTickets(false);
    }
  };

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
    setIsEditingCategoryInPlace(false);
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

  // Toggle menu
  const toggleMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent any default button behavior
    e.stopPropagation(); // Stop the click from bubbling up
    setMenuOpen(!menuOpen);
  };

  // Determine card size based on view density
  const cardClasses = viewDensity === 'compact' 
    ? 'p-2 text-sm' 
    : viewDensity === 'medium' 
      ? 'p-3' 
      : 'p-4';

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
    
    /* WebKit scrollbar styling */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    
    ::-webkit-scrollbar-thumb {
      background-color: rgba(156, 163, 175, 0.5);
      border-radius: 3px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background-color: rgba(156, 163, 175, 0.7);
    }
  `;

  // Add a handler to create a FreshService ticket
  const handleCreateTicket = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    
    // Close menu if open
    if (menuOpen) {
      setMenuOpen(false);
    }
    
    try {
      setIsCreatingTicket(true);
      setUpdateError(null);
      
      // Get category name
      const categoryName = task.categoryId ? categories.find(c => c.id === task.categoryId)?.value : null;
      
      // Format due date if available
      const dueDate = task.estimatedCompletionDate ? 
        formatDateForInput(task.estimatedCompletionDate) : null;
      
      // If no due date is available, set it to a week from now
      const oneDueDate = dueDate || (() => {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return date.toISOString().split('T')[0];
      })();
      
      // Prepare the request data
      const requestData = {
        taskId: task.id,
        subject: task.title,
        description: task.explanation,
        responderId: task.assigneeId,
        dueDate: oneDueDate,
        categoryName
      };
      
      // Call the API endpoint
      const response = await fetch('/api/freshservice/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create ticket');
      }
      
      // Process successful response
      const data = await response.json();
      
      // Update the task with ticket information
      await onUpdateTask(task.id, {
        ticketNumber: String(data.ticketId),
        ticketUrl: data.ticketUrl
      });
      
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      setUpdateError(`Failed to create ticket: ${error.message}`);
    } finally {
      setIsCreatingTicket(false);
    }
  };
  
  // Handle opening the ticket URL
  const openTicketUrl = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement | HTMLDivElement>) => {
    e.stopPropagation();
    if (task.ticketUrl) {
      window.open(task.ticketUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Function to delete a ticket
  const handleDeleteTicket = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    
    if (!task.ticketNumber) return;

    // Close menu if open
    if (menuOpen) {
      setMenuOpen(false);
    }
    
    try {
      setIsDeletingTicket(true);
      setUpdateError(null);
      
      // First, call the FreshService API to delete the ticket
      const response = await fetch(`/api/freshservice/tickets/${task.ticketNumber}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete ticket');
      }
      
      // Then update the task to remove the ticket information
      await onUpdateTask(task.id, {
        ticketNumber: null,
        ticketUrl: null
      });
      
      console.log(`Deleted ticket #${task.ticketNumber} for task ${task.id}`);
      
    } catch (error: any) {
      console.error('Error deleting ticket:', error);
      setUpdateError(`Failed to delete ticket: ${error.message}`);
    } finally {
      setIsDeletingTicket(false);
    }
  };

  // Effect to programmatically open the select dropdown when editing starts
  useEffect(() => {
    if (isEditingCategoryInPlace && categorySelectRef.current) {
      // Use setTimeout to ensure the element is rendered and focused before trying to open
      setTimeout(() => {
        // For modern browsers, showPicker() is the standard way
        if (categorySelectRef.current?.showPicker) {
          categorySelectRef.current.showPicker();
        } else {
          // Fallback for older browsers or environments where showPicker isn't available
          // This might not work reliably everywhere, but it's the best fallback
          const event = new MouseEvent('mousedown');
          categorySelectRef.current?.dispatchEvent(event);
        }
      }, 0); // Execute immediately after the current rendering cycle
    }
  }, [isEditingCategoryInPlace]);

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
            <div className="relative z-10" ref={menuRef}>
              <button
                ref={toggleButtonRef}
                onClick={toggleMenu}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Options menu"
                style={{ touchAction: 'manipulation' }}
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
                    maxHeight: menuCoords.maxHeight, 
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    backgroundColor: 'white',
                    backgroundImage: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    scrollbarWidth: 'thin', // For Firefox
                    scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent', // For Firefox
                    msOverflowStyle: 'none' // For IE and Edge
                  }}
                >
                  <div className="py-1 divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {/* Task actions section */}
                    <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Task Actions</div>
                    
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Toggle description visibility
                          setShowDescription(!showDescription);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        {showDescription ? 'Hide' : 'Show'} Details
                      </button>
                      
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
                      
                      {/* Add improved ticket actions */}
                      {task.ticketNumber ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            openTicketUrl(e);
                            setMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5z" />
                          </svg>
                          View Ticket #{task.ticketNumber}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleCreateTicket}
                          className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5z" clipRule="evenodd" />
                          </svg>
                          Create Ticket
                        </button>
                      )}
                      
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
                          <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5zM15 11h2a1 1 0 110 2h-2v-2z" />
                        </svg>
                        Copy Task Title
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingCategoryInPlace(true);
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
                      {task.ticketNumber && (
                        <button
                          type="button"
                          onClick={(e) => {
                            handleDeleteTicket(e);
                            setMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Delete Ticket
                        </button>
                      )}
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

        {/* Integrated Category and Ticket section */}
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          {/* Category with in-place editing */}
          {isEditingCategoryInPlace ? (
            <div className="relative flex items-center">
              <select
                value={task.categoryId || ""}
                onChange={(e) => {
                  handleCategoryChange(e);
                  setIsEditingCategoryInPlace(false);
                }}
                className="text-xs rounded-full pl-7 pr-6 py-1 border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent appearance-none cursor-pointer"
                autoFocus
                onBlur={() => setIsEditingCategoryInPlace(false)}
                ref={categorySelectRef}
              >
                <option value="">No Category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.value}
                  </option>
                ))}
              </select>
              <span className="absolute left-2 top-1/2 transform -translate-y-1/2 pointer-events-none">🏷️</span>
            </div>
          ) : categoryName ? (
            <div 
              onClick={() => setIsEditingCategoryInPlace(true)}
              className={`text-xs ${categoryStyles.color} ${categoryStyles.darkColor} ${categoryStyles.background} ${categoryStyles.darkBackground} border ${categoryStyles.border} px-2 py-1 rounded-full flex items-center cursor-pointer hover:opacity-80 transition-opacity`}
              title="Click to update category"
            >
              <span className="mr-1">{categoryStyles.icon}</span>
              <span>{categoryName}</span>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingCategoryInPlace(true)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded-full flex items-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span>Add Category</span>
            </button>
          )}
          
          {/* Ticket badge and actions */}
          {task.ticketNumber ? (
            <div 
              onClick={openTicketUrl}
              className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-md flex items-center cursor-pointer transition-colors"
              title="View ticket in FreshService"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              Ticket: {task.ticketNumber}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          ) : (
            <button
              onClick={handleCreateTicket}
              disabled={isCreatingTicket}
              className="text-xs bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded-md transition-colors flex items-center"
            >
              {isCreatingTicket ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                  <span>Create Ticket</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Description toggle button and due date */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {/* Due date - moved next to where description button was */}
          <div className={`text-sm py-1 px-2 rounded-md flex items-center ${timeRemaining.overdue ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' : timeRemaining.urgent ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300'}`}>
            <ClockIcon className="h-3.5 w-3.5 mr-1.5 text-current" />
            {task.estimatedCompletionDate ? 
              formatDateForInput(task.estimatedCompletionDate) :
              'No date set'
            }
          </div>
        </div>
            
        {/* Collapsible description */}
        {showDescription && task.explanation && (
          <>
            {/* Description toggle button for hiding */}
            <div className="flex justify-end mb-1">
              <button 
                onClick={() => setShowDescription(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center"
              >
                <ChevronUpIcon className="h-3.5 w-3.5 mr-1" />
                Hide Details
              </button>
            </div>
            <div 
              className="mb-4 text-sm text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-black/20 p-3 rounded-md border border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in rich-text-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(task.explanation || '') }}
            />
          </>
        )}
        
        {/* Task details */}
        <div className="flex items-center gap-2 mt-2">
          {/* Assignee selector */}
          <div className="flex-grow max-w-[180px]">
            <select
              value={task.assigneeId || ""}
              onChange={handleAssigneeChange}
              className="w-full text-sm truncate rounded-md border border-gray-100 dark:border-gray-700 py-1.5 px-2 bg-white/50 dark:bg-black/20 text-gray-700 dark:text-gray-200"
              title={assigneeName}
            >
              <option value="">Unassigned</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>

          {/* Status buttons - combined into a more compact layout */}
          <div className="flex border border-gray-100 dark:border-gray-700 rounded-md overflow-hidden">
            <button
              onClick={() => handleStatusChange({ target: { value: TaskStatus.Open } } as React.ChangeEvent<HTMLSelectElement>)}
              className={`flex items-center justify-center px-2 py-1.5 transition-colors ${
                task.status === TaskStatus.Open 
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                  : 'bg-white/50 dark:bg-black/20 text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/40'
              }`}
              title="Open"
            >
              <ClipboardDocumentListIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleStatusChange({ target: { value: TaskStatus.Pending } } as React.ChangeEvent<HTMLSelectElement>)}
              className={`flex items-center justify-center px-2 py-1.5 transition-colors ${
                task.status === TaskStatus.Pending 
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' 
                  : 'bg-white/50 dark:bg-black/20 text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/40'
              }`}
              title="Pending"
            >
              <PauseIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleStatusChange({ target: { value: TaskStatus.Resolved } } as React.ChangeEvent<HTMLSelectElement>)}
              className={`flex items-center justify-center px-2 py-1.5 transition-colors ${
                task.status === TaskStatus.Resolved 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' 
                  : 'bg-white/50 dark:bg-black/20 text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/40'
              }`}
              title="Done"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Task, Technician, TaskStatus, ViewMode, BatchOperation, ViewDensity, PriorityLevel, Group, Category } from '@/lib/types';
import { TaskCard } from './TaskCard'; 
import { Timestamp } from 'firebase/firestore';
import { TaskFilterBar } from './TaskFilterBar';
import { TaskGroupView } from './TaskGroupView';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { AddTaskForm } from './AddTaskForm';
import { TimelineView } from './TimelineView';
import { CollapsibleGroup } from './CollapsibleGroup';
import { BatchOperationsToolbar } from './BatchOperationsToolbar';
import { Modal } from './Modal';
import { BulkAddTaskAI } from './BulkAddTaskAI';
import { BulkAddTaskFromPDF } from './BulkAddTaskFromPDF';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useUndo, UndoableActionType } from '@/lib/contexts/UndoContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CompactView } from './CompactView';

interface TaskListProps {
  initialTasks?: Task[];
}

export function TaskList({ initialTasks = [] }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkAddForm, setShowBulkAddForm] = useState(false);
  const [showBulkAddPDFForm, setShowBulkAddPDFForm] = useState(false);
  const [groupBy, setGroupBy] = useState<'status' | 'assignee' | 'group' | 'none'>('status');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('full');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<boolean>(false);
  const { showUndoToast, addUndoableAction } = useUndo();
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentOrderMap, setCurrentOrderMap] = useState<Map<string, number>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  
  // Theme context to detect dark mode
  const { theme } = useTheme();

  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ref to track drag operations
  const isDraggingRef = useRef(false);
  const lastDragOperationTimeRef = useRef(0);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data (tasks, technicians, groups, and categories)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch tasks, technicians, groups, and categories in parallel using the API
      const [tasksResponse, techniciansResponse, groupsResponse, categoriesResponse] = await Promise.all([
        fetch('/api/tasks'), 
        fetch('/api/technicians'),
        fetch('/api/groups'),
        fetch('/api/categories')
      ]);

      if (!tasksResponse.ok) {
        throw new Error(`Failed to fetch tasks: ${tasksResponse.statusText}`);
      }

      if (!techniciansResponse.ok) {
        throw new Error(`Failed to fetch technicians: ${techniciansResponse.statusText}`);
      }

      if (!groupsResponse.ok) {
        throw new Error(`Failed to fetch groups: ${groupsResponse.statusText}`);
      }

      if (!categoriesResponse.ok) {
        console.warn(`Failed to fetch categories: ${categoriesResponse.statusText}`);
      }

      // Get data from API responses
      const tasksApiData = await tasksResponse.json();
      const techniciansData: Technician[] = await techniciansResponse.json();
      const groupsData: Group[] = await groupsResponse.json();
      
      // Parse categories data if available
      let categoriesData: Category[] = [];
      try {
        if (categoriesResponse.ok) {
          const categoriesResult = await categoriesResponse.json();
          categoriesData = categoriesResult.categories || [];
          console.log("Loaded categories:", categoriesData.length);
        }
      } catch (err) {
        console.error("Error parsing categories data:", err);
      }
      
      // Debug API response data
      console.log("API tasks data - first item:", tasksApiData[0]);
      
      setTasks(tasksApiData);
      setTechnicians(techniciansData);
      setGroups(groupsData);
      setCategories(categoriesData);

    } catch (err: any) {
      console.error("Failed to fetch data:", err);
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set filtered tasks whenever tasks change
  const handleFilterChange = useCallback((filtered: Task[]) => {
    setFilteredTasks(filtered);
    // If the filtered list length is different from the full list, filters are active
    setActiveFilters(filtered.length !== tasks.length);
  }, [tasks]);
  
  // Apply current filters to updated tasks
  const reapplyFilters = useCallback(() => {
    if (activeFilters) {
      // Signal to the TaskFilterBar that we need to reapply filters
      const reapplyEvent = new CustomEvent('reapplyFilters');
      window.dispatchEvent(reapplyEvent);
    } else {
      // If no filters are active, just show all tasks
      setFilteredTasks(tasks);
    }
  }, [activeFilters, tasks]);

  // Listen for tasks changes and reapply filters if needed
  useEffect(() => {
    reapplyFilters();
  }, [tasks, reapplyFilters]);

  // Handler for updating a task
  const handleUpdateTask = useCallback(async (id: string, updates: Partial<Omit<Task, 'id'>>) => {
    setError(null);
    // --- Optimistic Update --- 
    const originalTasks = [...tasks];
    const taskIndex = originalTasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return; 
    
    // Store the original task for undo
    const originalTask = {...originalTasks[taskIndex]};
    
    // Identify what fields are being updated to show appropriate message
    const updateType = Object.keys(updates)[0] as keyof typeof updates;
    let undoActionType: UndoableActionType = 'UPDATE_TASK_TITLE';
    let updateDescription = '';
    
    // Determine the type of update and create an appropriate message
    if (updateType === 'title') {
      undoActionType = 'UPDATE_TASK_TITLE';
      updateDescription = `Title changed to "${updates.title}"`;
    } else if (updateType === 'estimatedCompletionDate') {
      undoActionType = 'UPDATE_TASK_DATE';
      if (updates.estimatedCompletionDate === null) {
        updateDescription = 'Due date removed';
      } else {
        updateDescription = 'Due date updated';
      }
    } else if (updateType === 'status') {
      undoActionType = 'UPDATE_TASK_STATUS';
      updateDescription = `Status changed to ${updates.status}`;
    } else if (updateType === 'assigneeId') {
      undoActionType = 'UPDATE_TASK_ASSIGNEE';
      const newAssigneeName = updates.assigneeId 
        ? technicians.find(t => t.id === updates.assigneeId)?.name || 'Unknown'
        : 'Unassigned';
      updateDescription = `Assigned to ${newAssigneeName}`;
    } else if (updateType === 'groupId') {
      undoActionType = 'UPDATE_TASK_GROUP';
      const newGroupName = updates.groupId
        ? groups.find(g => g.id === updates.groupId)?.name || 'Unknown'
        : 'No Group';
      updateDescription = `Moved to ${newGroupName} group`;
    } else {
      updateDescription = 'Task updated';
    }
    
    const updatedLocalTask = { 
        ...originalTasks[taskIndex], 
        ...updates 
    };
    
    const newTasks = [...originalTasks];
    newTasks[taskIndex] = updatedLocalTask;
    setTasks(newTasks);
    // --- End Optimistic Update ---

    // Prepare data for API, properly handling dates
    let apiUpdateData: any = { ...updates, id }; // Include ID for the new POST endpoint

    // Fix date handling
    if (updates.estimatedCompletionDate !== undefined) {
      const dateValue = updates.estimatedCompletionDate;
      if (dateValue === null) {
        // Handle null case (clearing the date)
        apiUpdateData.estimatedCompletionDate = null;
      } else if (dateValue instanceof Timestamp) {
        // Convert Timestamp to ISO string
        apiUpdateData.estimatedCompletionDate = dateValue.toDate().toISOString();
      } else if (typeof dateValue === 'string') {
        // Ensure string date is valid before sending
        try {
          const date = new Date(dateValue);
          if (!isNaN(date.getTime())) { // Check if valid date
            apiUpdateData.estimatedCompletionDate = date.toISOString();
          } else {
            throw new Error("Invalid date string");
          }
        } catch (error) {
          console.error("Invalid date format:", dateValue);
          setTasks(originalTasks);
          throw new Error("Invalid date format. Please use YYYY-MM-DD format.");
        }
      }
    }

    try {
      // Record this action for potential undo
      addUndoableAction({
        type: undoActionType,
        data: {
          taskId: id,
          originalValues: {
            [updateType]: originalTask[updateType]
          },
          newValues: updates
        }
      });
      
      // Use POST to /api/tasks/update instead of PUT to /api/tasks/[id]
      const response = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiUpdateData),
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        // Only try to parse JSON if there's content
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            if (text) {
              const errorData = JSON.parse(text);
              if (errorData && errorData.message) {
                errorMessage = errorData.message;
              }
            }
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }
        
        setTasks(originalTasks);
        throw new Error(errorMessage);
      }
      
      // Optional: update the task with the response data
      const updatedTask = await response.json();
      
      // Skip showing undo toast for ticket updates
      const isTicketUpdate = 'ticketNumber' in updates && 'ticketUrl' in updates;
      if (isTicketUpdate) {
        return; // No undo toast for ticket creation updates
      }
      
      // Show undo toast
      showUndoToast(
        updateDescription,
        async () => {
          try {
            // Revert the property to its original value
            const revertUpdate = {
              [updateType]: originalTask[updateType]
            };
            
            // Prepare API data for the undo operation
            let undoApiUpdateData: any = { ...revertUpdate, id };
            
            // Fix date handling for undo
            if (updateType === 'estimatedCompletionDate') {
              const dateValue = originalTask.estimatedCompletionDate;
              if (dateValue === null) {
                undoApiUpdateData.estimatedCompletionDate = null;
              } else if (dateValue instanceof Timestamp) {
                undoApiUpdateData.estimatedCompletionDate = dateValue.toDate().toISOString();
              } else if (dateValue && typeof dateValue === 'object' && 'seconds' in dateValue) {
                const date = new Date((dateValue as any).seconds * 1000);
                undoApiUpdateData.estimatedCompletionDate = date.toISOString();
              }
            }
            
            // Make the API call to undo the update
            const response = await fetch('/api/tasks/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(undoApiUpdateData),
            });
            
            if (!response.ok) {
              throw new Error(`Failed to undo update. Status: ${response.status}`);
            }
            
            // Update the local state with the original value
            setTasks(prevTasks => {
              const newTasks = [...prevTasks];
              const taskIndex = newTasks.findIndex(t => t.id === id);
              
              if (taskIndex !== -1) {
                newTasks[taskIndex] = {
                  ...newTasks[taskIndex],
                  [updateType]: originalTask[updateType]
                };
              }
              
              return newTasks;
            });
            
            return Promise.resolve();
          } catch (error) {
            console.error("Failed to undo update:", error);
            return Promise.reject(error);
          }
        },
        7000 // 7 seconds to undo
      );
      
    } catch (err: any) {
      console.error(`Failed to update task ${id}:`, err);
      setError(err.message || "Failed to update task.");
      setTasks(originalTasks); 
      throw err; 
    }
  }, [tasks, technicians, groups, addUndoableAction, showUndoToast]);

  // Handler for deleting a task
  const handleDeleteTask = useCallback(async (id: string, updateUI: boolean = true) => {
    setError(null);
    const originalTasks = [...tasks];
    const deletedTask = tasks.find(t => t.id === id);
    
    if (!deletedTask) {
      throw new Error("Task not found");
    }
    
    // Track the task's position for restoration
    const taskIndex = tasks.findIndex(t => t.id === id);
    
    // Optimistically update UI
    if (updateUI) {
      setTasks(originalTasks.filter(t => t.id !== id));
    }
    
    try {
      // Add to undoable actions
      addUndoableAction({
        type: 'DELETE_TASK',
        data: {
          task: deletedTask,
          position: taskIndex
        },
        externalAction: !!deletedTask.ticketNumber
      });
      
      // API call to delete the task
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete task. Status: ${response.status}`);
      }
      
      // Show an undo toast
      showUndoToast(
        `Task "${deletedTask.title}" deleted`,
        async () => {
          try {
            // API call to restore the task
            const restoreResponse = await fetch('/api/tasks', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...deletedTask,
                id: undefined // Let the server generate a new ID
              }),
            });
            
            if (!restoreResponse.ok) {
              throw new Error(`Failed to restore task. Status: ${restoreResponse.status}`);
            }
            
            // Get the restored task with its new ID
            const restoredTask = await restoreResponse.json();
            
            // Update the local state to include the restored task
            setTasks(prevTasks => {
              const newTasks = [...prevTasks];
              // Insert back at the original position if possible
              newTasks.splice(Math.min(taskIndex, newTasks.length), 0, restoredTask);
              return newTasks;
            });
            
            return Promise.resolve();
          } catch (error) {
            console.error("Failed to restore task:", error);
            return Promise.reject(error);
          }
        },
        7000 // 7 seconds to undo
      );
      
    } catch (err: any) {
      console.error(`Failed to delete task ${id}:`, err);
      setError(err.message || "Failed to delete task.");
      setTasks(originalTasks);
      throw err;
    }
  }, [tasks, addUndoableAction, showUndoToast]);

  // Handler for adding a task
  const handleAddTask = useCallback(async (newTaskData: Omit<Task, 'id'>) => {
    setError(null);
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTaskData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add task. Status: ${response.status}`);
      }
      
      const addedTask = await response.json();
      
      // Update the local state with the new task
      setTasks(prevTasks => [...prevTasks, addedTask]);
      
      // Close the add form
      setShowAddForm(false);
      setSuccessMessage("Task added successfully!");
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      
    } catch (err: any) {
      console.error("Failed to add task:", err);
      setError(err.message || "Failed to add task.");
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Handler for adding multiple tasks at once
  const handleBulkAddTasks = useCallback(async (newTasksData: Omit<Task, 'id'>[]) => {
    setError(null);
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTasksData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add tasks. Status: ${response.status}`);
      }
      
      const addedTasks = await response.json();
      
      // Update the local state with the new tasks
      setTasks(prevTasks => [...prevTasks, ...addedTasks]);
      
      // Close the bulk add form
      setShowBulkAddForm(false);
      setSuccessMessage(`${addedTasks.length} tasks added successfully!`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      
    } catch (err: any) {
      console.error("Failed to add tasks:", err);
      setError(err.message || "Failed to add tasks.");
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Handler for dragging and dropping tasks for reordering
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const activeId = active.id as string;
      const overId = over.id as string;
      
      setTasks(prevTasks => {
        const oldIndex = prevTasks.findIndex(t => t.id === activeId);
        const newIndex = prevTasks.findIndex(t => t.id === overId);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(prevTasks, oldIndex, newIndex);
        }
        
        return prevTasks;
      });
      
      // Record this drag operation for preventing duplicate toast on the same operation
      isDraggingRef.current = true;
      lastDragOperationTimeRef.current = Date.now();
      
      // Update order map
      const orderedTasks = arrayMove(
        [...tasks],
        tasks.findIndex(t => t.id === activeId),
        tasks.findIndex(t => t.id === overId)
      );
      
      const newOrderMap = new Map<string, number>();
      orderedTasks.forEach((task, index) => {
        newOrderMap.set(task.id, index);
      });
      
      setCurrentOrderMap(newOrderMap);
      
      // Update order in the database
      fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          Object.fromEntries(newOrderMap)
        ),
      }).catch(error => {
        console.error("Failed to update task order:", error);
        setError("Failed to update task order. The changes will be lost on refresh.");
      });
    }
  }, [tasks]);

  // Handler for batch operations on multiple tasks
  const handleBatchOperation = useCallback(async (operation: BatchOperation) => {
    setError(null);
    
    // Store original tasks for potential rollback
    const originalTasks = [...tasks];
    
    // Optimistically update UI
    setTasks(prevTasks => {
      return prevTasks.map(task => {
        if (operation.taskIds.includes(task.id)) {
          return { ...task, ...operation.updates };
        }
        return task;
      });
    });
    
    try {
      // API call to perform the batch operation
      const response = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(operation),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to perform batch operation. Status: ${response.status}`);
      }
      
      // Clear selection after successful batch operation
      setSelectedTaskIds([]);
      
    } catch (err: any) {
      console.error("Failed to perform batch operation:", err);
      setError(err.message || "Failed to perform batch operation.");
      
      // Rollback to original tasks on error
      setTasks(originalTasks);
    }
  }, [tasks]);

  // Handler for adding or removing tasks from selection
  const handleTaskSelection = useCallback((taskId: string, selected: boolean) => {
    setSelectedTaskIds(prevSelected => {
      if (selected) {
        return [...prevSelected, taskId];
      } else {
        return prevSelected.filter(id => id !== taskId);
      }
    });
  }, []);

  // Helper to get group name from its ID
  const getGroupName = useCallback((groupId: string | null) => {
    if (!groupId) return 'No Group';
    const group = groups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown Group';
  }, [groups]);

  // Handler for creating a new group
  const handleCreateGroup = useCallback(async (name: string, description: string = '') => {
    setError(null);
    
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create group. Status: ${response.status}`);
      }
      
      const newGroup = await response.json();
      
      // Update the local state with the new group
      setGroups(prevGroups => [...prevGroups, newGroup]);
      
      return newGroup;
    } catch (err: any) {
      console.error("Failed to create group:", err);
      setError(err.message || "Failed to create group.");
      throw err;
    }
  }, []);

  // Handler for deleting a group
  const handleDeleteGroup = useCallback(async (groupId: string) => {
    setError(null);
    
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete group. Status: ${response.status}`);
      }
      
      // Update the local state to remove the deleted group
      setGroups(prevGroups => prevGroups.filter(g => g.id !== groupId));
      
      // Update any tasks that were in this group to have no group
      setTasks(prevTasks => {
        return prevTasks.map(task => {
          if (task.groupId === groupId) {
            return { ...task, groupId: null };
          }
          return task;
        });
      });
      
    } catch (err: any) {
      console.error("Failed to delete group:", err);
      setError(err.message || "Failed to delete group.");
      throw err;
    }
  }, []);

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4 my-4">
        <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading data</h3>
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-700/50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 shadow-sm rounded-lg">
      {/* Header with filter bar and add buttons */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center">
            <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-1 rounded mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </span>
            <div className="flex flex-col">
              <span>BGC IT Task Manager</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">v0.8.1</span>
            </div>
          </h1>

          <div className="mt-4 md:mt-0 space-x-2 flex">
            <div className="relative inline-block text-left group">
              <div
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded hover:from-indigo-600 hover:to-purple-700 shadow flex items-center cursor-pointer"
              >
                <span>Bulk Add</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <div className="hidden absolute right-0 z-10 mt-1 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:divide-gray-700 dark:ring-gray-700 group-hover:block">
                  <div className="p-1">
                    <button
                      onClick={() => setShowBulkAddForm(true)}
                      className="flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                      </svg>
                      Text Analysis
                    </button>
                    <button
                      onClick={() => setShowBulkAddPDFForm(true)}
                      className="flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      Document Analysis
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded hover:from-blue-600 hover:to-indigo-700 shadow flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Task
            </button>
          </div>
        </div>

        {/* Filter bar component */}
        <TaskFilterBar
          tasks={tasks}
          technicians={technicians}
          groups={groups}
          onFilterChange={handleFilterChange}
          viewMode={viewMode}
          setViewMode={setViewMode}
          viewDensity={viewDensity}
          setViewDensity={setViewDensity}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          hasSelection={selectedTaskIds.length > 0}
          onClearSelection={() => setSelectedTaskIds([])}
        />
        
        {/* Batch operations toolbar when tasks are selected */}
        {selectedTaskIds.length > 0 && (
          <BatchOperationsToolbar
            selectedCount={selectedTaskIds.length}
            onClearSelection={() => setSelectedTaskIds([])}
            onBatchOperation={handleBatchOperation}
            selectedIds={selectedTaskIds}
            technicians={technicians}
            groups={groups}
            onDeleteTasks={async (taskIds) => {
              try {
                // Store IDs for UI updates
                const deletingIds = [...taskIds];
                
                // First update UI immediately to remove the deleted tasks
                setTasks(prevTasks => prevTasks.filter(task => !deletingIds.includes(task.id)));
                setSelectedTaskIds([]); // Clear selection
                
                // Then delete each task in the backend
                const promises = taskIds.map(id => handleDeleteTask(id, false)); // Don't update UI again
                await Promise.all(promises);
              } catch (error) {
                console.error('Failed to delete multiple tasks:', error);
                // Re-fetch data in case of errors
                fetchData();
              }
            }}
          />
        )}
        
        {/* Success message */}
        {successMessage && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-md border border-green-200 dark:border-green-800/50">
            {successMessage}
          </div>
        )}
      </div>

      {/* Task list content based on view mode */}
      <div className="p-4">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-md">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-gray-100">No tasks found</h3>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {activeFilters ? 'Try changing your filters.' : 'Get started by adding a new task.'}
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Task
              </button>
            </div>
          </div>
        ) : viewMode === 'timeline' ? (
          <TimelineView 
            tasks={filteredTasks} 
            technicians={technicians}
            groups={groups}
            categories={categories}
            onUpdateTask={handleUpdateTask}
            viewDensity={viewDensity}
          />
        ) : viewMode === 'kanban' && groupBy !== 'none' ? (
          <TaskGroupView
            tasks={filteredTasks}
            technicians={technicians}
            groups={groups}
            categories={categories}
            groupBy={groupBy}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            viewDensity={viewDensity}
            selectedTaskIds={selectedTaskIds}
            onTaskSelection={handleTaskSelection}
            getGroupName={getGroupName}
          />
        ) : viewMode === 'compact' ? (
          <CompactView
            tasks={filteredTasks}
            technicians={technicians}
            groups={groups}
            categories={categories}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            viewDensity={viewDensity}
            selectedTaskIds={selectedTaskIds}
            onTaskSelection={handleTaskSelection}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-4">
              {filteredTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  technicians={technicians}
                  categories={categories}
                  onUpdateTask={handleUpdateTask}
                  onDeleteTask={handleDeleteTask}
                  viewDensity={viewDensity}
                  isSelected={selectedTaskIds.includes(task.id)}
                  onSelect={selected => handleTaskSelection(task.id, selected)}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {/* Modal for adding a new task */}
      {showAddForm && (
        <Modal onClose={() => setShowAddForm(false)} title="Add New Task">
          <AddTaskForm
            technicians={technicians}
            groups={groups}
            categories={categories}
            currentOrderCount={tasks.length}
            onAddTask={handleAddTask}
            onCancel={() => setShowAddForm(false)}
            onCreateGroup={handleCreateGroup}
          />
        </Modal>
      )}

      {/* Modal for bulk adding tasks */}
      {showBulkAddForm && (
        <Modal onClose={() => setShowBulkAddForm(false)} title="Bulk Add Tasks with AI" size="2xl">
          <BulkAddTaskAI
            technicians={technicians}
            groups={groups}
            categories={categories}
            currentOrderCount={tasks.length}
            onAddTasks={handleBulkAddTasks}
            onCancel={() => setShowBulkAddForm(false)}
            onCreateGroup={handleCreateGroup}
          />
        </Modal>
      )}

      {/* Modal for bulk adding tasks from PDF */}
      {showBulkAddPDFForm && (
        <Modal 
          onClose={() => setShowBulkAddPDFForm(false)} 
          title="Extract Tasks from Documents" 
          size="lg"
          preventOutsideClose={true} 
        >
          <BulkAddTaskFromPDF
            technicians={technicians}
            groups={groups}
            categories={categories}
            currentOrderCount={tasks.length}
            onAddTasks={handleBulkAddTasks}
            onCancel={() => setShowBulkAddPDFForm(false)}
            onCreateGroup={handleCreateGroup}
          />
        </Modal>
      )}
    </div>
  );
} 
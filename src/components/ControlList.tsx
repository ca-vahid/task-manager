"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Control, Technician, ControlStatus, ViewMode, BatchOperation, ViewDensity, PriorityLevel, Company } from '@/lib/types'; // Assuming alias
import { ControlCard } from './ControlCard'; 
import { Timestamp } from 'firebase/firestore'; // Correct import path for Timestamp
import { ControlFilterBar } from './ControlFilterBar';
import { ControlGroupView } from './ControlGroupView';
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
import { AddControlForm } from './AddControlForm'; // Import the new form component
import { TimelineView } from './TimelineView';
import { CollapsibleGroup } from './CollapsibleGroup';
import { BatchOperationsToolbar } from './BatchOperationsToolbar';
import { Modal } from './Modal'; // Import the Modal component
import { BulkAddControlForm } from './BulkAddControlForm'; // Import the new bulk add form component
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useUndo, UndoableActionType } from '@/lib/contexts/UndoContext';

export function ControlList() {
  const [controls, setControls] = useState<Control[]>([]);
  const [filteredControls, setFilteredControls] = useState<Control[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false); // State to toggle form visibility
  const [showBulkAddForm, setShowBulkAddForm] = useState(false); // State to toggle bulk add form
  const [groupBy, setGroupBy] = useState<'status' | 'assignee' | 'none'>('status');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('medium');
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<boolean>(false); // Track if filters are active
  const { showUndoToast, addUndoableAction } = useUndo();

  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ref to track drag operations and prevent duplicate undo toasts
  const isDraggingRef = useRef(false);
  const lastDragOperationTimeRef = useRef(0);

  // Create a timeout ref to track and clean up timeouts
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data (controls and technicians)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First fetch one control directly from Firestore for debugging
      try {
        // Get the first control document to inspect raw data
        const controlsRef = collection(db, 'controls');
        const controlsSnapshot = await getDocs(controlsRef);
        if (!controlsSnapshot.empty) {
          const firstDoc = controlsSnapshot.docs[0];
          const rawData = firstDoc.data();
          console.log("Raw control from Firestore:", firstDoc.id, rawData);
          console.log("Raw company field:", rawData.company, typeof rawData.company);
        }
      } catch (debugError) {
        console.error("Debug fetch error:", debugError);
        // Continue with normal fetch
      }
      
      // Fetch controls and technicians in parallel using the API
      const [controlsResponse, techniciansResponse] = await Promise.all([
        fetch('/api/controls'), 
        fetch('/api/technicians')
      ]);

      if (!controlsResponse.ok) {
        throw new Error(`Failed to fetch controls: ${controlsResponse.statusText}`);
      }

      if (!techniciansResponse.ok) {
        throw new Error(`Failed to fetch technicians: ${techniciansResponse.statusText}`);
      }

      // Get data from API responses
      const controlsApiData = await controlsResponse.json();
      const techniciansData: Technician[] = await techniciansResponse.json();
      
      // Debug API response data
      console.log("API controls data - first item:", controlsApiData[0]);
      console.log("API company field:", controlsApiData[0]?.company, typeof controlsApiData[0]?.company);
      
      // Ensure company field is properly set
      const processedControls = controlsApiData.map((control: any) => {
        // Ensure the control has a company field
        if (!control.company) {
          console.warn(`Control ${control.id} is missing company field, setting default`);
          control.company = Company.Both; // Set default
        }
        return control;
      });
      
      setControls(processedControls);
      setTechnicians(techniciansData);

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

  // Set filtered controls whenever controls change
  const handleFilterChange = useCallback((filtered: Control[]) => {
    setFilteredControls(filtered);
    // If the filtered list length is different from the full list, filters are active
    setActiveFilters(filtered.length !== controls.length);
  }, [controls]);
  
  // Apply current filters to updated controls
  const reapplyFilters = useCallback(() => {
    // This function will be called after any operation that modifies the controls
    if (activeFilters) {
      // Signal to the ControlFilterBar that we need to reapply filters
      // We'll do this by sending a custom event
      const reapplyEvent = new CustomEvent('reapplyFilters');
      window.dispatchEvent(reapplyEvent);
    } else {
      // If no filters are active, just show all controls
      setFilteredControls(controls);
    }
  }, [activeFilters, controls]);

  // Listen for controls changes and reapply filters if needed
  useEffect(() => {
    reapplyFilters();
  }, [controls, reapplyFilters]);

  // Handler for updating a control
  const handleUpdateControl = useCallback(async (id: string, updates: Partial<Omit<Control, 'id'>>) => {
    setError(null);
    // --- Optimistic Update --- 
    const originalControls = [...controls];
    const controlIndex = originalControls.findIndex(c => c.id === id);
    if (controlIndex === -1) return; 
    
    // Store the original control for undo
    const originalControl = {...originalControls[controlIndex]};
    
    // Identify what fields are being updated to show appropriate message
    const updateType = Object.keys(updates)[0] as keyof typeof updates;
    let undoActionType: UndoableActionType = 'UPDATE_CONTROL_TITLE';
    let updateDescription = '';
    
    // Determine the type of update and create an appropriate message
    if (updateType === 'title') {
      undoActionType = 'UPDATE_CONTROL_TITLE';
      updateDescription = `Title changed to "${updates.title}"`;
    } else if (updateType === 'estimatedCompletionDate') {
      undoActionType = 'UPDATE_CONTROL_DATE';
      if (updates.estimatedCompletionDate === null) {
        updateDescription = 'Due date removed';
      } else {
        updateDescription = 'Due date updated';
      }
    } else if (updateType === 'status') {
      undoActionType = 'UPDATE_CONTROL_STATUS';
      updateDescription = `Status changed to ${updates.status}`;
    } else if (updateType === 'assigneeId') {
      undoActionType = 'UPDATE_CONTROL_ASSIGNEE';
      const newAssigneeName = updates.assigneeId 
        ? technicians.find(t => t.id === updates.assigneeId)?.name || 'Unknown'
        : 'Unassigned';
      updateDescription = `Assigned to ${newAssigneeName}`;
    } else {
      updateDescription = 'Control updated';
    }
    
    const updatedLocalControl = { 
        ...originalControls[controlIndex], 
        ...updates 
    };
    
    const newControls = [...originalControls];
    newControls[controlIndex] = updatedLocalControl;
    setControls(newControls);
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
          setControls(originalControls);
          throw new Error("Invalid date format. Please use YYYY-MM-DD format.");
        }
      }
    }

    try {
      // Record this action for potential undo
      addUndoableAction({
        type: undoActionType,
        data: {
          controlId: id,
          originalValues: {
            [updateType]: originalControl[updateType]
          },
          newValues: updates
        }
      });
      
      // Use POST to /api/controls/update instead of PUT to /api/controls/[id]
      const response = await fetch('/api/controls/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiUpdateData),
      });

      if (!response.ok) {
        // Read the response body as text first
        const responseBodyText = await response.text();
        let errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
        
        try {
          // Attempt to parse the text as JSON
          const errorData = JSON.parse(responseBodyText);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          // If parsing failed, it wasn't JSON. Log the raw text
          console.error("Error response was not valid JSON:", responseBodyText);
          errorMessage = `Failed to update control. Server responded unexpectedly (status: ${response.status})`;
        }
        
        setControls(originalControls);
        throw new Error(errorMessage);
      }
      
      // Optional: update the control with the response data
      const updatedControl = await response.json();
      
      // Show undo toast
      showUndoToast(
        updateDescription,
        async () => {
          try {
            // Revert the property to its original value
            const revertUpdate = {
              [updateType]: originalControl[updateType]
            };
            
            // Prepare API data for the undo operation
            let undoApiUpdateData: any = { ...revertUpdate, id };
            
            // Fix date handling for undo
            if (updateType === 'estimatedCompletionDate') {
              const dateValue = originalControl.estimatedCompletionDate;
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
            const response = await fetch('/api/controls/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(undoApiUpdateData),
            });
            
            if (!response.ok) {
              throw new Error(`Failed to undo update. Status: ${response.status}`);
            }
            
            // Update the local state with the original value
            setControls(prevControls => {
              const newControls = [...prevControls];
              const controlIndex = newControls.findIndex(c => c.id === id);
              
              if (controlIndex !== -1) {
                newControls[controlIndex] = {
                  ...newControls[controlIndex],
                  [updateType]: originalControl[updateType]
                };
              }
              
              return newControls;
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
      console.error(`Failed to update control ${id}:`, err);
      setError(err.message || "Failed to update control.");
      setControls(originalControls); 
      throw err; 
    }
  }, [controls, technicians, addUndoableAction, showUndoToast]);

  // Handler for deleting a control
  const handleDeleteControl = useCallback(async (id: string) => {
    setError(null);
    const originalControls = [...controls];
    const deletedControl = controls.find(c => c.id === id);
    
    if (!deletedControl) {
      throw new Error("Control not found");
    }
    
    // Track the control's position for restoration
    const controlIndex = controls.findIndex(c => c.id === id);
    
    // Optimistically update UI
    setControls(originalControls.filter(c => c.id !== id));
    
    try {
      // Add to undoable actions
      addUndoableAction({
        type: 'DELETE_CONTROL',
        data: {
          control: deletedControl,
          position: controlIndex
        },
        externalAction: !!deletedControl.ticketNumber
      });
      
      // Make the API call to delete
      const response = await fetch(`/api/controls/delete`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }) // Pass the ID in the request body
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
        const responseBodyText = await response.text(); // Read response body once
        try {
          const errorData = JSON.parse(responseBodyText); // Try parsing as JSON
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          console.error("Control delete error response was not valid JSON:", responseBodyText);
          errorMessage = `Failed to delete control. Server responded unexpectedly (status: ${response.status})`;
        }
        setControls(originalControls); // Rollback optimistic update
        throw new Error(errorMessage); // Throw refined error
      }
      
      // Show undo toast
      showUndoToast(
        `Control "${deletedControl.title}" deleted`,
        async () => {
          try {
            // Show loading state if needed
            
            // Re-create the control through the API
            const response = await fetch('/api/controls', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...deletedControl,
                // Handle Timestamp/Date conversion for the API
                estimatedCompletionDate: deletedControl.estimatedCompletionDate
                  ? (deletedControl.estimatedCompletionDate instanceof Timestamp 
                    ? deletedControl.estimatedCompletionDate.toDate().toISOString()
                    : new Date(deletedControl.estimatedCompletionDate).toISOString())
                  : null,
              }),
            });
            
            if (!response.ok) {
              throw new Error(`Failed to restore control. Status: ${response.status}`);
            }
            
            // Get the new control data
            const restoredControl = await response.json();
            
            // Make sure dates are in the correct format
            let finalDate = null;
            if (restoredControl.estimatedCompletionDate) {
              if (typeof restoredControl.estimatedCompletionDate === 'string') {
                finalDate = Timestamp.fromDate(new Date(restoredControl.estimatedCompletionDate));
              } else if ((restoredControl.estimatedCompletionDate as any).seconds) {
                finalDate = restoredControl.estimatedCompletionDate; // Assume it's already a Timestamp
              }
            }
            
            // Add the control back to the state at the correct position
            setControls(prevControls => {
              const newControls = [...prevControls];
              const controlWithProperDate = {
                ...restoredControl,
                estimatedCompletionDate: finalDate
              };
              
              // Insert at the original position, or at the end if position is invalid
              if (controlIndex >= 0 && controlIndex <= newControls.length) {
                newControls.splice(controlIndex, 0, controlWithProperDate);
              } else {
                newControls.push(controlWithProperDate);
              }
              
              return newControls;
            });
            
            return Promise.resolve();
          } catch (error) {
            console.error("Failed to undo delete:", error);
            return Promise.reject(error);
          }
        }
      );
    } catch (err: any) {
      console.error(`Failed to delete control ${id}:`, err);
      setError(err.message || "Failed to delete control.");
      // Ensure rollback if error happens outside fetch logic or state changes unexpectedly
      if (JSON.stringify(controls.map(c=>c.id)) !== JSON.stringify(originalControls.filter(c => c.id !== id).map(c=>c.id))) {
        setControls(originalControls);
      }
      // Re-throw the error so ControlCard can potentially handle it too
      throw err; 
    }
  }, [controls, addUndoableAction, showUndoToast]);

  // Handler for adding a new control (called by AddControlForm)
  const handleAddControl = useCallback(async (newControlData: Omit<Control, 'id'>) => {
      setError(null);
      
      // --- Optimistic Update --- 
      // Create a temporary ID for the optimistic update (Firestore will assign the real one)
      const tempId = `temp-${Date.now()}`;
      
      // Create a safe copy of the estimatedCompletionDate for optimistic update
      let safeEstimatedCompletionDate = null;
      if (newControlData.estimatedCompletionDate) {
        try {
          if (newControlData.estimatedCompletionDate instanceof Timestamp) {
            // Check if the Timestamp is valid
            const testDate = newControlData.estimatedCompletionDate.toDate();
            if (!isNaN(testDate.getTime())) {
              safeEstimatedCompletionDate = newControlData.estimatedCompletionDate;
            }
          }
        } catch (error) {
          console.error("Invalid timestamp for optimistic update:", error);
          // Keep as null
        }
      }
      
      const optimisticControl: Control = {
          ...newControlData,
          id: tempId,
          // Use the validated date or null
          estimatedCompletionDate: safeEstimatedCompletionDate,
          // Ensure externalUrl is included optimistically
          externalUrl: newControlData.externalUrl
      };
      
      // Add to the end of the list
      setControls(prevControls => [...prevControls, optimisticControl]);
      setShowAddForm(false); // Hide modal immediately
      // --- End Optimistic Update ---
      
      try {
          const response = await fetch('/api/controls', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // Convert Timestamp to string/null for API
              body: JSON.stringify({
                  ...newControlData,
                  estimatedCompletionDate: newControlData.estimatedCompletionDate
                      ? (newControlData.estimatedCompletionDate as Timestamp).toDate().toISOString()
                      : null,
              }),
          });

          if (!response.ok) {
              const errorData = await response.json();
              // Rollback: Remove the optimistically added control
              setControls(prevControls => prevControls.filter(c => c.id !== tempId)); 
              setShowAddForm(true); // Re-show modal on error
              throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          }

          const savedControl: Control = await response.json();

          // If the backend returns a Timestamp object, convert it to a JS Date
          // If it returns an ISO string, convert it to JS Date
          let finalDate = null;
          if (savedControl.estimatedCompletionDate) {
            if (typeof savedControl.estimatedCompletionDate === 'string') {
              finalDate = Timestamp.fromDate(new Date(savedControl.estimatedCompletionDate));
            } else if ((savedControl.estimatedCompletionDate as any).seconds) {
              finalDate = savedControl.estimatedCompletionDate; // Assume it's already a Timestamp
            }
          }

          // Replace the optimistic item with the saved one
          setControls(prevControls => 
              prevControls.map(c => {
                  if (c.id === tempId) {
                      return {
                          ...savedControl,
                          estimatedCompletionDate: finalDate,
                          // Make sure externalUrl from response is included
                          externalUrl: savedControl.externalUrl
                      };
                  }
                  return c;
              })
          );
          
          // Form already hidden optimistically
          // setShowAddForm(false); 

      } catch (err: any) {
          console.error("Failed to add control:", err);
          setError(err.message || "Failed to add control.");
          // Ensure rollback if error occurs after optimistic add
          setControls(prevControls => prevControls.filter(c => c.id !== tempId));
          setShowAddForm(true); // Re-show modal on error
          // Re-throw so AddControlForm can also catch it and display inline error
          throw err; 
      }
  }, [controls]); // Add controls to dependency array

  // Function to update order in Firestore
  const updateOrderInFirestore = useCallback(async (orderedControls: Control[]) => {
    console.log("Updating order in Firestore...");
    setError(null); // Clear previous errors

    // Prepare updates: only send ID and new order
    const updates = orderedControls.map((control, index) => ({
        id: control.id,
        order: index, // Use the index as the new order
    }));

    // --- Option 1: Promise.all (simpler, less efficient for many items) --- 
    /*
    try {
        await Promise.all(
            updates.map(update => handleUpdateControl(update.id, { order: update.order }))
        );
        console.log("Firestore order updated successfully via Promise.all.");
    } catch (error) {
        console.error("Failed to update Firestore order:", error);
        setError("Failed to save new order. Please refetch or try again.");
        // Refetch data to ensure consistency after partial failure
        fetchData(); 
    }
    */

    // --- Option 2: Dedicated API Route for Batch Updates ---
    try {
        const response = await fetch('/api/controls/batch-update', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.message || `HTTP error! status: ${response.status}`;
            throw new Error(errorMessage);
        }
        
        // Success - local state is already updated
        console.log("Firestore order updated successfully via batch update.");
    } catch (error: any) {
        console.error("Failed to update Firestore order:", error);
        setError(error.message || "Failed to save new order. Please try again.");
        // Optionally refetch to ensure consistency 
        fetchData();
    }
  }, [fetchData, handleUpdateControl, setError]);

  // Drag End Handler
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Save original controls array for potential undo
      const originalControls = [...controls];
      
      // Find the indices
      const oldIndex = controls.findIndex((item) => item.id === active.id);
      const newIndex = controls.findIndex((item) => item.id === over.id);
      
      // Ensure indices are found before proceeding
      if (oldIndex === -1 || newIndex === -1) {
        return; // Return early if invalid indices
      }
      
      // Create the new array with moved items
      const newItems = arrayMove([...controls], oldIndex, newIndex);
      
      // Assign new order based on the new array index
      const itemsWithUpdatedOrder = newItems.map((item, index) => ({ 
        ...item, 
        order: index 
      }));
      
      // Update state with the new order
      setControls(itemsWithUpdatedOrder);
      
      // Record this as an undoable action
      addUndoableAction({
        type: 'REORDER_CONTROLS',
        data: {
          originalControls,
          newControls: itemsWithUpdatedOrder
        }
      });
      
      // Get the moved item's name for the toast message
      const movedItemName = controls.find(item => item.id === active.id)?.title || "Control";
      
      // Show undo toast
      showUndoToast(
        `Moved "${movedItemName}" ${oldIndex < newIndex ? 'down' : 'up'}`,
        async () => {
          try {
            // Update the UI immediately
            setControls(originalControls);
            
            // Update the database with original orders
            await updateOrderInFirestore(originalControls);
            
            return Promise.resolve();
          } catch (error) {
            console.error("Failed to undo reordering:", error);
            return Promise.reject(error);
          }
        },
        7000 // 7 seconds to undo
      );

      // Trigger background update to Firestore
      updateOrderInFirestore(itemsWithUpdatedOrder);
    }
  }, [controls, addUndoableAction, showUndoToast, updateOrderInFirestore]);

  // Clean up any pending timeouts on unmount
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  // New function to handle batch operations
  const handleBatchUpdate = async (controlIds: string[], updates: Partial<Omit<Control, 'id'>>) => {
    try {
      // Process each control in the batch
      await Promise.all(
        controlIds.map(id => handleUpdateControl(id, updates))
      );
      
      // Clear selection after successful batch update
      setSelectedControlIds([]);
      
      // Show success toast or message if needed
    } catch (error) {
      console.error("Failed to perform batch update:", error);
      setError("Failed to perform batch update. Please try again.");
    }
  };

  // New function to handle adding multiple controls at once
  const handleAddControls = useCallback(async (newControlsData: Omit<Control, 'id'>[]) => {
    setError(null);
    
    try {
      // Generate temporary IDs for all new controls for optimistic updates
      const tempControls: Control[] = newControlsData.map((controlData, index) => {
        const tempId = `temp-bulk-${Date.now()}-${index}`;
        
        // Create a safe copy of the estimatedCompletionDate for optimistic update
        let safeEstimatedCompletionDate = null;
        if (controlData.estimatedCompletionDate) {
          try {
            if (controlData.estimatedCompletionDate instanceof Timestamp) {
              const testDate = controlData.estimatedCompletionDate.toDate();
              if (!isNaN(testDate.getTime())) {
                safeEstimatedCompletionDate = controlData.estimatedCompletionDate;
              }
            }
          } catch (error) {
            console.error("Invalid timestamp for optimistic update:", error);
          }
        }
        
        return {
          ...controlData,
          id: tempId,
          estimatedCompletionDate: safeEstimatedCompletionDate,
          externalUrl: controlData.externalUrl
        };
      });
      
      // Optimistically add all controls to the state at once
      setControls(prevControls => [...prevControls, ...tempControls]);
      
      // Close the form immediately after optimistic update
      setShowBulkAddForm(false);
      
      // Create an array to track the API responses
      const apiResults: Control[] = [];
      
      // Process each control sequentially to avoid race conditions
      for (let i = 0; i < newControlsData.length; i++) {
        const controlData = newControlsData[i];
        const tempId = tempControls[i].id;
        
        try {
          // Send the control to the API
          const response = await fetch('/api/controls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...controlData,
              estimatedCompletionDate: controlData.estimatedCompletionDate
                ? (controlData.estimatedCompletionDate as Timestamp).toDate().toISOString()
                : null,
            }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          }
          
          const savedControl: Control = await response.json();
          
          // Process the saved control (handle date conversion, etc.)
          let finalDate = null;
          if (savedControl.estimatedCompletionDate) {
            if (typeof savedControl.estimatedCompletionDate === 'string') {
              finalDate = Timestamp.fromDate(new Date(savedControl.estimatedCompletionDate));
            } else if ((savedControl.estimatedCompletionDate as any).seconds) {
              finalDate = savedControl.estimatedCompletionDate;
            }
          }
          
          // Add to results array
          apiResults.push({
            ...savedControl,
            estimatedCompletionDate: finalDate,
            externalUrl: savedControl.externalUrl
          });
          
        } catch (error) {
          console.error(`Error adding control ${i + 1}:`, error);
          // If one fails, continue with the others
        }
      }
      
      // After all API calls are done, update the state one final time
      // replacing all temporary controls with their final versions
      setControls(prevControls => {
        // Filter out all temp controls
        const filteredControls = prevControls.filter(
          control => !tempControls.some(temp => temp.id === control.id)
        );
        // Add all successfully saved controls
        return [...filteredControls, ...apiResults];
      });
      
    } catch (err: any) {
      console.error("Failed to add multiple controls:", err);
      setError(err.message || "Failed to add controls.");
      // Don't reopen the form - user can try again if needed
    }
  }, []);

  // Render logic
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading controls...</div>
      </div>
    );
  }

  if (error && !showAddForm) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/50 text-red-800 dark:text-red-300 rounded-lg p-4 mt-4">
        <h3 className="text-lg font-medium">Error</h3>
        <p>{error}</p>
        <button 
          onClick={() => fetchData()} 
          className="mt-2 px-4 py-2 bg-red-100 dark:bg-red-800/50 hover:bg-red-200 dark:hover:bg-red-700/50 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Top Actions Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
        <div>
          <h2 className="text-l font-bold text-gray-800 dark:text-gray-100">Compliance Controls</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {filteredControls.length} of {controls.length} controls displayed
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          {/* View Mode Selector */}
          <div className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 shadow-sm">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'kanban' 
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-r border-gray-300 dark:border-gray-600' 
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border-r border-gray-300 dark:border-gray-600'
              }`}
              title="Kanban board view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Kanban
            </button>
            
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'timeline' 
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' 
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
              title="Timeline view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Timeline
            </button>
          </div>
          
          {/* View Density Selector */}
          <div className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 shadow-sm">
            <button
              onClick={() => setViewDensity('compact')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors border-r border-gray-300 dark:border-gray-600 ${
                viewDensity === 'compact' 
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' 
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
              title="Compact view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Compact
            </button>
            
            <button
              onClick={() => setViewDensity('medium')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors border-r border-gray-300 dark:border-gray-600 ${
                viewDensity === 'medium' 
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' 
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
              title="Medium view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
              Medium
            </button>
            
            <button
              onClick={() => setViewDensity('full')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors ${
                viewDensity === 'full' 
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' 
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
              title="Full view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18" />
              </svg>
              Full
            </button>
          </div>
          
          {/* Group By Selection - Only show in Kanban view */}
          {viewMode === 'kanban' && (
            <div className="flex items-center gap-2">
              <label htmlFor="groupBy" className="text-sm text-gray-600 dark:text-gray-400">Group by:</label>
              <select
                id="groupBy"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'status' | 'assignee' | 'none')}
                className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 dark:text-gray-300"
              >
                <option value="status">Status</option>
                <option value="assignee">Assignee</option>
                <option value="none">No Grouping</option>
              </select>
            </div>
          )}
          
          {/* Add Control Buttons - Updated */}
          <div className="flex gap-2">
            <button 
              onClick={() => setShowAddForm(true)}
              className="rounded-md transition-colors bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 px-4 py-2 text-sm font-medium"
            >
              + Add Control
            </button>
            
            <button 
              onClick={() => setShowBulkAddForm(true)}
              className="rounded-md transition-colors bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-500 dark:hover:to-indigo-500 px-4 py-2 text-sm font-medium flex items-center"
            >
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3Z" fill="currentColor"/>
                <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="currentColor"/>
                <path fillRule="evenodd" d="M8 4h2v2H8V4zm6 0h2v2h-2V4z" fill="currentColor" className="animate-pulse"/>
              </svg>
              Bulk Add with AI
            </button>
          </div>
        </div>
      </div>
      
      {/* Add Control Form inside Modal */}
      <Modal 
        isOpen={showAddForm} 
        onClose={() => {
          setShowAddForm(false);
          setError(null); // Clear errors when closing modal
        }}
        title="Add New Control"
        onAiExtract={() => {
          // Find the AddControlForm component and call its AI extraction function
          const formElement = document.querySelector('form');
          if (formElement) {
            // Dispatch a custom event that the form will listen for
            const aiExtractEvent = new CustomEvent('aiextract');
            formElement.dispatchEvent(aiExtractEvent);
          }
        }}
      >
        <AddControlForm 
          technicians={technicians}
          currentOrderCount={controls.length}
          onAddControl={handleAddControl}
          onCancel={() => { 
            setShowAddForm(false); 
            setError(null); // Clear errors on cancel
          }}
        />
      </Modal>
      
      {/* Bulk Add Control Form inside Modal - New */}
      <Modal 
        isOpen={showBulkAddForm} 
        onClose={() => {
          setShowBulkAddForm(false);
          setError(null); // Clear errors when closing modal
        }}
        title="Bulk Add Controls with AI"
        size="large"
      >
        <BulkAddControlForm 
          technicians={technicians}
          currentOrderCount={controls.length}
          onAddControls={handleAddControls}
          onCancel={() => { 
            setShowBulkAddForm(false); 
            setError(null); // Clear errors on cancel
          }}
        />
      </Modal>
      
      {/* Batch Operations Toolbar */}
      <BatchOperationsToolbar
        selectedControlIds={selectedControlIds}
        onClearSelection={() => setSelectedControlIds([])}
        technicians={technicians}
        onUpdateControls={handleBatchUpdate}
      />
      
      {/* Enhanced Filter Bar */}
      <ControlFilterBar 
        technicians={technicians}
        onFilterChange={handleFilterChange}
        controls={controls}
        onBatchSelectionChange={setSelectedControlIds}
      />
      
      {/* Controls Display - Conditional Rendering Based on View Mode */}
      {filteredControls.length > 0 ? (
        <>
          {viewMode === 'kanban' && (
            <ControlGroupView
              controls={filteredControls}
              technicians={technicians}
              groupBy={groupBy}
              viewDensity={viewDensity}
              onUpdateControl={handleUpdateControl}
              onDeleteControl={handleDeleteControl}
              onDragEnd={handleDragEnd}
              columnsPerPage={3}
            />
          )}
          
          {viewMode === 'timeline' && (
            <TimelineView
              controls={filteredControls}
              technicians={technicians}
              viewDensity={viewDensity}
              onUpdateControl={handleUpdateControl}
              onDeleteControl={handleDeleteControl}
            />
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 border border-gray-200">
          {controls.length > 0 
            ? 'No controls match your filter criteria' 
            : 'No controls found. Add one to get started.'}
        </div>
      )}
    </div>
  );
} 
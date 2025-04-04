"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Control, Technician, ControlStatus, ViewMode, BatchOperation, ViewDensity } from '@/lib/types'; // Assuming alias
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

export function ControlList() {
  const [controls, setControls] = useState<Control[]>([]);
  const [filteredControls, setFilteredControls] = useState<Control[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false); // State to toggle form visibility
  const [groupBy, setGroupBy] = useState<'status' | 'assignee' | 'none'>('status');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('medium');
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);

  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch initial data (controls and technicians)
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch controls and technicians in parallel
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

      const controlsData: any[] = await controlsResponse.json();
      const techniciansData: Technician[] = await techniciansResponse.json();

      // Ensure controls are properly typed with validated dates
      const typedControls = controlsData.map((c: any): Control => {
        let validatedTimestamp = null;
        
        // Validate the estimatedCompletionDate
        if (c.estimatedCompletionDate) {
          try {
            if (typeof c.estimatedCompletionDate === 'string') {
              // Convert ISO string to Date, then to Timestamp
              const date = new Date(c.estimatedCompletionDate);
              if (!isNaN(date.getTime())) {
                validatedTimestamp = Timestamp.fromDate(date);
              } else {
                console.warn(`Invalid date string in control ${c.id}:`, c.estimatedCompletionDate);
              }
            } else if (c.estimatedCompletionDate && c.estimatedCompletionDate.seconds !== undefined) {
              // It's a Timestamp-like object
              const { seconds, nanoseconds } = c.estimatedCompletionDate;
              if (typeof seconds === 'number' && !isNaN(seconds) && 
                  typeof nanoseconds === 'number' && !isNaN(nanoseconds)) {
                validatedTimestamp = new Timestamp(seconds, nanoseconds);
                
                // Verify it creates a valid date
                try {
                  const date = validatedTimestamp.toDate();
                  if (isNaN(date.getTime())) {
                    console.warn(`Invalid date from timestamp in control ${c.id}:`, validatedTimestamp);
                    validatedTimestamp = null;
                  }
                } catch (error) {
                  console.error(`Error converting timestamp to date in control ${c.id}:`, error);
                  validatedTimestamp = null;
                }
              } else {
                console.warn(`Invalid timestamp values in control ${c.id}:`, c.estimatedCompletionDate);
              }
            }
          } catch (error) {
            console.error(`Error processing estimatedCompletionDate in control ${c.id}:`, error);
          }
        }
        
        return { 
          ...c, 
          // Use validated timestamp or null
          estimatedCompletionDate: validatedTimestamp
        };
      });

      setControls(typedControls);
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
  useEffect(() => {
    setFilteredControls(controls);
  }, [controls]);
  
  // Handler for filter changes
  const handleFilterChange = useCallback((filtered: Control[]) => {
    setFilteredControls(filtered);
  }, []);

  // Handler for updating a control
  const handleUpdateControl = useCallback(async (id: string, updates: Partial<Omit<Control, 'id'>>) => {
    setError(null);
    // --- Optimistic Update --- 
    const originalControls = [...controls];
    const controlIndex = originalControls.findIndex(c => c.id === id);
    if (controlIndex === -1) return; 
    
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
      console.log("Control updated successfully:", updatedControl);
      
    } catch (err: any) {
      console.error(`Failed to update control ${id}:`, err);
      setError(err.message || "Failed to update control.");
      setControls(originalControls); 
      throw err; 
    }
  }, [controls]); 

  // Handler for deleting a control
  const handleDeleteControl = useCallback(async (id: string) => {
    setError(null);
    const originalControls = [...controls];
    setControls(originalControls.filter(c => c.id !== id)); // Optimistic update
    
    try {
        // Use POST to /api/controls/delete instead of DELETE to /api/controls/[id]
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
        // Success: Control deleted, UI already updated.
        // Consider updating order of subsequent items if necessary

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
}, [controls]); // Dependency array includes controls for optimistic updates

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
      };
      
      // Add to the end of the list
      setControls(prevControls => [...prevControls, optimisticControl]);
      setShowAddForm(false); // Hide form immediately
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
              setShowAddForm(true); // Re-show form on error maybe?
              throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          }

          const savedControl: Control = await response.json();
          
          // Update the temporary control with the real ID and potentially server data
          setControls(prevControls => 
              prevControls.map(c => {
                  if (c.id === tempId) {
                      // Create a cleaned up version of the saved control
                      const cleanedControl = { ...savedControl };
                      
                      // Safely convert the estimatedCompletionDate if it exists
                      let validTimestamp = null;
                      if (savedControl.estimatedCompletionDate) {
                          try {
                              // Check if it's already a valid Timestamp
                              if (savedControl.estimatedCompletionDate instanceof Timestamp) {
                                  // Verify it's valid
                                  const { seconds, nanoseconds } = savedControl.estimatedCompletionDate;
                                  if (!isNaN(seconds) && !isNaN(nanoseconds)) {
                                      validTimestamp = savedControl.estimatedCompletionDate;
                                  }
                              } 
                              // If it's a string (ISO date)
                              else if (typeof savedControl.estimatedCompletionDate === 'string') {
                                  const date = new Date(savedControl.estimatedCompletionDate);
                                  if (!isNaN(date.getTime())) {
                                      validTimestamp = Timestamp.fromDate(date);
                                  }
                              }
                              // If it's a Timestamp-like object
                              else if (savedControl.estimatedCompletionDate && 
                                      'seconds' in savedControl.estimatedCompletionDate &&
                                      'nanoseconds' in savedControl.estimatedCompletionDate) {
                                  const seconds = (savedControl.estimatedCompletionDate as any).seconds;
                                  const nanoseconds = (savedControl.estimatedCompletionDate as any).nanoseconds;
                                  if (typeof seconds === 'number' && !isNaN(seconds) &&
                                      typeof nanoseconds === 'number' && !isNaN(nanoseconds)) {
                                      validTimestamp = new Timestamp(seconds, nanoseconds);
                                  }
                              } 
                          } catch (error) {
                              console.error("Failed to convert timestamp from server response:", error);
                              // Keep it null
                          }
                      }
                      
                      return { 
                          ...c, // Keep optimistic data like explanation
                          ...cleanedControl, // Overwrite with server data (ID, potentially others)
                          // Use the validated timestamp or null
                          estimatedCompletionDate: validTimestamp,
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
          setShowAddForm(true); // Re-show form on error maybe?
          // Re-throw so AddControlForm can also catch it and display inline error
          throw err; 
      }
  }, [controls]); // Add controls to dependency array

  // Drag End Handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Pass explicit Control[] type to the items parameter
      setControls((items: Control[]) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        // Ensure indices are found before proceeding
        if (oldIndex === -1 || newIndex === -1) {
            console.error("Could not find dragged items in state.");
            return items; // Return original items if indices are invalid
        }
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Update local state first for responsiveness
        // Assign new order based on the new array index
        const itemsWithUpdatedOrder = newItems.map((item, index) => ({ 
            ...item, 
            order: index 
        }));

        // Trigger background update to Firestore
        updateOrderInFirestore(itemsWithUpdatedOrder);

        return itemsWithUpdatedOrder; // Return the re-ordered items with updated order property
      });
    }
  };

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

    // --- Option 2: Dedicated API Route for Batch Updates (Recommended) ---
    // This is generally better for atomicity and efficiency.
    // We'll need to create a new API route e.g., /api/controls/update-order
    try {
        const response = await fetch('/api/controls/update-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }), // Send array of {id, order}
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        console.log("Firestore order updated successfully via batch API.");
        // No need to refetch if API handles it well, local state is already updated.

    } catch (error: any) {
        console.error("Failed to update Firestore order via batch API:", error);
        setError(`Failed to save new order: ${error.message}. Data might be inconsistent.`);
        // Consider refetching data on error to ensure UI consistency
        fetchData(); 
    }

  }, [fetchData]); // Include fetchData in dependencies for potential refetch on error

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

  // Render logic
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-pulse text-gray-500">Loading controls...</div>
      </div>
    );
  }

  if (error && !showAddForm) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mt-4">
        <h3 className="text-lg font-medium">Error</h3>
        <p>{error}</p>
        <button 
          onClick={() => fetchData()} 
          className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
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
          <h2 className="text-2xl font-bold text-gray-800">Compliance Controls</h2>
          <p className="text-gray-500 text-sm mt-1">
            {filteredControls.length} of {controls.length} controls displayed
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          {/* View Mode Selector */}
          <div className="flex overflow-hidden rounded-md border border-gray-300 shadow-sm">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'kanban' 
                  ? 'bg-indigo-100 text-indigo-700 border-r border-gray-300' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-r border-gray-300'
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
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
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
          <div className="flex overflow-hidden rounded-md border border-gray-300 shadow-sm">
            <button
              onClick={() => setViewDensity('compact')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors border-r border-gray-300 ${
                viewDensity === 'compact' 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
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
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1 transition-colors border-r border-gray-300 ${
                viewDensity === 'medium' 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
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
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
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
              <label htmlFor="groupBy" className="text-sm text-gray-600">Group by:</label>
              <select
                id="groupBy"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'status' | 'assignee' | 'none')}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
              >
                <option value="status">Status</option>
                <option value="assignee">Assignee</option>
                <option value="none">No Grouping</option>
              </select>
            </div>
          )}
          
          {/* Add Control Button */}
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className={`rounded-md transition-colors ${
              showAddForm 
                ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            } px-4 py-2 text-sm font-medium ml-2`}
          >
            {showAddForm ? 'Cancel' : '+ Add Control'}
          </button>
        </div>
      </div>
      
      {/* Add Control Form */}
      {showAddForm && (
        <div className="mb-6">
          <AddControlForm 
            technicians={technicians}
            currentOrderCount={controls.length}
            onAddControl={handleAddControl}
            onCancel={() => { setShowAddForm(false); setError(null); }}
          />
        </div>
      )}
      
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
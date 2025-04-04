"use client";

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { Technician } from '@/lib/types'; // Assuming alias

export function TechnicianManager() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [newTechName, setNewTechName] = useState("");
  const [editingTechId, setEditingTechId] = useState<string | null>(null);
  const [editingTechName, setEditingTechName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingTechnicianId, setDeletingTechnicianId] = useState<string | null>(null);

  // Fetch technicians on component mount
  useEffect(() => {
    const fetchTechnicians = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/technicians');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Technician[] = await response.json();
        setTechnicians(data);
      } catch (err: any) {
        console.error("Failed to fetch technicians:", err);
        setError(err.message || "Failed to load technicians.");
      } finally {
        setLoading(false);
      }
    };
    fetchTechnicians();
  }, []);

  // Handler to add a new technician
  const handleAddTechnician = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;
    setError(null);

    try {
      const response = await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTechName.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const addedTechnician: Technician = await response.json();
      setTechnicians([...technicians, addedTechnician]);
      setNewTechName(""); // Clear input field
    } catch (err: any) {
      console.error("Failed to add technician:", err);
      setError(err.message || "Failed to add technician.");
    }
  };

  // Handler to initiate deleting a technician
  const handleDeleteClick = (id: string) => {
    setConfirmingDeleteId(id);
    setError(null); // Clear general errors when starting delete confirmation
  };

  // Handler to cancel technician deletion
  const handleCancelDelete = () => {
    setConfirmingDeleteId(null);
    setDeletingTechnicianId(null); // Ensure deleting state is also cleared
    setError(null);
  };

  // Handler to confirm and delete a technician
  const handleConfirmDelete = async (id: string) => {
    setError(null);
    setDeletingTechnicianId(id); // Set deleting state
    const originalTechnicians = [...technicians];
    
    // Optimistic UI update (optional, can be done just on success)
    // setTechnicians(originalTechnicians.filter(tech => tech.id !== id)); 

    try {
      const response = await fetch(`/api/technicians/delete`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
        const responseBodyText = await response.text();
        try {
          const errorData = JSON.parse(responseBodyText); 
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          console.error("Error response was not valid JSON:", responseBodyText); 
          errorMessage = `Failed to delete technician. Server responded unexpectedly (status: ${response.status})`;
        }
        // Rollback optimistic update if it was done
        // setTechnicians(originalTechnicians);
        throw new Error(errorMessage);
      }
      
      // Success: Remove the technician from the list
      setTechnicians(prev => prev.filter(tech => tech.id !== id)); 
      setConfirmingDeleteId(null); // Clear confirmation state

    } catch (err: any) {
      console.error("Failed to delete technician:", err);
      setError(err.message || "An unknown error occurred while deleting the technician.");
      // Ensure rollback if needed
      // setTechnicians(originalTechnicians); 
    } finally {
      setDeletingTechnicianId(null); // Clear deleting state regardless of outcome
      // Keep confirmation open on error? Maybe clear it?
      // setConfirmingDeleteId(null); // Uncomment to clear confirmation on error
    }
  };

  // Handlers for inline editing
  const startEditing = (tech: Technician) => {
    setEditingTechId(tech.id);
    setEditingTechName(tech.name);
  };

  const cancelEditing = () => {
    setEditingTechId(null);
    setEditingTechName("");
  };

  const handleUpdateTechnician = async (id: string) => {
    if (!editingTechName.trim() || editingTechName.trim() === technicians.find(t => t.id === id)?.name) {
      cancelEditing(); // Exit if name is empty or unchanged
      return;
    }
    setError(null);

    const originalTechnicians = [...technicians];
    const technicianToUpdate = originalTechnicians.find(tech => tech.id === id);
    if (!technicianToUpdate) return; // Should not happen

    // Optimistic UI update
    const updatedOptimisticTechnicians = originalTechnicians.map(tech =>
      tech.id === id ? { ...tech, name: editingTechName.trim() } : tech
    );
    setTechnicians(updatedOptimisticTechnicians);
    const originalEditingName = editingTechName; // Store for potential rollback
    cancelEditing(); // Exit editing mode immediately

    try {
      const response = await fetch(`/api/technicians/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: originalEditingName.trim() }), // Use originalEditingName for the API call
      });
      if (!response.ok) {
        const errorData = await response.json();
        setTechnicians(originalTechnicians); // Rollback UI
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      // API call successful, UI already updated optimistically
      // const updatedTechnician: Technician = await response.json();
      // setTechnicians(technicians.map(tech => 
      //   tech.id === id ? { ...tech, name: updatedTechnician.name } : tech
      // ));
      // cancelEditing(); // Exit editing mode
    } catch (err: any) {
      console.error("Failed to update technician:", err);
      setError(err.message || "Failed to update technician.");
      setTechnicians(originalTechnicians); // Rollback UI
    }
  };

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 w-full max-w-lg mx-auto my-4">
      <h3 className="text-lg font-semibold mb-4">Manage Technicians</h3>
      
      {/* Add Technician Form */}
      <form onSubmit={handleAddTechnician} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newTechName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTechName(e.target.value)}
          placeholder="New technician name"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-grow"
          aria-label="New technician name"
        />
        <button 
          type="submit" 
          disabled={!newTechName.trim()} // Disable if input is empty
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Add
        </button>
      </form>

      {loading && <p>Loading technicians...</p>}
      {error && <p className="text-red-500 text-sm mb-4">Error: {error}</p>}

      {/* Technician List */}
      <ul className="space-y-2">
        {/* Add explicit Technician type to map parameter */}
        {technicians.map((tech: Technician) => (
          <li key={tech.id} className="flex items-center justify-between p-2 border rounded-md min-h-[40px]"> {/* Ensure minimum height */} 
            {editingTechId === tech.id ? (
              // Editing View - Should not be visible if optimistic update works
              <div className="flex-grow flex items-center gap-2">
                <input
                  type="text"
                  value={editingTechName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditingTechName(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-grow"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateTechnician(tech.id);
                    if (e.key === 'Escape') cancelEditing();
                  }}
                />
                <button onClick={() => handleUpdateTechnician(tech.id)} className="text-green-600 hover:text-green-800 text-xs px-2">Save</button>
                <button onClick={cancelEditing} className="text-gray-500 hover:text-gray-700 text-xs px-2">Cancel</button>
              </div>
            ) : (
              // Display View
              <span className="flex-grow truncate cursor-pointer hover:underline" title={tech.name} onClick={() => startEditing(tech)}>{tech.name}</span>
            )}
            
            {editingTechId !== tech.id && (
               <div className="flex gap-2 ml-2 flex-shrink-0">
                  {/* Edit button is now handled by clicking the name */}
                  {/* <button onClick={() => startEditing(tech)} className="text-blue-600 hover:text-blue-800 text-sm">Edit</button> */}
                  {confirmingDeleteId === tech.id ? (
                     <div className="flex items-center gap-2">
                       <span className="text-sm text-gray-700">Delete?</span>
                       <button 
                         onClick={handleCancelDelete}
                         className="text-xs rounded px-2 py-1 border hover:bg-gray-100 disabled:opacity-50"
                         disabled={deletingTechnicianId === tech.id}
                       >
                         Cancel
                       </button>
                       <button 
                         onClick={() => handleConfirmDelete(tech.id)}
                         className="text-xs rounded px-2 py-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:bg-red-400"
                         disabled={deletingTechnicianId === tech.id}
                       >
                         {deletingTechnicianId === tech.id ? 'Deleting...' : 'Confirm'}
                       </button>
                     </div>
                  ) : (
                     <button 
                       onClick={() => handleDeleteClick(tech.id)} 
                       className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                       disabled={deletingTechnicianId !== null} // Disable if any delete is in progress
                     >
                       Delete
                     </button>
                  )}
               </div>
            )}
          </li>
        ))}
        {technicians.length === 0 && !loading && (
            <p className="text-gray-500 text-sm text-center">No technicians found.</p>
        )}
      </ul>
    </div>
  );
} 
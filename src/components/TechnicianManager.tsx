"use client";

import React, { useState, useEffect, ChangeEvent, FormEvent, Dispatch, SetStateAction } from 'react';
import { Technician } from '@/lib/types'; // Assuming alias

interface TechnicianManagerProps {
  showAddModal?: boolean;
  setShowAddModal?: Dispatch<SetStateAction<boolean>>;
}

export function TechnicianManager({ showAddModal: externalShowAddModal, setShowAddModal: externalSetShowAddModal }: TechnicianManagerProps = {}) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [newTechName, setNewTechName] = useState("");
  const [newTechEmail, setNewTechEmail] = useState("");
  const [newTechAgentId, setNewTechAgentId] = useState("");
  const [editingTechId, setEditingTechId] = useState<string | null>(null);
  const [editingTechName, setEditingTechName] = useState("");
  const [editingTechEmail, setEditingTechEmail] = useState("");
  const [editingTechAgentId, setEditingTechAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingTechnicianId, setDeletingTechnicianId] = useState<string | null>(null);
  const [internalShowAddModal, setInternalShowAddModal] = useState(false);
  
  // Use either external or internal modal state
  const showAddModalState = externalShowAddModal !== undefined ? externalShowAddModal : internalShowAddModal;
  const setShowAddModalState = externalSetShowAddModal || setInternalShowAddModal;

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
    if (!newTechName.trim() || !newTechEmail.trim() || !newTechAgentId.trim()) return;
    setError(null);

    try {
      const response = await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newTechName.trim(),
          email: newTechEmail.trim(),
          agentId: newTechAgentId.trim()
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const addedTechnician: Technician = await response.json();
      setTechnicians([...technicians, addedTechnician]);
      // Clear input fields and close modal
      setNewTechName("");
      setNewTechEmail("");
      setNewTechAgentId("");
      setShowAddModalState(false);
    } catch (err: any) {
      console.error("Failed to add technician:", err);
      setError(err.message || "Failed to add technician.");
    }
  };

  // Function to open the add modal
  const openAddModal = () => {
    setError(null); // Clear any previous errors
    setShowAddModalState(true);
  };
  
  // Function to close the add modal
  const closeAddModal = () => {
    setShowAddModalState(false);
    // Optionally clear form fields on close
    setNewTechName("");
    setNewTechEmail("");
    setNewTechAgentId("");
    setError(null); // Clear any potential add errors
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
    setEditingTechName(tech.name || '');
    setEditingTechEmail(tech.email || '');
    setEditingTechAgentId(tech.agentId || '');
  };

  const cancelEditing = () => {
    setEditingTechId(null);
    setEditingTechName("");
    setEditingTechEmail("");
    setEditingTechAgentId("");
  };

  const handleUpdateTechnician = async (id: string) => {
    // Safely trim values or use empty string if undefined
    const trimmedName = editingTechName?.trim() || '';
    const trimmedEmail = editingTechEmail?.trim() || '';
    const trimmedAgentId = editingTechAgentId?.trim() || '';

    // Check if values are empty or unchanged
    if (!trimmedName || !trimmedEmail || !trimmedAgentId ||
        (trimmedName === technicians.find(t => t.id === id)?.name &&
         trimmedEmail === technicians.find(t => t.id === id)?.email &&
         trimmedAgentId === technicians.find(t => t.id === id)?.agentId)) {
      cancelEditing(); // Exit if fields are empty or unchanged
      return;
    }
    setError(null);

    const originalTechnicians = [...technicians];
    const technicianToUpdate = originalTechnicians.find(tech => tech.id === id);
    if (!technicianToUpdate) return; // Should not happen

    // Optimistic UI update
    const updatedOptimisticTechnicians = originalTechnicians.map(tech =>
      tech.id === id ? { 
        ...tech, 
        name: trimmedName,
        email: trimmedEmail,
        agentId: trimmedAgentId
      } : tech
    );
    setTechnicians(updatedOptimisticTechnicians);
    
    // Store original values for potential rollback
    const originalEditingName = trimmedName;
    const originalEditingEmail = trimmedEmail;
    const originalEditingAgentId = trimmedAgentId;
    
    cancelEditing(); // Exit editing mode immediately

    try {
      const response = await fetch(`/api/technicians/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: originalEditingName,
          email: originalEditingEmail,
          agentId: originalEditingAgentId
        }),
      });
      
      if (!response.ok) {
        // Handle non-JSON responses properly
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const responseText = await response.text();
          try {
            // Try to parse as JSON first
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.message || errorMessage;
          } catch (parseError) {
            // If not JSON, use text or fallback message
            console.error("Error response was not valid JSON:", responseText);
            if (responseText && responseText.length < 200) {
              errorMessage = responseText;
            } else {
              errorMessage = `Failed to update technician. Server responded unexpectedly (status: ${response.status})`;
            }
          }
        } catch (err) {
          errorMessage = `Failed to update technician (status: ${response.status})`;
        }
        
        // Rollback UI
        setTechnicians(originalTechnicians);
        throw new Error(errorMessage);
      }
      
      // Parse the response
      let updatedTechnician: Technician;
      try {
        updatedTechnician = await response.json();
      } catch (jsonError) {
        console.error("Failed to parse response as JSON:", jsonError);
        setError("Server returned an invalid response format");
        setTechnicians(originalTechnicians); // Rollback UI
        return;
      }
      
      // Update the UI with the server's response - fix to include all fields
      setTechnicians(technicians.map(tech => 
        tech.id === id ? { 
          ...tech, 
          name: updatedTechnician.name,
          email: updatedTechnician.email,
          agentId: updatedTechnician.agentId
        } : tech
      ));
    } catch (err: any) {
      console.error("Failed to update technician:", err);
      setError(err.message || "Failed to update technician.");
      setTechnicians(originalTechnicians); // Rollback UI
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm p-6 w-full max-w-7xl mx-auto my-4">
      <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-gray-100">Technician Details</h3>
      
      <div className="w-full">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Existing Technicians</h4>
          {/* Only show this button if we're not using external modal control */}
          {externalShowAddModal === undefined && (
            <button 
              onClick={openAddModal}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 bg-indigo-600 dark:bg-indigo-400 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 h-10 px-4 py-2 shadow-sm gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Technician
            </button>
          )}
        </div>
        {loading && <p className="text-gray-700 dark:text-gray-300">Loading technicians...</p>}
        {error && <p className="text-red-500 dark:text-red-400 text-sm mb-4">Error: {error}</p>}

        {/* Technician List */}
        <ul className="space-y-3">
          {/* Add explicit Technician type to map parameter */}
          {technicians.map((tech: Technician) => (
            <li key={tech.id} className="p-3 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md"> 
              {editingTechId === tech.id ? (
                // Editing View
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={editingTechName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEditingTechName(e.target.value)}
                      className="flex h-9 w-full rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={editingTechEmail}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEditingTechEmail(e.target.value)}
                      className="flex h-9 w-full rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Agent ID</label>
                    <input
                      type="text"
                      value={editingTechAgentId}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEditingTechAgentId(e.target.value)}
                      className="flex h-9 w-full rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={cancelEditing} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm px-3 py-1 border border-gray-300 dark:border-gray-600 rounded">Cancel</button>
                    <button onClick={() => handleUpdateTechnician(tech.id)} className="text-white bg-indigo-600 dark:bg-indigo-400 hover:bg-indigo-700 dark:hover:bg-indigo-500 text-sm px-3 py-1 rounded">Save</button>
                  </div>
                </div>
              ) : (
                // Display View
                <div>
                  <div className="flex justify-between">
                    <div className="mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{tech.name}</h4>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{tech.email}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-500">ID: {tech.agentId}</div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => startEditing(tech)} 
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
                      >
                        Edit
                      </button>
                      {confirmingDeleteId === tech.id ? (
                         <div className="flex items-center gap-2">
                           <button 
                             onClick={handleCancelDelete}
                             className="text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
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
                           className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm disabled:opacity-50"
                           disabled={deletingTechnicianId !== null} // Disable if any delete is in progress
                         >
                           Delete
                         </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
          {technicians.length === 0 && !loading && (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center">No technicians found.</p>
          )}
        </ul>
      </div>

      {/* Add Technician Modal */}
      {showAddModalState && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-40">
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add New Technician</h3>
              <button
                onClick={closeAddModal}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {error && <p className="text-red-500 dark:text-red-400 text-sm mb-4">Error: {error}</p>}

            <form onSubmit={handleAddTechnician} className="flex flex-col gap-4">
              {/* Name Input */}
              <div className="mb-2">
                <label htmlFor="tech-name-modal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="tech-name-modal"
                  type="text"
                  value={newTechName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTechName(e.target.value)}
                  placeholder="Technician name"
                  className="flex h-10 w-full rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="New technician name"
                />
              </div>
              
              {/* Email Input */}
              <div className="mb-2">
                <label htmlFor="tech-email-modal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="tech-email-modal"
                  type="email"
                  value={newTechEmail}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTechEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex h-10 w-full rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="New technician email"
                />
              </div>
              
              {/* Agent ID Input */}
              <div className="mb-4">
                <label htmlFor="tech-agent-id-modal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Agent ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="tech-agent-id-modal"
                  type="text"
                  value={newTechAgentId}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTechAgentId(e.target.value)}
                  placeholder="A12345"
                  className="flex h-10 w-full rounded-md border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="New technician agent ID"
                />
              </div>
              
              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!newTechName.trim() || !newTechEmail.trim() || !newTechAgentId.trim()} // Disable if inputs are empty
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 dark:bg-indigo-400 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 h-10 px-4 py-2"
                >
                  Add Technician
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 
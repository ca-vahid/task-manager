"use client";

import React, { useState, useEffect } from 'react';
import { Technician } from '@/lib/types';

interface SyncAgent {
  id: number;
  agentId: string;
  name: string;
  email: string;
  department_ids?: number[];
  location_id?: number | null;
  location_name?: string | null;
  exists?: boolean;
  outOfSync?: boolean;
  selected: boolean;
}

interface TechnicianSyncProps {
  technicians: Technician[];
  onSyncComplete: () => void;
}

export function TechnicianSync({ technicians, onSyncComplete }: TechnicianSyncProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState<SyncAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<{
    success: number, 
    errors: number,
    added?: number,
    updated?: number
  } | null>(null);
  // Store the current technicians state for comparison after sync
  const [localTechnicians, setLocalTechnicians] = useState<Technician[]>(technicians);
  
  // Update local technicians when prop changes
  useEffect(() => {
    setLocalTechnicians(technicians);
  }, [technicians]);

  // Function to fetch agents from FreshService
  const fetchAgents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/technicians/freshservice');
      
      if (!response.ok) {
        throw new Error(`Error fetching agents: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Mark agents that already exist in our system - use localTechnicians which is updated post-sync
      const syncAgents: SyncAgent[] = data.agents.map((agent: Omit<SyncAgent, 'selected' | 'outOfSync'>) => {
        // Check if agent exists by exact ID match
        const exactIdMatch = localTechnicians.find(tech => tech.agentId === agent.agentId);
        
        // Check if agent exists by email match but has different ID (out of sync)
        const emailMatch = localTechnicians.find(tech => 
          tech.email && 
          agent.email && 
          tech.email.toLowerCase() === agent.email.toLowerCase() && 
          tech.agentId !== agent.agentId
        );
        
        // Agent exists if we have an exact ID match or an email match
        const exists = !!exactIdMatch || !!emailMatch;
        // Agent is out of sync if we have an email match but different ID
        const outOfSync = !!emailMatch;
        
        return {
          ...agent,
          exists,
          outOfSync,
          // Pre-select new agents and out-of-sync agents
          selected: !exists || outOfSync 
        };
      });
      
      setAgents(syncAgents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  };
  
  // Function to fetch latest technicians from API
  const refreshLocalTechnicians = async () => {
    try {
      const response = await fetch('/api/technicians');
      if (response.ok) {
        const data = await response.json();
        // Update our local copy of technicians
        setLocalTechnicians(data);
      }
    } catch (error) {
      console.error("Error refreshing technicians data:", error);
    }
  };
  
  // Function to handle sync of selected agents
  const syncAgents = async () => {
    setSyncing(true);
    setError(null);
    setSyncResults(null);
    
    try {
      const selectedAgents = agents.filter(agent => agent.selected);
      
      if (selectedAgents.length === 0) {
        setError("No agents selected for sync");
        setSyncing(false);
        return;
      }
      
      const response = await fetch('/api/technicians/freshservice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: selectedAgents }),
      });
      
      if (!response.ok) {
        throw new Error(`Error syncing agents: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log("Sync result:", result);
      
      // Refresh our local copy of technicians to reflect the changes
      await refreshLocalTechnicians();
      
      // Show success message with detailed results
      setSyncResults({
        success: result.results?.added + result.results?.updated || selectedAgents.length,
        errors: result.results?.failed || 0,
        added: result.results?.added || 0,
        updated: result.results?.updated || 0
      });
      
      // Notify parent component that sync is complete
      onSyncComplete();
      
      // Refetch agents to show updated status
      fetchAgents();
      
      // Close the modal after a delay
      setTimeout(() => {
        closeModal();
      }, 3000);
      
    } catch (error) {
      console.error("Error syncing agents:", error);
      setError(error instanceof Error ? error.message : "Failed to sync agents");
    } finally {
      setSyncing(false);
    }
  };
  
  // Toggle selection of an agent
  const toggleSelection = (agentId: string) => {
    setAgents(prevAgents => 
      prevAgents.map(agent => 
        agent.agentId === agentId 
          ? { ...agent, selected: !agent.selected } 
          : agent
      )
    );
  };
  
  // Toggle selection of all agents
  const toggleSelectAll = (selected: boolean) => {
    setAgents(prevAgents => 
      prevAgents.map(agent => ({ ...agent, selected }))
    );
  };
  
  // Function to open modal and fetch agents
  const openSyncModal = async () => {
    // Clear any previous state
    setIsOpen(true);
    setAgents([]);
    setSyncResults(null);
    setError(null);
    
    // Make sure we have the latest technicians data
    await refreshLocalTechnicians();
    
    // Fetch agents with fresh technician data
    fetchAgents();
  };
  
  // Function to close modal and clear state
  const closeModal = () => {
    setIsOpen(false);
    setAgents([]);
    setSyncResults(null);
    setError(null);
  };
  
  return (
    <>
      {/* Sync Button */}
      <button
        onClick={openSyncModal}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm flex items-center gap-2 ml-4"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Sync from FreshService
      </button>
      
      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Sync Technicians from FreshService
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Error display */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-300 p-3 rounded-md mb-4">
                {error}
              </div>
            )}
            
            {/* Success message */}
            {syncResults && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-300 p-3 rounded-md mb-4">
                <div className="font-medium">Sync completed successfully!</div>
                <div className="mt-1 text-sm">
                  {syncResults.added ? <div>• {syncResults.added} new technicians added</div> : null}
                  {syncResults.updated ? <div>• {syncResults.updated} existing technicians updated</div> : null}
                  {syncResults.errors > 0 && <div className="text-orange-700 dark:text-orange-300">• {syncResults.errors} errors encountered</div>}
                </div>
              </div>
            )}
            
            {/* Loading state */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                <span className="ml-3 text-gray-700 dark:text-gray-300">Loading agents...</span>
              </div>
            ) : (
              <>
                {/* Table header with select all */}
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={agents.length > 0 && agents.every(agent => agent.selected)}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Select All ({agents.filter(a => a.selected).length}/{agents.length})
                    </span>
                  </div>
                  
                  {/* Stats summary */}
                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full bg-green-100 dark:bg-green-900/30 mr-1"></span>
                      New: {agents.filter(a => !a.exists).length}
                    </div>
                    <div className="flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full bg-orange-100 dark:bg-orange-900/30 mr-1"></span>
                      Out of Sync: {agents.filter(a => a.outOfSync).length}
                    </div>
                    <div className="flex items-center">
                      <span className="inline-block w-3 h-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mr-1"></span>
                      Existing: {agents.filter(a => a.exists && !a.outOfSync).length}
                    </div>
                  </div>
                  
                  <div className="ml-auto">
                    <button
                      onClick={syncAgents}
                      disabled={syncing || agents.filter(a => a.selected).length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white rounded-md shadow-sm flex items-center gap-2"
                    >
                      {syncing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                          Syncing...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Sync Selected Agents
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Agents table */}
                {agents.length > 0 ? (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">
                            Select
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Name
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Email
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Agent ID
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Location
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {agents.map((agent) => (
                          <tr key={agent.agentId} className={agent.exists ? "bg-gray-50 dark:bg-gray-800/50" : ""}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={agent.selected}
                                onChange={() => toggleSelection(agent.agentId)}
                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {agent.name}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {agent.email}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {agent.agentId}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {agent.location_name || 'N/A'}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {agent.outOfSync ? (
                                <div className="relative group">
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 cursor-help">
                                    ID Out of Sync
                                  </span>
                                  <div className="absolute left-0 bottom-full mb-2 w-60 bg-black text-white text-xs rounded p-2 hidden group-hover:block z-10">
                                    This agent exists in your system with a different ID. 
                                    Syncing will update the local ID to match FreshService.
                                  </div>
                                </div>
                              ) : agent.exists ? (
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                                  Already Exists
                                </span>
                              ) : (
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                  New
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !loading ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No agents found in FreshService.
                  </div>
                ) : null}
              </>
            )}
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md mr-3"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 
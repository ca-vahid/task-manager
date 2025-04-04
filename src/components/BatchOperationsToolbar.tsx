'use client';

import React, { useState } from 'react';
import { Control, ControlStatus, PriorityLevel, Technician } from '@/lib/types';

interface BatchOperationsToolbarProps {
  selectedControlIds: string[];
  onClearSelection: () => void;
  technicians: Technician[];
  onUpdateControls: (controlIds: string[], updates: Partial<Omit<Control, 'id'>>) => Promise<void>;
}

export function BatchOperationsToolbar({
  selectedControlIds,
  onClearSelection,
  technicians,
  onUpdateControls
}: BatchOperationsToolbarProps) {
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [updateType, setUpdateType] = useState<'status' | 'priority' | 'assignee' | null>(null);
  const [statusValue, setStatusValue] = useState<ControlStatus | ''>('');
  const [priorityValue, setPriorityValue] = useState<PriorityLevel | ''>('');
  const [assigneeValue, setAssigneeValue] = useState<string>('');
  const [updateError, setUpdateError] = useState<string | null>(null);
  
  if (selectedControlIds.length === 0) {
    return null;
  }
  
  const handleApplyUpdate = async () => {
    setUpdateError(null);
    
    if (!updateType) {
      setUpdateError('Please select an update type');
      return;
    }
    
    let updates: Partial<Omit<Control, 'id'>> = {};
    
    // Build the updates object based on the selected update type
    if (updateType === 'status' && statusValue) {
      updates.status = statusValue as ControlStatus;
    } else if (updateType === 'assignee') {
      updates.assigneeId = assigneeValue === '' ? null : assigneeValue;
    } else {
      setUpdateError('Please select a value to update');
      return;
    }
    
    // Append last updated timestamp
    updates.lastUpdated = new Date() as any; // Will be converted to Timestamp by the API
    
    try {
      setIsBatchUpdating(true);
      await onUpdateControls(selectedControlIds, updates);
      
      // Reset form after successful update
      setUpdateType(null);
      setStatusValue('');
      setPriorityValue('');
      setAssigneeValue('');
      
    } catch (error: any) {
      setUpdateError(`Failed to update controls: ${error.message || 'Unknown error'}`);
    } finally {
      setIsBatchUpdating(false);
    }
  };
  
  return (
    <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-4 mb-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-indigo-900 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Batch Operations
          <span className="bg-indigo-200 text-indigo-800 text-xs font-medium px-2 py-0.5 rounded-full">
            {selectedControlIds.length} selected
          </span>
        </h3>
        
        <button 
          onClick={onClearSelection}
          className="text-indigo-700 hover:text-indigo-900 text-sm flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear Selection
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Update Type Selection */}
        <div>
          <label className="block text-xs font-medium text-indigo-800 mb-1">
            Update Type
          </label>
          <select
            value={updateType || ''}
            onChange={(e) => setUpdateType(e.target.value as 'status' | 'assignee' | null)}
            className="border border-indigo-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option value="">Select field to update</option>
            <option value="status">Status</option>
            <option value="assignee">Assignee</option>
          </select>
        </div>
        
        {/* Status Selection (conditional) */}
        {updateType === 'status' && (
          <div>
            <label className="block text-xs font-medium text-indigo-800 mb-1">
              New Status
            </label>
            <select
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value as ControlStatus)}
              className="border border-indigo-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">Select status</option>
              {Object.values(ControlStatus).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Priority Selection (conditional) */}
        {updateType === 'priority' && (
          <div>
            <label className="block text-xs font-medium text-indigo-800 mb-1">
              New Priority
            </label>
            <select
              value={priorityValue}
              onChange={(e) => setPriorityValue(e.target.value as PriorityLevel)}
              className="border border-indigo-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">Select priority</option>
              {Object.values(PriorityLevel).map(priority => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Assignee Selection (conditional) */}
        {updateType === 'assignee' && (
          <div>
            <label className="block text-xs font-medium text-indigo-800 mb-1">
              New Assignee
            </label>
            <select
              value={assigneeValue}
              onChange={(e) => setAssigneeValue(e.target.value)}
              className="border border-indigo-300 rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">Unassigned</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Apply Button */}
        <div className="flex items-end">
          <button
            onClick={handleApplyUpdate}
            disabled={isBatchUpdating || !updateType}
            className={`px-4 py-2 rounded-md text-white font-medium transition-colors ${
              isBatchUpdating || !updateType
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isBatchUpdating ? 'Updating...' : 'Apply to Selected'}
          </button>
        </div>
      </div>
      
      {/* Error Message */}
      {updateError && (
        <p className="text-red-600 text-sm mt-2">{updateError}</p>
      )}
    </div>
  );
} 
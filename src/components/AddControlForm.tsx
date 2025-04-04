"use client";

import React, { useState, FormEvent, ChangeEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ControlStatus, Technician, Control } from '@/lib/types';

interface AddControlFormProps {
  technicians: Technician[];
  currentOrderCount: number; // To determine the order of the new control
  onAddControl: (newControlData: Omit<Control, 'id'>) => Promise<void>;
  onCancel: () => void;
}

export function AddControlForm({ 
    technicians, 
    currentOrderCount, 
    onAddControl, 
    onCancel 
}: AddControlFormProps) {
  const [dcfId, setDcfId] = useState('');
  const [title, setTitle] = useState('');
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<ControlStatus>(ControlStatus.NotStarted);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState<string>(''); // Store as string YYYY-MM-DD
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dcfId.trim() || !title.trim()) {
      setError("DCF ID and Title are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    // Validate date before creating a Timestamp
    let dateTimestamp = null;
    if (estimatedCompletionDate) {
      try {
        const dateObj = new Date(estimatedCompletionDate);
        if (isNaN(dateObj.getTime())) {
          setError("Invalid date format. Please use YYYY-MM-DD.");
          setIsSubmitting(false);
          return;
        }
        dateTimestamp = Timestamp.fromDate(dateObj);
      } catch (error) {
        console.error("Date conversion error:", error);
        setError("Failed to process date. Please use YYYY-MM-DD format.");
        setIsSubmitting(false);
        return;
      }
    }

    const newControlData: Omit<Control, 'id'> = {
      dcfId: dcfId.trim(),
      title: title.trim(),
      explanation: explanation.trim(),
      status,
      assigneeId: assigneeId || null,
      estimatedCompletionDate: dateTimestamp,
      order: currentOrderCount, // Set order based on current count
    };

    try {
      await onAddControl(newControlData);
      // Clear form or handle success state (e.g., close modal/form)
      // The parent component (ControlList) will handle adding to the list state
      // and closing the form via onCancel or similar logic.
    } catch (err: any) {
      console.error("Failed to add control:", err);
      setError(err.message || "Failed to save the new control.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 mb-4 space-y-3"
    >
      <h4 className="text-md font-semibold mb-2">Add New Control</h4>
      
      {/* Row 1: DCF ID & Title */} 
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="dcfId" className="block text-sm font-medium text-gray-700 mb-1">DCF Identifier <span className="text-red-500">*</span></label>
          <input
            type="text"
            id="dcfId"
            value={dcfId}
            onChange={(e) => setDcfId(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
            required
          />
        </div>
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Control Title <span className="text-red-500">*</span></label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
            required
          />
        </div>
      </div>

      {/* Row 2: Explanation */} 
       <div>
          <label htmlFor="explanation" className="block text-sm font-medium text-gray-700 mb-1">Explanation</label>
          <textarea
            id="explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 bg-white"
          />
        </div>

      {/* Row 3: Status, Assignee, Date */} 
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
         <div>
          <label htmlFor="add-status" className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            id="add-status"
            value={status}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as ControlStatus)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
          >
            {Object.values(ControlStatus).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
         <div>
          <label htmlFor="add-assignee" className="block text-xs font-medium text-gray-500 mb-1">Assignee</label>
          <select
            id="add-assignee"
            value={assigneeId || ""} 
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setAssigneeId(e.target.value || null)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
          >
            <option value="">-- Unassigned --</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-date" className="block text-xs font-medium text-gray-500 mb-1">Est. Completion</label>
          <input
            type="date"
            id="add-date"
            value={estimatedCompletionDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEstimatedCompletionDate(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
          />
        </div>
      </div>

      {error && (
          <p className="text-red-500 text-xs mt-2">Error: {error}</p>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-2">
          <button 
            type="button" 
            onClick={onCancel}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
              Cancel
          </button>
           <button 
            type="submit" 
            disabled={isSubmitting || !dcfId.trim() || !title.trim()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 text-white hover:bg-indigo-700 h-9 px-4 py-2"
          >
             {isSubmitting ? 'Adding...' : 'Add Control'}
          </button>
      </div>
    </form>
  );
} 
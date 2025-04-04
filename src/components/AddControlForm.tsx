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
  const [status, setStatus] = useState<ControlStatus>(ControlStatus.InProgress);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState<string>(''); // Store as string YYYY-MM-DD
  const [externalUrl, setExternalUrl] = useState<string>(''); // Add state for external URL
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // States for AI extraction
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  
  // Form reference for event listening
  const formRef = React.useRef<HTMLFormElement>(null);
  
  // Set up event listener for AI extraction from parent component
  React.useEffect(() => {
    const handleAiExtractEvent = () => {
      setShowAiModal(true);
    };
    
    const currentForm = formRef.current;
    if (currentForm) {
      currentForm.addEventListener('aiextract', handleAiExtractEvent);
      
      // Clean up
      return () => {
        currentForm.removeEventListener('aiextract', handleAiExtractEvent);
      };
    }
  }, []);

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

    // Process external URL if provided
    let processedUrl = null;
    if (externalUrl.trim()) {
      let url = externalUrl.trim();
      // Add https:// if no protocol specified
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      processedUrl = url;
    }

    const newControlData: Omit<Control, 'id'> = {
      dcfId: dcfId.trim(),
      title: title.trim(),
      explanation: explanation.trim(),
      status,
      assigneeId: assigneeId || null,
      estimatedCompletionDate: dateTimestamp,
      order: currentOrderCount, // Set order based on current count
      priorityLevel: null,
      tags: [],
      progress: 0,
      lastUpdated: Timestamp.now(),
      externalUrl: processedUrl // Add the external URL
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
  
  // Handle AI text extraction
  const handleAiExtract = async () => {
    if (!aiText.trim()) {
      setError("Please enter some text to analyze.");
      return;
    }
    
    setIsAiProcessing(true);
    setError(null);
    
    try {
      console.log("Sending text to AI for extraction:", aiText.substring(0, 100) + "...");
      
      const response = await fetch('/api/openai/extract-control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: aiText }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Received extracted data from API:", data);
      
      // Update form fields with extracted data
      if (data.dcfId) {
        setDcfId(data.dcfId);
      }
      
      if (data.title) {
        setTitle(data.title);
      }
      
      if (data.explanation) {
        setExplanation(data.explanation);
      }
      
      if (data.technician) {
        // Try to find matching technician by name
        const matchedTechnician = technicians.find(
          tech => tech.name.toLowerCase() === data.technician.toLowerCase()
        );
        if (matchedTechnician) {
          setAssigneeId(matchedTechnician.id);
        }
      }
      
      if (data.estimatedCompletionDate) {
        setEstimatedCompletionDate(data.estimatedCompletionDate);
      }
      
      if (data.externalUrl) {
        setExternalUrl(data.externalUrl);
      }
      
      // Close the AI modal after successful extraction
      setShowAiModal(false);
      
    } catch (err: any) {
      console.error("Failed to extract control information:", err);
      setError(err.message || "Failed to extract information from the text.");
    } finally {
      setIsAiProcessing(false);
    }
  };

  // AI Text Extraction Modal
  const aiTextModal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-1.5 rounded-md text-white">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3ZM17 17H7V16.5C7 16.2348 6.89464 15.9804 6.70711 15.7929C6.51957 15.6054 6.26522 15.5 6 15.5C5.17 15.5 4.5 14.83 4.5 14V11.91C4.22 11.57 4 11.04 4 10.5C4 6.91 7.13 4 12 4C16.87 4 20 6.91 20 10.5C20 11.04 19.78 11.57 19.5 11.91V14C19.5 14.83 18.83 15.5 18 15.5C17.7348 15.5 17.4804 15.6054 17.2929 15.7929C17.1054 15.9804 17 16.2348 17 16.5V17Z" fill="white"/>
                <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="white"/>
                <path d="M8 8h2v1h-2v-1z" fill="white" className="animate-pulse"/>
                <path d="M14 8h2v1h-2v-1z" fill="white" className="animate-pulse"/>
                <path d="M9 13.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z" fill="white" className="animate-pulse" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-800">Extract Control Information with AI</h3>
          </div>
          <button 
            onClick={() => setShowAiModal(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-5">
            Paste your text below and AI will extract control information. The more detailed your text, the better the results.
          </p>
          
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={12}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-4 bg-white"
            placeholder="Paste your text here (e.g., email, ticket details, requirements document)..."
          />
          
          {error && (
            <p className="text-red-600 text-sm mt-4 p-3 bg-red-50 border border-red-200 rounded">
              Error: {error}
            </p>
          )}
          
          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button" 
              onClick={() => setShowAiModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              disabled={isAiProcessing}
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={handleAiExtract}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-md text-sm hover:from-purple-700 hover:to-indigo-700 flex items-center shadow-md"
              disabled={isAiProcessing || !aiText.trim()}
            >
              {isAiProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3Z" fill="currentColor"/>
                    <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="currentColor"/>
                    <path d="M8.5 7.5h1.5v1.5h-1.5v-1.5z" fill="currentColor" className="animate-pulse"/>
                    <path d="M14 7.5h1.5v1.5H14v-1.5z" fill="currentColor" className="animate-pulse"/>
                  </svg>
                  Extract with AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {showAiModal && aiTextModal}
      
      <form 
        ref={formRef}
        onSubmit={handleSubmit} 
        className="space-y-4"
      >
        {/* Row 1: Title (Full Width) */}
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

        {/* Row 2: DCF ID & External URL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label htmlFor="dcfId" className="block text-sm font-medium text-gray-700 mb-1">DCF ID <span className="text-red-500">*</span></label>
            <input
              type="number" // Use type number for better input
              id="dcfId"
              value={dcfId}
              onChange={(e) => setDcfId(e.target.value.slice(0, 3))} // Limit to 3 digits
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
              max="999"
              min="0"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="external-url" className="block text-sm font-medium text-gray-700 mb-1">External URL</label>
            <input
              type="url"
              id="external-url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://tickets.example.com/ticket/123"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-9 px-2 py-1 bg-white"
            />
          </div>
        </div>

        {/* Row 3: Explanation */}
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

        {/* Row 4: Status, Assignee, Date */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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

        {/* Error Display */}
        {error && (
            <p className="text-red-600 text-sm mt-2 p-2 bg-red-50 border border-red-200 rounded">Error: {error}</p>
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
    </>
  );
} 
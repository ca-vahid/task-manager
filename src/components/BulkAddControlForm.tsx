"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ControlStatus, Technician, Control, PriorityLevel, Company } from '@/lib/types';
import 'react-quill/dist/quill.snow.css';

// Create a client-side only wrapper to safely render ReactQuill
const ClientOnly = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  if (!mounted) return <EditorFallback />;
  
  return <>{children}</>;
};

// Fallback component to show while the editor is loading
const EditorFallback = () => (
  <div className="p-3 border-2 border-gray-300 dark:border-gray-700 rounded-md h-24 animate-pulse bg-gray-50 dark:bg-gray-800/50"></div>
);

// Create a lazy-loaded editor component to avoid SSR issues
const Editor = React.lazy(() => 
  import('react-quill').then(mod => {
    // Return a wrapper component that doesn't use findDOMNode
    return {
      default: (props: {
        value: string;
        onChange: (value: string) => void;
        theme?: string;
        className?: string;
        modules?: any;
        formats?: string[];
        placeholder?: string;
      }) => {
        const ReactQuill = mod.default;
        return <ReactQuill {...props} />;
      }
    };
  })
);

interface BulkAddControlFormProps {
  technicians: Technician[];
  currentOrderCount: number; // To determine the starting order of the new controls
  onAddControls: (newControlsData: Omit<Control, 'id'>[]) => Promise<void>;
  onCancel: () => void;
}

interface ExtractedControl {
  dcfId: string;
  title: string;
  explanation: string;
  technician: string | null;
  estimatedCompletionDate: string | null;
  isValid: boolean;
  errors: string[];
}

export function BulkAddControlForm({ 
  technicians, 
  currentOrderCount, 
  onAddControls, 
  onCancel 
}: BulkAddControlFormProps) {
  // States for the bulk add process
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [bulkText, setBulkText] = useState('');
  const [extractedControls, setExtractedControls] = useState<ExtractedControl[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Extract controls from the bulk text
  const handleExtract = async () => {
    if (!bulkText.trim()) {
      setError("Please enter some text to analyze.");
      return;
    }
    
    setIsExtracting(true);
    setError(null);
    
    try {
      console.log("Sending text to AI for bulk extraction...");
      
      const response = await fetch('/api/openai/extract-bulk-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: bulkText }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Received extracted controls from API:", data);
      
      // Validate each control and add validation status
      const validatedControls: ExtractedControl[] = data.map((control: any) => {
        const errors: string[] = [];
        
        if (!control.dcfId) errors.push("DCF ID is required");
        if (!control.title) errors.push("Title is required");
        
        // Convert technician name to technician ID if possible
        let technician = control.technician;
        if (technician) {
          // Try to find a matching technician by name
          const matchedTechnician = technicians.find(
            tech => tech.name.toLowerCase() === technician.toLowerCase()
          );
          if (matchedTechnician) {
            technician = matchedTechnician.id;
          } else {
            // If no exact match, try partial match
            const partialMatch = technicians.find(
              tech => tech.name.toLowerCase().includes(technician.toLowerCase()) ||
                      technician.toLowerCase().includes(tech.name.toLowerCase())
            );
            if (partialMatch) {
              technician = partialMatch.id;
            } else {
              technician = null; // No match found
            }
          }
        }
        
        return {
          ...control,
          technician,
          isValid: errors.length === 0,
          errors
        };
      });
      
      if (validatedControls.length === 0) {
        throw new Error("No controls were found in the text. Please check your input and try again.");
      }
      
      setExtractedControls(validatedControls);
      setStep('review');
      
    } catch (err: any) {
      console.error("Failed to extract controls:", err);
      setError(err.message || "Failed to extract controls from the text.");
    } finally {
      setIsExtracting(false);
    }
  };
  
  // Handle submitting all controls
  const handleSubmit = async () => {
    // Count valid controls
    const validControls = extractedControls.filter(control => control.isValid);
    
    if (validControls.length === 0) {
      setError("No valid controls to add. Please fix the errors.");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Prepare controls for submission
      const controlsToAdd = extractedControls.map((control, index) => {
        // Validate date before creating a Timestamp
        let dateTimestamp = null;
        if (control.estimatedCompletionDate) {
          try {
            const dateObj = new Date(control.estimatedCompletionDate);
            if (!isNaN(dateObj.getTime())) {
              dateTimestamp = Timestamp.fromDate(dateObj);
            }
          } catch (error) {
            console.error("Date conversion error:", error);
          }
        }
        
        // Create a control object
        return {
          dcfId: control.dcfId.trim(),
          title: control.title.trim(),
          explanation: control.explanation?.trim() || "",
          status: ControlStatus.InProgress, // Default status
          assigneeId: control.technician || null,
          estimatedCompletionDate: dateTimestamp,
          order: currentOrderCount + index, // Increment order for each control
          priorityLevel: null,
          tags: [],
          progress: 0,
          lastUpdated: Timestamp.now(),
          externalUrl: null, // Set to null as we're removing the field
          company: Company.Both, // Default company to Both
          ticketNumber: null,    // Add ticketNumber
          ticketUrl: null        // Add ticketUrl
        } as Omit<Control, 'id'>;
      });
      
      await onAddControls(controlsToAdd);
      // Success is handled by parent component (closes the form)
      
    } catch (err: any) {
      console.error("Failed to add controls:", err);
      setError(err.message || "Failed to save the controls.");
      setIsSubmitting(false);
    }
  };
  
  // Update a specific control in the review step
  const updateControl = (index: number, updates: Partial<ExtractedControl>) => {
    setExtractedControls(prevControls => {
      const newControls = [...prevControls];
      newControls[index] = {
        ...newControls[index],
        ...updates
      };
      
      // Revalidate the control
      const errors: string[] = [];
      if (!newControls[index].dcfId) errors.push("DCF ID is required");
      if (!newControls[index].title) errors.push("Title is required");
      
      newControls[index].errors = errors;
      newControls[index].isValid = errors.length === 0;
      
      return newControls;
    });
  };
  
  // Remove a control from the list
  const removeControl = (index: number) => {
    setExtractedControls(prevControls => {
      const newControls = [...prevControls];
      newControls.splice(index, 1);
      return newControls;
    });
  };
  
  // Add a new empty control
  const addEmptyControl = () => {
    setExtractedControls(prevControls => [
      ...prevControls,
      {
        dcfId: "",
        title: "",
        explanation: "",
        technician: null,
        estimatedCompletionDate: null,
        isValid: false,
        errors: ["DCF ID is required", "Title is required"]
      }
    ]);
  };
  
  // Render input step
  if (step === 'input') {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Paste your text below and AI will extract multiple controls. The text can include DCF IDs, titles, 
            explanations, technicians, and due dates in various formats.
          </p>
          
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={12}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 border-2 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="Paste your text here (e.g., email with multiple controls, document with multiple requirements)..."
          />
          
          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm mt-4 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-500/50 rounded">
              Error: {error}
            </p>
          )}
          
          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button" 
              onClick={onCancel}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              disabled={isExtracting}
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={handleExtract}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-400 text-white rounded-md text-sm hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-600 dark:hover:to-indigo-500 flex items-center shadow-md"
              disabled={isExtracting || !bulkText.trim()}
            >
              {isExtracting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Extracting Controls...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3Z" fill="currentColor"/>
                    <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="currentColor"/>
                    <path d="M8.5 7.5h1.5v1.5h-1.5v-1.5z" fill="currentColor" className="animate-pulse"/>
                    <path d="M14 7.5h1.5v1.5H14v-1.5z" fill="currentColor" className="animate-pulse"/>
                  </svg>
                  Extract Controls
                  {bulkText.trim() && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 bg-opacity-30 dark:bg-opacity-30 rounded-full">
                      {bulkText.match(/DCF-\d+|DCF \d+|\(DCF-\d+\)|\(DCF \d+\)/gi)?.length || 0}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Render review step
  if (step === 'review') {
    return (
      <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Review Extracted Controls
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({extractedControls.filter(c => c.isValid).length} of {extractedControls.length} valid)
            </span>
          </h3>
          <button
            type="button"
            onClick={addEmptyControl}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center transition-colors"
          >
            <svg className="w-4 h-4 mr-1" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Control
          </button>
        </div>
        
        <div className="overflow-y-auto flex-grow pr-2">
          <div className="space-y-4">
            {extractedControls.map((control, index) => (
              <div 
                key={index} 
                className={`border-2 rounded-lg p-4 ${
                  control.isValid 
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800' 
                    : 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Control #{index + 1}</h4>
                  <button
                    type="button"
                    onClick={() => removeControl(index)}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                    title="Remove this control"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                
                {control.errors.length > 0 && (
                  <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-700 rounded-md">
                    <ul className="text-xs text-red-700 dark:text-red-400 pl-5 list-disc">
                      {control.errors.map((err, errIndex) => (
                        <li key={errIndex}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  {/* DCF ID and Title row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* DCF ID */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        DCF ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={control.dcfId}
                        onChange={(e) => updateControl(index, { dcfId: e.target.value })}
                        className={`block w-full rounded-md text-sm h-9 px-3 py-1 border-2 ${
                          !control.dcfId 
                            ? 'border-red-300 dark:border-red-700 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500 dark:focus:ring-red-400' 
                            : 'border-gray-300 dark:border-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400'
                        } bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
                        placeholder="e.g. 123"
                      />
                    </div>
                  
                    {/* Title */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={control.title}
                        onChange={(e) => updateControl(index, { title: e.target.value })}
                        className={`block w-full rounded-md text-sm h-9 px-3 py-1 border-2 ${
                          !control.title 
                            ? 'border-red-300 dark:border-red-700 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500 dark:focus:ring-red-400' 
                            : 'border-gray-300 dark:border-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400'
                        } bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
                        placeholder="Control title"
                      />
                    </div>
                  </div>
                  
                  {/* Explanation */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Explanation
                    </label>
                    <div className="border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 min-h-[100px]">
                      <ClientOnly>
                        <Suspense fallback={<EditorFallback />}>
                          <Editor
                            value={control.explanation || ''}
                            onChange={(value) => updateControl(index, { explanation: value })}
                            theme="snow"
                            className="text-gray-900 dark:text-gray-100"
                            modules={{
                              toolbar: [
                                ['bold', 'italic', 'underline', 'strike'],
                                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                ['link'],
                                ['clean']
                              ]
                            }}
                            formats={['bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link']}
                            placeholder="Explanation of the control"
                          />
                        </Suspense>
                      </ClientOnly>
                    </div>
                  </div>
                  
                  {/* Assignee and Date row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Technician */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Assignee
                      </label>
                      <select
                        value={control.technician || ""}
                        onChange={(e) => updateControl(index, { technician: e.target.value || null })}
                        className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-sm h-9 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">-- Unassigned --</option>
                        {technicians.map(tech => (
                          <option key={tech.id} value={tech.id}>{tech.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Estimated Completion Date */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Est. Completion Date
                      </label>
                      <input
                        type="date"
                        value={control.estimatedCompletionDate || ''}
                        onChange={(e) => updateControl(index, { estimatedCompletionDate: e.target.value || null })}
                        className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-sm h-9 px-3 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {extractedControls.length === 0 && (
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-gray-200 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No controls found in the text. Try adding a control manually.</p>
                <button
                  type="button"
                  onClick={addEmptyControl}
                  className="mt-4 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-md text-sm hover:bg-indigo-700 dark:hover:bg-indigo-600 inline-flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add Control
                </button>
              </div>
            )}
          </div>
        </div>
        
        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-500/50 rounded my-3">
            Error: {error}
          </p>
        )}
        
        <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-200 dark:border-gray-700">
          <button 
            type="button" 
            onClick={() => setStep('input')}
            className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back
          </button>
          <button 
            type="button" 
            onClick={onCancel}
            className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 dark:bg-indigo-400 text-white rounded-md text-sm hover:bg-indigo-700 dark:hover:bg-indigo-500 flex items-center shadow-md transition-colors"
            disabled={isSubmitting || extractedControls.filter(c => c.isValid).length === 0}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding Controls...
              </>
            ) : (
              <>
                Add {extractedControls.filter(c => c.isValid).length} Control{extractedControls.filter(c => c.isValid).length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }
  
  // Render input step (no changes to this part)
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Paste your text below and AI will extract multiple controls. The text can include DCF IDs, titles, 
          explanations, technicians, and due dates in various formats.
        </p>
        
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={12}
          className="block w-full rounded-md border-gray-300 dark:border-gray-700 border-2 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Paste your text here (e.g., email with multiple controls, document with multiple requirements)..."
        />
        
        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-4 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-500/50 rounded">
            Error: {error}
          </p>
        )}
        
        <div className="flex justify-end gap-3 mt-6">
          <button 
            type="button" 
            onClick={onCancel}
            className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            disabled={isExtracting}
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleExtract}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-400 text-white rounded-md text-sm hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-600 dark:hover:to-indigo-500 flex items-center shadow-md"
            disabled={isExtracting || !bulkText.trim()}
          >
            {isExtracting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Extracting Controls...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3Z" fill="currentColor"/>
                  <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="currentColor"/>
                  <path d="M8.5 7.5h1.5v1.5h-1.5v-1.5z" fill="currentColor" className="animate-pulse"/>
                  <path d="M14 7.5h1.5v1.5H14v-1.5z" fill="currentColor" className="animate-pulse"/>
                </svg>
                Extract Controls
                {bulkText.trim() && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 bg-opacity-30 dark:bg-opacity-30 rounded-full">
                    {bulkText.match(/DCF-\d+|DCF \d+|\(DCF-\d+\)|\(DCF \d+\)/gi)?.length || 0}
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 
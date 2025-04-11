"use client";

import React, { useState, FormEvent, ChangeEvent, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ControlStatus, Technician, Control, Company } from '@/lib/types';
import Image from 'next/image';

// Remove static CSS import
// import 'react-quill/dist/quill.snow.css';

// Loading placeholder for the editor
const EditorFallback = () => (
  <div className="p-3 border-2 border-gray-300 dark:border-gray-700 rounded-md h-48 animate-pulse bg-gray-50 dark:bg-gray-800/50"></div>
);

// Custom Quill Editor Component with TypeScript types
interface QuillEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function QuillEditor({ value, onChange, placeholder }: QuillEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);
  
  // Check if we're on the client
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Initialize Quill on mount
  useEffect(() => {
    if (!isClient) return;
    
    if (editorRef.current && !quillRef.current) {
      // Dynamic import to avoid SSR issues
      import('quill').then(({ default: Quill }) => {
        if (editorRef.current && toolbarRef.current) { // Double-check refs are still valid
          // Create the editor with a custom toolbar container
          quillRef.current = new Quill(editorRef.current, {
            theme: 'snow',
            placeholder: placeholder || 'Write something...',
            modules: {
              toolbar: toolbarRef.current // Use the toolbar container ref
            },
            formats: ['bold', 'italic', 'underline', 'strike', 'list', 'link']
          });
          
          // Set initial content
          quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
          
          // Handle text change
          quillRef.current.on('text-change', () => {
            if (onChange && editorRef.current) {
              const editorElement = editorRef.current.querySelector('.ql-editor');
              if (editorElement) {
                const html = editorElement.innerHTML;
                onChange(html);
              }
            }
          });
        }
      });
    }
    
    // Cleanup on unmount
    return () => {
      if (quillRef.current) {
        // Properly destroy the Quill instance
        quillRef.current.off('text-change');
        quillRef.current = null;
      }
    };
  }, [isClient, placeholder, onChange]);
  
  // Update content when value prop changes
  useEffect(() => {
    if (!isClient || !quillRef.current) return;
    
    const editorElement = editorRef.current?.querySelector('.ql-editor');
    if (editorElement) {
      const currentContent = editorElement.innerHTML;
      if (value !== currentContent) {
        quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
      }
    }
  }, [isClient, value]);
  
  // Show loading placeholder until client-side code is ready
  if (!isClient) {
    return <EditorFallback />;
  }
  
  return (
    <div className="quill-container">
      {/* Custom toolbar container */}
      <div ref={toolbarRef} className="quill-toolbar">
        <span className="ql-formats">
          <button className="ql-bold"></button>
          <button className="ql-italic"></button>
          <button className="ql-underline"></button>
          <button className="ql-strike"></button>
        </span>
        <span className="ql-formats">
          <button className="ql-list" value="ordered"></button>
          <button className="ql-list" value="bullet"></button>
        </span>
        <span className="ql-formats">
          <button className="ql-link"></button>
          <button className="ql-clean"></button>
        </span>
      </div>
      
      {/* Editor container */}
      <div ref={editorRef} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
    </div>
  );
}

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
  const [company, setCompany] = useState<Company>(Company.Both); // Default to Both
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // States for AI extraction
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
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
      externalUrl: null, // Set to null as we're removing the field
      company, // Add the company field
      ticketNumber: null, // Add the ticketNumber field
      ticketUrl: null // Add the ticketUrl field
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
    
    setIsProcessingAi(true);
    setAiError(null);
    
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
      
      // Close the AI modal after successful extraction
      setShowAiModal(false);
      
    } catch (err: any) {
      console.error("Failed to extract control information:", err);
      setAiError(err.message || "Failed to extract information from the text.");
    } finally {
      setIsProcessingAi(false);
    }
  };

  // AI Text Extraction Modal
  const aiTextModal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b-2 border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 dark:from-purple-400 dark:to-indigo-500 p-1.5 rounded-md text-white">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3ZM17 17H7V16.5C7 16.2348 6.89464 15.9804 6.70711 15.7929C6.51957 15.6054 6.26522 15.5 6 15.5C5.17 15.5 4.5 14.83 4.5 14V11.91C4.22 11.57 4 11.04 4 10.5C4 6.91 7.13 4 12 4C16.87 4 20 6.91 20 10.5C20 11.04 19.78 11.57 19.5 11.91V14C19.5 14.83 18.83 15.5 18 15.5C17.7348 15.5 17.4804 15.6054 17.2929 15.7929C17.1054 15.9804 17 16.2348 17 16.5V17Z" fill="white"/>
                <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="white"/>
                <path d="M8 8h2v1h-2v-1z" fill="white" className="animate-pulse"/>
                <path d="M14 8h2v1h-2v-1z" fill="white" className="animate-pulse"/>
                <path d="M9 13.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z" fill="white" className="animate-pulse" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Extract Control Information with AI</h3>
          </div>
          <button 
            onClick={() => setShowAiModal(false)} 
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Paste any text containing control information (emails, tickets, requirements) and AI will extract the relevant details.
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="ai-text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text to analyze</label>
              <textarea
                id="ai-text"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={10}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:placeholder-gray-400"
                placeholder="Paste email, ticket content, or any text containing control details here. Our AI will extract the relevant information such as title, DCF ID, dates, and more."
              ></textarea>
              
              {aiError && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2 p-2 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-500/50 rounded">Error: {aiError}</p>
              )}
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                disabled={isProcessingAi}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleAiExtract}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-400 text-white rounded-md text-sm hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-600 dark:hover:to-indigo-500 flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isProcessingAi || !aiText.trim()}
              >
                {isProcessingAi ? (
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
                      <path d="M12 3C7.23 3 3.25 6.4 3.25 10.5C3.25 12.57 4.305 14.425 6 15.677V18C6 18.2652 6.10536 18.5196 6.29289 18.7071C6.48043 18.8946 6.73478 19 7 19H17C17.2652 19 17.5196 18.8946 17.7071 18.7071C17.8946 18.5196 18 18.2652 18 18V15.677C19.695 14.425 20.75 12.57 20.75 10.5C20.75 6.4 16.77 3 12 3Z" fill="white"/>
                      <path d="M10 10.5C10 9.12 11.12 8 12.5 8C13.88 8 15 9.12 15 10.5C15 11.88 13.88 13 12.5 13C11.12 13 10 11.88 10 10.5Z" fill="white"/>
                      <path d="M8 8h2v1h-2v-1z" fill="white" className="animate-pulse"/>
                      <path d="M14 8h2v1h-2v-1z" fill="white" className="animate-pulse"/>
                    </svg>
                    Extract Information
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Company selection component with logos
  const CompanySelector = () => (
    <div>
      <label htmlFor="company-select" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Company
      </label>
      <div className="flex flex-wrap gap-2">
        <label 
          className={`flex items-center p-2 rounded-lg border-2 cursor-pointer transition-colors ${
            company === Company.BGC 
              ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300' 
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
          }`}
        >
          <input 
            type="radio" 
            name="company" 
            value={Company.BGC} 
            checked={company === Company.BGC} 
            onChange={() => setCompany(Company.BGC)} 
            className="sr-only"
          />
          <div className="w-6 h-6 relative mr-2 flex items-center justify-center">
            <Image 
              src="/logos/bgc-logo.png" 
              alt="BGC Logo" 
              width={24}
              height={24}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium">BGC</span>
        </label>
        
        <label 
          className={`flex items-center p-2 rounded-lg border-2 cursor-pointer transition-colors ${
            company === Company.Cambio 
              ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300' 
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
          }`}
        >
          <input 
            type="radio" 
            name="company" 
            value={Company.Cambio} 
            checked={company === Company.Cambio} 
            onChange={() => setCompany(Company.Cambio)} 
            className="sr-only"
          />
          <div className="w-6 h-6 relative mr-2 flex items-center justify-center">
            <Image 
              src="/logos/cambio-logo.png" 
              alt="Cambio Logo" 
              width={24}
              height={24}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium">Cambio</span>
        </label>
        
        <label 
          className={`flex items-center p-2 rounded-lg border-2 cursor-pointer transition-colors ${
            company === Company.Both 
              ? 'bg-purple-50 dark:bg-cyan-900/40 border-purple-300 dark:border-cyan-600 text-purple-700 dark:text-cyan-300' 
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
          }`}
        >
          <input 
            type="radio" 
            name="company" 
            value={Company.Both} 
            checked={company === Company.Both} 
            onChange={() => setCompany(Company.Both)} 
            className="sr-only"
          />
          <div className="w-6 h-6 relative mr-2">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 relative">
                <div className="absolute top-0 left-0 w-6 h-3 overflow-hidden flex items-center justify-center">
                  <Image 
                    src="/logos/bgc-logo.png" 
                    alt="BGC Logo" 
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                </div>
                <div className="absolute bottom-0 left-0 w-6 h-3 overflow-hidden flex items-center justify-center">
                  <Image 
                    src="/logos/cambio-logo.png" 
                    alt="Cambio Logo" 
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
          <span className="text-sm font-medium">Both</span>
        </label>
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
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Control Title <span className="text-red-500">*</span></label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm h-9 px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            required
          />
        </div>

        {/* Row 2: DCF ID (Full Width) */}
        <div>
          <label htmlFor="dcfId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DCF ID <span className="text-red-500">*</span></label>
          <input
            type="number" // Use type number for better input
            id="dcfId"
            value={dcfId}
            onChange={(e) => setDcfId(e.target.value.slice(0, 3))} // Limit to 3 digits
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm h-9 px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            max="999"
            min="0"
            required
          />
        </div>

        {/* Row 3: Explanation */}
        <div>
            <label htmlFor="explanation" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Explanation</label>
            <div className="bg-white dark:bg-gray-800 rounded-md border-2 border-gray-300 dark:border-gray-700">
              <QuillEditor
                value={explanation}
                onChange={(value) => setExplanation(value)}
                placeholder="Add a detailed explanation of this control..."
              />
            </div>
          </div>

        {/* Row 4: Company Selection */}
        <CompanySelector />

        {/* Row 5: Status, Assignee, Date */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
           <div>
            <label htmlFor="add-status" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select
              id="add-status"
              value={status}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as ControlStatus)}
              className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm h-9 px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              {Object.values(ControlStatus).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
           <div>
            <label htmlFor="add-assignee" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Assignee</label>
            <select
              id="add-assignee"
              value={assigneeId || ""} 
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setAssigneeId(e.target.value || null)}
              className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm h-9 px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">-- Unassigned --</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-date" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Est. Completion</label>
            <input
              type="date"
              id="add-date"
              value={estimatedCompletionDate}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEstimatedCompletionDate(e.target.value)}
              className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm h-9 px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
            <p className="text-red-600 dark:text-red-400 text-sm mt-2 p-2 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-500/50 rounded">Error: {error}</p>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button" 
              onClick={onCancel}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:pointer-events-none disabled:opacity-50 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 h-9 px-4 py-2"
            >
                Cancel
            </button>
             <button 
              type="submit" 
              disabled={isSubmitting || !dcfId.trim() || !title.trim()}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 dark:bg-indigo-400 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 h-9 px-4 py-2"
            >
                {isSubmitting ? 'Saving...' : 'Save Control'}
            </button>
        </div>
      </form>
    </>
  );
} 
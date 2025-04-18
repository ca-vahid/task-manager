"use client";

import React, { useState, FormEvent, ChangeEvent, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { TaskStatus, Technician, Task, Group, Category } from '@/lib/types';
import Image from 'next/image';

// Import Quill styles globally
import 'quill/dist/quill.snow.css';

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

// Export the QuillEditor so it can be imported by other components
export function QuillEditor({ value, onChange, placeholder }: QuillEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  useEffect(() => {
    if (!isClient) return;
    
    if (editorRef.current && !quillRef.current) {
      import('quill').then(({ default: Quill }) => {
        if (editorRef.current) {
          quillRef.current = new Quill(editorRef.current, {
            theme: 'snow',
            placeholder: placeholder || 'Write something...',
            modules: {
              toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'clean']
              ],
            },
            formats: ['bold', 'italic', 'underline', 'strike', 'list', 'link']
          });
          
          // Force LTR on the editor element itself
          const editorElement = quillRef.current.container.querySelector('.ql-editor');
          if (editorElement) {
             editorElement.setAttribute('dir', 'ltr');
             editorElement.style.textAlign = 'left';
             editorElement.style.unicodeBidi = 'plaintext';
          }

          // Set initial content - IMPORTANT: Do this after LTR is set
          if (value) {
            console.log('Initializing editor with content:', value.substring(0, 100));
            quillRef.current.clipboard.dangerouslyPasteHTML(value);
            
            // Force a delay to ensure content is set properly
            setTimeout(() => {
              const currentContent = quillRef.current.root.innerHTML;
              console.log('Editor content after initialization:', currentContent.substring(0, 100));
              
              // If content didn't take, try again with direct HTML
              if (!currentContent || currentContent === '<p><br></p>') {
                console.log('Content not set properly, trying again with direct HTML');
                quillRef.current.root.innerHTML = value;
              }
            }, 50);
          }

          // Handle text change
          quillRef.current.on('text-change', (delta: any, oldDelta: any, source: string) => {
            if (onChange && quillRef.current) {
              const html = quillRef.current.root.innerHTML;
              onChange(html === '<p><br></p>' ? '' : html);
            }
          });

          // Focus/blur styling
          quillRef.current.on('selection-change', (range: any) => {
            const container = quillRef.current?.container;
            if (container) {
              if (range) {
                container.classList.add('is-focused');
              } else {
                container.classList.remove('is-focused');
              }
            }
          });
        }
      }).catch(error => {
        console.error("Failed to load Quill:", error);
      });
    }

    // Cleanup on unmount
    return () => {
      if (quillRef.current) {
         quillRef.current.off('text-change');
         quillRef.current.off('selection-change');
      }
    };
  }, [isClient, placeholder, onChange]);
  
  // Update content when value prop changes externally
  useEffect(() => {
    if (isClient && quillRef.current && value) {
      // Only update content if the editor isn't focused to prevent cursor jumps
      if (!quillRef.current.hasFocus()) {
        const currentContent = quillRef.current.root.innerHTML;
        
        // Only update if content actually changed
        if (value !== currentContent) {
          quillRef.current.clipboard.dangerouslyPasteHTML(value);
        }
      }
    }
  }, [isClient, value]);

  // Simpler styling
  const editorStyles = `
    .quill-container {
      display: flex;
      flex-direction: column;
      border: 1px solid #e5e7eb;
      border-radius: 0.375rem;
      overflow: hidden;
    }
    .dark .quill-container {
      border-color: #374151;
    }
    .quill-container .ql-toolbar.ql-snow {
      border: none;
      border-bottom: 1px solid #e5e7eb;
      padding: 8px 12px;
      background-color: #f9fafb;
    }
    .dark .quill-container .ql-toolbar.ql-snow {
      border-bottom-color: #374151;
      background-color: #1f2937;
    }
    .quill-container .ql-container.ql-snow {
      border: none;
      height: 160px; /* Reduced height */
    }
    .quill-container .ql-editor {
      min-height: 120px; /* Reduced min-height */
      max-height: 200px; /* Added max-height */
      direction: ltr !important;
      text-align: left !important;
      unicode-bidi: plaintext !important;
    }
    .dark .quill-container .ql-editor {
      color: #e5e7eb;
    }
    .dark .quill-container .ql-snow .ql-stroke {
      stroke: #9ca3af;
    }
    .dark .quill-container .ql-snow .ql-fill {
      fill: #9ca3af;
    }
    .dark .quill-container .ql-snow .ql-picker {
      color: #e5e7eb;
    }
    .dark .quill-container .ql-snow.ql-toolbar button:hover,
    .dark .quill-container .ql-snow .ql-toolbar button:hover,
    .dark .quill-container .ql-snow.ql-toolbar button.ql-active,
    .dark .quill-container .ql-snow .ql-toolbar button.ql-active,
    .dark .quill-container .ql-snow.ql-toolbar .ql-picker-label:hover,
    .dark .quill-container .ql-snow .ql-toolbar .ql-picker-label:hover,
    .dark .quill-container .ql-snow.ql-toolbar .ql-picker-label.ql-active,
    .dark .quill-container .ql-snow .ql-toolbar .ql-picker-label.ql-active,
    .dark .quill-container .ql-snow.ql-toolbar .ql-picker-item:hover,
    .dark .quill-container .ql-snow .ql-toolbar .ql-picker-item:hover,
    .dark .quill-container .ql-snow.ql-toolbar .ql-picker-item.ql-selected,
    .dark .quill-container .ql-snow .ql-toolbar .ql-picker-item.ql-selected {
      color: #60a5fa;
    }
    .dark .quill-container .ql-snow.ql-toolbar button:hover .ql-stroke,
    .dark .quill-container .ql-snow .ql-toolbar button:hover .ql-stroke,
    .dark .quill-container .ql-snow.ql-toolbar button.ql-active .ql-stroke,
    .dark .quill-container .ql-snow .ql-toolbar button.ql-active .ql-stroke,
    .dark .quill-container .ql-snow.ql-toolbar .ql-picker-label:hover .ql-stroke,
    .dark .quill-container .ql-snow .ql-toolbar .ql-picker-label:hover .ql-stroke,
    .dark .quill-container .ql-snow.ql-toolbar .ql-picker-label.ql-active .ql-stroke,
    .dark .quill-container .ql-snow .ql-toolbar .ql-picker-label.ql-active .ql-stroke {
      stroke: #60a5fa;
    }
    .dark .quill-container .ql-snow.ql-toolbar button:hover .ql-fill,
    .dark .quill-container .ql-snow .ql-toolbar button:hover .ql-fill,
    .dark .quill-container .ql-snow.ql-toolbar button.ql-active .ql-fill,
    .dark .quill-container .ql-snow .ql-toolbar button.ql-active .ql-fill {
      fill: #60a5fa;
    }
  `;

  return (
    <>
      <style>{editorStyles}</style>
      <div className="quill-container" dir="ltr">
        <div ref={editorRef} />
      </div>
    </>
  );
}

QuillEditor.displayName = 'QuillEditor';

interface AddTaskFormProps {
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  currentOrderCount: number; // To determine the order of the new task
  onAddTask: (newTaskData: Omit<Task, 'id'>) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

export function AddTaskForm({ 
    technicians, 
    groups,
    categories,
    currentOrderCount, 
    onAddTask, 
    onCancel,
    onCreateGroup 
}: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.Open);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState<string>(''); // Store as string YYYY-MM-DD
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  
  // States for AI extraction
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiProcessedRef = useRef(false); // Track if AI has processed data
  const [aiMatchedTechId, setAiMatchedTechId] = useState<string | null>(null); // Store the ID of the technician matched by AI
  const [aiMatchedCategoryId, setAiMatchedCategoryId] = useState<string | null>(null); // Store the ID of the category matched by AI
  
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

  // Log when assigneeId changes for debugging
  React.useEffect(() => {
    console.log("Assignee ID changed to:", assigneeId);
    if (assigneeId) {
      const tech = technicians.find(t => t.id === assigneeId);
      console.log("Selected technician:", tech?.name);
    }
  }, [assigneeId, technicians]);

  // Set up listener for when the modal is closed to ensure assignee is set
  React.useEffect(() => {
    if (!showAiModal && aiProcessedRef.current) {
      // This runs after AI modal is closed and AI has processed data
      // Double-check that assignee is set correctly if technician was identified
      console.log("AI modal closed, ensuring assignee is set correctly");
      
      setTimeout(() => {
        if (aiProcessedRef.current) {
          console.log("Final assignee value:", assigneeId);
        }
      }, 100);
    }
  }, [showAiModal, assigneeId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
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

    const newTaskData: Omit<Task, 'id'> = {
      title: title.trim(),
      explanation: explanation.trim(),
      status,
      assigneeId: assigneeId || null,
      groupId: groupId || null,
      categoryId: categoryId || null,
      estimatedCompletionDate: dateTimestamp,
      order: currentOrderCount, // Set order based on current count
      priorityLevel: null,
      tags: [],
      progress: 0,
      lastUpdated: Timestamp.now(),
      externalUrl: null,
      ticketNumber: null,
      ticketUrl: null
    };

    try {
      await onAddTask(newTaskData);
      // Clear form or handle success state (e.g., close modal/form)
      // The parent component (TaskList) will handle adding to the list state
      // and closing the form via onCancel or similar logic.
    } catch (err: any) {
      console.error("Failed to add task:", err);
      setError(err.message || "Failed to save the new task.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Function to forcibly set the assignee ID for a technician name
  const forceSetAssigneeByName = (technicianName: string) => {
    if (!technicianName) return;
    
    console.log("Force setting assignee by name:", technicianName);
    const matchedTech = findBestTechnicianMatch(technicianName, technicians);
    
    if (matchedTech) {
      console.log("Force matched technician:", matchedTech.name, "ID:", matchedTech.id);
      setAssigneeId(matchedTech.id);
      setAiMatchedTechId(matchedTech.id); // Store which technician was matched by AI
      aiProcessedRef.current = true;
    } else {
      console.log("No match found for technician name:", technicianName);
    }
  };

  // Function to set category by name, similar to what we do for technicians
  const forceSetCategoryByName = (categoryName: string) => {
    if (!categoryName) return;
    
    console.log("Force setting category by name:", categoryName);
    
    // Try exact match first
    const exactMatch = categories.find(
      cat => cat.value.toLowerCase() === categoryName.toLowerCase()
    );
    if (exactMatch) {
      console.log("Found exact category match:", exactMatch.value, "ID:", exactMatch.id);
      setCategoryId(exactMatch.id);
      setAiMatchedCategoryId(exactMatch.id);
      return;
    }
    
    // Try if any category name contains the input name
    const containsMatch = categories.find(
      cat => cat.value.toLowerCase().includes(categoryName.toLowerCase()) ||
             categoryName.toLowerCase().includes(cat.value.toLowerCase())
    );
    if (containsMatch) {
      console.log("Found contains category match:", containsMatch.value, "ID:", containsMatch.id);
      setCategoryId(containsMatch.id);
      setAiMatchedCategoryId(containsMatch.id);
      return;
    }
    
    console.log("No match found for category:", categoryName);
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
      
      const response = await fetch('/api/openai/extract-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: aiText,
          technicians: technicians.map(tech => ({ id: tech.id, name: tech.name })),
          categories: categories.map(cat => ({ id: cat.id, value: cat.value, displayId: cat.displayId }))
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Received extracted data from API:", data);
      
      // Set flag to indicate AI is updating fields
      aiProcessedRef.current = true;
      
      // Update form fields with extracted data
      if (data.title) {
        setTitle(data.title);
      }
      
      if (data.explanation) {
        setExplanation(data.explanation);
      }
      
      if (data.technician) {
        console.log("Trying to match technician:", data.technician);
        forceSetAssigneeByName(data.technician);
      }
      
      if (data.category) {
        console.log("Trying to match category:", data.category);
        forceSetCategoryByName(data.category);
      }
      
      if (data.estimatedCompletionDate) {
        setEstimatedCompletionDate(data.estimatedCompletionDate);
      }
      
      // Close the AI modal after successful extraction
      setShowAiModal(false);
      
    } catch (err: any) {
      console.error("Failed to extract task information:", err);
      setAiError(err.message || "Failed to extract information from the text.");
      aiProcessedRef.current = false;
    } finally {
      setIsProcessingAi(false);
    }
  };

  // Helper function to find the best technician match based on name
  const findBestTechnicianMatch = (name: string, technicianList: Technician[]) => {
    if (!name || !name.trim()) return null;
    
    const normalizedName = name.toLowerCase().trim();
    console.log("Matching technician name:", normalizedName);
    console.log("Available technicians:", technicianList.map(t => t.name));
    
    // Try exact match first
    const exactMatch = technicianList.find(
      tech => tech.name.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) {
      console.log("Found exact match:", exactMatch.name);
      return exactMatch;
    }
    
    // Try if any technician name contains the input name
    const containsMatch = technicianList.find(
      tech => tech.name.toLowerCase().trim().includes(normalizedName)
    );
    if (containsMatch) {
      console.log("Found contains match:", containsMatch.name);
      return containsMatch;
    }
    
    // Try if the input name contains any technician name
    const reverseContainsMatch = technicianList.find(
      tech => normalizedName.includes(tech.name.toLowerCase().trim())
    );
    if (reverseContainsMatch) {
      console.log("Found reverse contains match:", reverseContainsMatch.name);
      return reverseContainsMatch;
    }
    
    // Try if the input name contains any part (word) of any technician name
    for (const tech of technicianList) {
      const techNameParts = tech.name.toLowerCase().trim().split(/\s+/);
      for (const part of techNameParts) {
        if (normalizedName.includes(part) && part.length > 1) {
          console.log("Found part in name match:", tech.name, "part:", part);
          return tech;
        }
      }
    }
    
    // Try if any part of the input name matches any part of any technician name
    const nameParts = normalizedName.split(/\s+/);
    for (const part of nameParts) {
      if (part.length < 2) continue; // Skip very short parts
      
      const partMatch = technicianList.find(tech => {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        return techParts.some(techPart => techPart.includes(part) || part.includes(techPart));
      });
      
      if (partMatch) {
        console.log("Found name part match:", partMatch.name);
        return partMatch;
      }
    }
    
    console.log("No match found for:", name);
    return null;
  };

  // Handle creating a new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !onCreateGroup) {
      return;
    }
    
    try {
      const newGroup = await onCreateGroup(newGroupName.trim(), newGroupDescription.trim());
      setGroupId(newGroup.id);
      setShowNewGroupForm(false);
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (err: any) {
      setError(err.message || "Failed to create new group.");
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
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Extract Task Information with AI</h3>
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
            Paste any text containing task information (emails, tickets, requirements) and AI will extract the relevant details including title, description, assignee, category, and due date.
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
                placeholder="Paste email, ticket content, or any text containing task details here. Our AI will extract the relevant information such as title, category, assignee, dates, and more."
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 p-4 rounded-md">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title
        </label>
        <input 
          type="text" 
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Enter task title"
        />
      </div>
      
      <div>
        <div className="flex justify-between mb-1">
          <label htmlFor="explanation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            <svg className="w-4 h-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11z" />
              <path d="M10 5.5a1 1 0 100 2 1 1 0 000-2zm0 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" />
            </svg>
            Extract with AI
          </button>
        </div>
        <QuillEditor
          value={explanation}
          onChange={setExplanation}
          placeholder="Enter task description and details..."
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <select 
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value={TaskStatus.Open}>Open</option>
            <option value={TaskStatus.Pending}>Pending</option>
            <option value={TaskStatus.Resolved}>Resolved</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="assignee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Assignee
          </label>
          <select 
            id="assignee"
            value={assigneeId || ""}
            onChange={(e) => {
              console.log("Assignee manually changed to:", e.target.value);
              setAssigneeId(e.target.value || null);
            }}
            className={`block w-full rounded-md border-2 ${aiProcessedRef.current ? 'border-green-300 dark:border-green-700' : 'border-gray-300 dark:border-gray-700'} shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
          >
            <option value="">Unassigned</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>
                {tech.name} {aiProcessedRef.current && aiMatchedTechId === tech.id ? '(AI Match)' : ''}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="due-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Due Date
          </label>
          <input 
            type="date" 
            id="due-date"
            value={estimatedCompletionDate}
            onChange={(e) => setEstimatedCompletionDate(e.target.value)}
            className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        
        <div>
          <label htmlFor="group" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Group
          </label>
          {showNewGroupForm ? (
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <input 
                type="text" 
                placeholder="Group description (optional)"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim() || !onCreateGroup}
                  className="px-3 py-1 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(false)}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <select 
                id="group"
                value={groupId || ""}
                onChange={(e) => setGroupId(e.target.value || null)}
                className="block w-full rounded-md border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="">No Group</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewGroupForm(true)}
                className="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>
        
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select 
            id="category"
            value={categoryId || ""}
            onChange={(e) => {
              console.log("Category manually changed to:", e.target.value);
              setCategoryId(e.target.value || null);
            }}
            className={`block w-full rounded-md border-2 ${aiProcessedRef.current && aiMatchedCategoryId ? 'border-green-300 dark:border-green-700' : 'border-gray-300 dark:border-gray-700'} shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
          >
            <option value="">No Category</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.value} {aiProcessedRef.current && aiMatchedCategoryId === category.id ? '(AI Match)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Action buttons - fixed position at the bottom of form */}
      <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-white dark:bg-gray-800 pb-2 mt-6 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-md text-sm hover:from-blue-600 hover:to-indigo-700 flex items-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Save Task
            </>
          )}
        </button>
      </div>
      
      {/* AI Text Extraction Modal */}
      {showAiModal && aiTextModal}
    </form>
  );
} 
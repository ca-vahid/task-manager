"use client";

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import dynamic from 'next/dynamic';

// Dynamically import React-Quill to prevent SSR issues
const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center">
    <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
  </div>
});

// Import the styles for the editor
import 'react-quill/dist/quill.snow.css';

// Add custom CSS for dark mode compatibility
const customEditorStyles = `
  /* Dark mode styles for Quill editor */
  .dark .ql-toolbar.ql-snow {
    border-color: #374151 !important;
    background-color: #1f2937 !important;
  }
  
  .dark .ql-container.ql-snow {
    border-color: #374151 !important;
  }
  
  .dark .ql-editor {
    color: #e5e7eb !important;
    background-color: #111827 !important;
  }
  
  .dark .ql-snow .ql-stroke {
    stroke: #9ca3af !important;
  }
  
  .dark .ql-snow .ql-fill, .dark .ql-snow .ql-stroke.ql-fill {
    fill: #9ca3af !important;
  }
  
  .dark .ql-snow .ql-picker {
    color: #9ca3af !important;
  }
  
  .dark .ql-snow .ql-picker-options {
    background-color: #1f2937 !important;
    border-color: #374151 !important;
  }
  
  .dark .ql-editor.ql-blank::before {
    color: #6b7280 !important;
  }
  
  /* Fix editor container height */
  .quill {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .quill .ql-container {
    flex: 1;
    overflow: auto;
  }
`;

interface EditDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDescription: string;
  onSave: (newDescription: string) => Promise<void>;
  taskTitle: string; // To display in the modal header
}

export function EditDescriptionModal({
  isOpen,
  onClose,
  initialDescription,
  onSave,
  taskTitle
}: EditDescriptionModalProps) {
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Handle client-side only rendering for the editor
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset description when modal opens with new initial data
  useEffect(() => {
    if (isOpen) {
      setDescription(initialDescription);
      setIsSaving(false);
      setError(null);
    }
  }, [isOpen, initialDescription]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(description);
      onClose(); // Close modal on successful save
    } catch (err) {
      console.error("Failed to save description:", err);
      setError("Failed to save description. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Define React Quill modules and formats for the editor
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{'list': 'ordered'}, {'list': 'bullet'}],
      ['link'],
      ['clean']
    ],
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'link'
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300 ease-out" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {/* Add the custom styles */}
      <style>{customEditorStyles}</style>
      
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] max-h-[800px] flex flex-col overflow-hidden transform transition-all duration-300 ease-out scale-100">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">
            Edit Description: <span className="font-normal">{taskTitle}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Body - Rich Text Editor */}
        <div className="flex-grow p-4 overflow-hidden">
          {mounted && (
            <div className="h-full">
              <ReactQuill
                theme="snow"
                value={description}
                onChange={setDescription}
                modules={modules}
                formats={formats}
                placeholder="Enter task description here..."
                className="h-[calc(100%-48px)] text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-md"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="ml-auto flex space-x-3">
             <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {isSaving ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              {isSaving ? 'Saving...' : 'Save Description'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 
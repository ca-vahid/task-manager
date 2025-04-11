"use client";

import React, { useEffect, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface QuillEditorWrapperProps {
  value: string;
  onChange: (value: string) => void;
}

// Custom CSS for dark mode and fixing editor layout issues
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

export function QuillEditorWrapper({ value, onChange }: QuillEditorWrapperProps) {
  // Ensure we wait for hydration to complete
  const [isHydrated, setIsHydrated] = useState(false);
  
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Define React Quill modules and formats
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

  // During SSR or before hydration, return a placeholder
  if (!isHydrated) {
    return (
      <div className="w-full h-full bg-gray-50 dark:bg-gray-800 rounded-md animate-pulse"></div>
    );
  }

  return (
    <>
      <style>{customEditorStyles}</style>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder="Enter task description here..."
        className="h-[calc(100%-48px)] text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-md"
      />
    </>
  );
} 
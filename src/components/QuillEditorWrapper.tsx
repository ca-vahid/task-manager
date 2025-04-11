"use client";

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
}

// Custom CSS for the editor
const editorStyles = `
  /* Light mode styles */
  .ProseMirror {
    min-height: 200px;
    height: 100%;
    padding: 1rem;
    border-radius: 0.375rem;
    border: 1px solid #e5e7eb;
    outline: none;
    background-color: white;
    color: #374151;
    overflow-y: auto;
  }
  
  .ProseMirror:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }
  
  /* Dark mode styles */
  .dark .ProseMirror {
    background-color: #1f2937;
    border-color: #374151;
    color: #e5e7eb;
  }
  
  .dark .ProseMirror:focus {
    border-color: #818cf8;
    box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.2);
  }
  
  /* Content styling */
  .ProseMirror p {
    margin-bottom: 0.75rem;
  }
  
  .ProseMirror h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1rem;
    margin-top: 1.5rem;
  }
  
  .ProseMirror h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    margin-top: 1.25rem;
  }
  
  .ProseMirror h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    margin-top: 1rem;
  }
  
  .ProseMirror ul, .ProseMirror ol {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }
  
  .ProseMirror ul {
    list-style-type: disc;
  }
  
  .ProseMirror ol {
    list-style-type: decimal;
  }
  
  .ProseMirror li {
    margin-bottom: 0.25rem;
  }
  
  .ProseMirror a {
    color: #4f46e5;
    text-decoration: underline;
  }
  
  .dark .ProseMirror a {
    color: #818cf8;
  }
  
  /* Placeholder */
  .ProseMirror p.is-editor-empty:first-child::before {
    color: #9ca3af;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
  
  .dark .ProseMirror p.is-editor-empty:first-child::before {
    color: #6b7280;
  }
  
  /* Toolbar */
  .tiptap-toolbar {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.5rem;
    background-color: #f9fafb;
    border-top-left-radius: 0.375rem;
    border-top-right-radius: 0.375rem;
  }
  
  .dark .tiptap-toolbar {
    background-color: #1f2937;
    border-color: #374151;
  }
  
  .tiptap-toolbar button {
    padding: 0.25rem 0.5rem;
    margin-right: 0.25rem;
    margin-bottom: 0.25rem;
    border-radius: 0.25rem;
    background-color: white;
    border: 1px solid #e5e7eb;
    color: #374151;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .dark .tiptap-toolbar button {
    background-color: #374151;
    border-color: #4b5563;
    color: #e5e7eb;
  }
  
  .tiptap-toolbar button:hover {
    background-color: #f3f4f6;
  }
  
  .dark .tiptap-toolbar button:hover {
    background-color: #4b5563;
  }
  
  .tiptap-toolbar button.is-active {
    background-color: #6366f1;
    border-color: #6366f1;
    color: white;
  }
  
  .dark .tiptap-toolbar button.is-active {
    background-color: #818cf8;
    border-color: #818cf8;
  }
  
  .tiptap-toolbar button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export function QuillEditorWrapper({ value, onChange }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base dark:prose-invert focus:outline-none max-w-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Update content when value prop changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="w-full h-full bg-gray-50 dark:bg-gray-800 rounded-md animate-pulse"></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <style>{editorStyles}</style>
      
      <div className="tiptap-toolbar">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="Bold"
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="Italic"
        >
          Italic
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
          title="Heading 1"
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
          title="Heading 2"
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
          title="Heading 3"
        >
          H3
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          title="Bullet List"
        >
          Bullet List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          title="Ordered List"
        >
          Ordered List
        </button>
        <button
          onClick={() => {
            const url = window.prompt('URL')
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }}
          className={editor.isActive('link') ? 'is-active' : ''}
          title="Link"
        >
          Link
        </button>
        <button
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive('link')}
          title="Remove Link"
        >
          Unlink
        </button>
      </div>
      
      <div className="flex-grow">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
} 
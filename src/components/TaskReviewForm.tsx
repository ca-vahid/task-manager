"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Technician, Group, PriorityLevel, Category } from '@/lib/types';
import dynamic from 'next/dynamic';

// Import editor component
const DynamicQuillEditor = dynamic(
  async () => {
    const { QuillEditor } = await import('./AddTaskForm');
    // Create a wrapper component that matches the expected props
    const DynamicEditor = ({ value, onChange, placeholder }: { value: string, onChange: (value: string) => void, placeholder?: string }) => (
      <div className="h-32 task-review-editor">
        <QuillEditor value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    );
    
    // Add display name
    DynamicEditor.displayName = 'DynamicQuillEditor';
    
    return DynamicEditor;
  },
  { ssr: false, loading: () => <div className="p-3 border-2 border-gray-300 dark:border-gray-700 rounded-md h-32 animate-pulse bg-gray-50 dark:bg-gray-800/50"></div> }
);

interface ParsedTask {
  title: string;
  details: string;
  assignee: string | null;
  group: string | null;
  category: string | null;
  dueDate: string | null;
  priority: string;
  ticketNumber: string | null;
  externalUrl: string | null;
}

interface TaskReviewFormProps {
  parsedTasks: ParsedTask[];
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  onSubmit: (tasks: ParsedTask[]) => Promise<void>;
  onBack: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
  isThinkingModel?: boolean;
}

export function TaskReviewForm({ 
  parsedTasks, 
  technicians, 
  groups,
  categories,
  onSubmit, 
  onBack,
  onCreateGroup,
  isThinkingModel = false
}: TaskReviewFormProps) {
  const [editedTasks, setEditedTasks] = useState<ParsedTask[]>(parsedTasks);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [processingGroup, setProcessingGroup] = useState(false);
  
  // Track AI-matched fields for visual indicators
  const [aiMatchedFields, setAiMatchedFields] = useState<{[taskIndex: number]: {[field: string]: boolean}}>({});
  
  // On initial load, track all pre-filled fields as AI-matched
  useEffect(() => {
    const initialMatches: {[taskIndex: number]: {[field: string]: boolean}} = {};
    
    parsedTasks.forEach((task, index) => {
      initialMatches[index] = {};
      
      // Check each field that should be highlighted
      if (task.title) initialMatches[index].title = true;
      if (task.details) initialMatches[index].details = true;
      if (task.assignee) initialMatches[index].assignee = true;
      if (task.group) initialMatches[index].group = true;
      if (task.category) initialMatches[index].category = true;
      if (task.dueDate) initialMatches[index].dueDate = true;
      if (task.priority) initialMatches[index].priority = true;
    });
    
    setAiMatchedFields(initialMatches);
  }, [parsedTasks]);
  
  // Handle field changes for a specific task
  const handleTaskChange = (index: number, field: keyof ParsedTask, value: any) => {
    const updatedTasks = [...editedTasks];
    updatedTasks[index] = { ...updatedTasks[index], [field]: value };
    setEditedTasks(updatedTasks);
    
    // If a field is manually changed, remove the AI-matched flag
    setAiMatchedFields(prev => {
      const updated = {...prev};
      if (updated[index] && updated[index][field]) {
        updated[index] = {...updated[index], [field]: false};
      }
      return updated;
    });
  };
  
  // Handle final submission
  const handleSubmit = async () => {
    if (editedTasks.length === 0) {
      setError('No tasks to submit');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await onSubmit(editedTasks);
      // Success! The modal will close but we should still reset the loading state
      // in case the component doesn't unmount immediately
      setIsSubmitting(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add tasks');
      setIsSubmitting(false);
    }
  };
  
  // Handle creating a new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !onCreateGroup) {
      return;
    }
    
    setProcessingGroup(true);
    
    try {
      const newGroup = await onCreateGroup(newGroupName.trim(), newGroupDescription.trim());
      
      // Update UI with new group
      groups.push(newGroup);
      
      // Clear form
      setShowNewGroupForm(false);
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (err: any) {
      setError(err.message || "Failed to create new group.");
    } finally {
      setProcessingGroup(false);
    }
  };
  
  // Handle removing a task
  const handleRemoveTask = (index: number) => {
    setEditedTasks(editedTasks.filter((_, i) => i !== index));
  };
  
  // Prioritize matching technicians by name
  const findBestTechnicianMatch = (name: string | null): string => {
    if (!name) return '';
    
    const normalizedName = name.toLowerCase().trim();
    
    // Try to find an exact match
    const exactMatch = technicians.find(tech => 
      tech.name.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) return exactMatch.id;
    
    // Try if any technician name contains the input name
    const containsMatch = technicians.find(tech => 
      tech.name.toLowerCase().trim().includes(normalizedName)
    );
    if (containsMatch) return containsMatch.id;
    
    // Try if the input name contains any technician name
    const reverseContainsMatch = technicians.find(tech => 
      normalizedName.includes(tech.name.toLowerCase().trim())
    );
    if (reverseContainsMatch) return reverseContainsMatch.id;
    
    // Try if the input name contains any part (word) of any technician name
    for (const tech of technicians) {
      const techNameParts = tech.name.toLowerCase().trim().split(/\s+/);
      for (const part of techNameParts) {
        if (normalizedName.includes(part) && part.length > 1) {
          return tech.id;
        }
      }
    }
    
    // Try if any part of the input name matches any part of any technician name
    const nameParts = normalizedName.split(/\s+/);
    for (const part of nameParts) {
      if (part.length < 2) continue; // Skip very short parts
      
      const partMatch = technicians.find(tech => {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        return techParts.some(techPart => techPart.includes(part) || part.includes(techPart));
      });
      
      if (partMatch) return partMatch.id;
    }
    
    return '';
  };
  
  // Prioritize matching groups by name
  const findBestGroupMatch = (name: string | null): string => {
    if (!name) return '';
    
    // Try to find an exact match
    const exactMatch = groups.find(group => 
      group.name.toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) return exactMatch.id;
    
    // Try to find a partial match
    const partialMatch = groups.find(group => 
      group.name.toLowerCase().includes(name.toLowerCase()) || 
      name.toLowerCase().includes(group.name.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;
    
    return '';
  };
  
  // Prioritize matching categories by value
  const findBestCategoryMatch = (categoryName: string | null): string => {
    if (!categoryName) return '';
    
    // Try to find an exact match
    const exactMatch = categories.find(category => 
      category.value.toLowerCase() === categoryName.toLowerCase()
    );
    if (exactMatch) return exactMatch.id;
    
    // Try to find a partial match
    const partialMatch = categories.find(category => 
      category.value.toLowerCase().includes(categoryName.toLowerCase()) || 
      categoryName.toLowerCase().includes(category.value.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;
    
    return '';
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          Review Tasks ({editedTasks.length})
          {isThinkingModel && (
            <span className="ml-2 px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 flex items-center">
              <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Thinking Model
            </span>
          )}
        </h3>
        
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
            disabled={isSubmitting}
          >
            Back
          </button>
          
          <button
            type="button"
            onClick={handleSubmit}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center space-x-1 disabled:opacity-50"
            disabled={isSubmitting || editedTasks.length === 0}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Adding Tasks...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Add All Tasks</span>
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* New group form */}
      {showNewGroupForm && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800 mb-4">
          <h4 className="text-sm font-medium text-indigo-800 dark:text-indigo-300 mb-2">Create New Group</h4>
          <div className="space-y-3">
            <div>
              <input 
                type="text" 
                placeholder="Group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800"
              />
            </div>
            <div>
              <input 
                type="text" 
                placeholder="Description (optional)"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2 bg-white dark:bg-gray-800"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || processingGroup}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center"
              >
                {processingGroup ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : "Create Group"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewGroupForm(false)}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Task cards */}
      <div className="space-y-3">
        {editedTasks.map((task, index) => (
          <div 
            key={index} 
            className={`border rounded-lg p-3 bg-white dark:bg-gray-800 shadow-sm ${
              isThinkingModel 
                ? 'border-purple-200 dark:border-purple-800'
                : 'border-blue-100 dark:border-blue-900'
            }`}
          >
            {/* Task header with title and remove button */}
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={task.title}
                  onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                  className={`w-full text-md font-medium rounded-md ${
                    aiMatchedFields[index]?.title
                      ? isThinkingModel 
                        ? 'border border-purple-300 dark:border-purple-700' 
                        : 'border border-blue-300 dark:border-blue-700'
                      : 'border border-gray-300 dark:border-gray-700'
                  } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800`}
                  placeholder="Task title"
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveTask(index)}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            {/* Task details - Use rich text editor with reduced height */}
            <div className="mb-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Details
              </label>
              <DynamicQuillEditor
                value={task.details || ''}
                onChange={(value) => handleTaskChange(index, 'details', value)}
                placeholder="Task details"
              />
            </div>
            
            {/* Task metadata - All on one line */}
            <div className="grid grid-cols-3 gap-2">
              {/* Assignee */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Assignee
                </label>
                <select
                  value={findBestTechnicianMatch(task.assignee)}
                  onChange={(e) => {
                    const techId = e.target.value;
                    const techName = techId 
                      ? technicians.find(t => t.id === techId)?.name || null 
                      : null;
                    handleTaskChange(index, 'assignee', techName);
                  }}
                  className={`w-full rounded-md text-sm ${
                    aiMatchedFields[index]?.assignee
                      ? isThinkingModel 
                        ? 'border border-purple-300 dark:border-purple-700' 
                        : 'border border-blue-300 dark:border-blue-700'
                      : 'border border-gray-300 dark:border-gray-700'
                  } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800`}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Category
                </label>
                <select
                  value={findBestCategoryMatch(task.category)}
                  onChange={(e) => {
                    const categoryId = e.target.value;
                    const categoryValue = categoryId 
                      ? categories.find(c => c.id === categoryId)?.value || null 
                      : null;
                    handleTaskChange(index, 'category', categoryValue);
                  }}
                  className={`w-full rounded-md text-sm ${
                    aiMatchedFields[index]?.category
                      ? isThinkingModel 
                        ? 'border border-purple-300 dark:border-purple-700' 
                        : 'border border-blue-300 dark:border-blue-700'
                      : 'border border-gray-300 dark:border-gray-700'
                  } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800`}
                >
                  <option value="">No Category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.value}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Due date */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={task.dueDate || ''}
                  onChange={(e) => handleTaskChange(index, 'dueDate', e.target.value)}
                  className={`w-full rounded-md text-sm ${
                    aiMatchedFields[index]?.dueDate
                      ? isThinkingModel 
                        ? 'border border-purple-300 dark:border-purple-700' 
                        : 'border border-blue-300 dark:border-blue-700'
                      : 'border border-gray-300 dark:border-gray-700'
                  } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800`}
                />
              </div>
              
              {/* Hidden fields to preserve data */}
              <input type="hidden" value={task.priority || 'Medium'} />
              <input type="hidden" value={findBestGroupMatch(task.group) || ''} />
            </div>
          </div>
        ))}
        
        {editedTasks.length === 0 && (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            No tasks found. Please go back and try again.
          </div>
        )}
      </div>
    </div>
  );
}

TaskReviewForm.displayName = 'TaskReviewForm'; 
"use client";

import React, { useState, useEffect, useCallback, memo } from 'react';
import { Technician, Group, PriorityLevel, Category } from '@/lib/types';
// Import the simplified QuillEditor directly
import { QuillEditor } from './AddTaskForm';

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

// Define props for the new TaskReviewCard component
interface TaskReviewCardProps {
  task: ParsedTask;
  index: number;
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  aiMatchedFields: {[field: string]: boolean};
  isThinkingModel: boolean;
  handleTaskChange: (index: number, field: keyof ParsedTask, value: any) => void;
  handleRemoveTask: (index: number) => void;
  findBestTechnicianMatch: (name: string | null) => string;
  findBestCategoryMatch: (categoryName: string | null) => string;
  findBestGroupMatch: (name: string | null) => string;
  setShowNewGroupForm: (show: boolean) => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>; // Keep this optional for button visibility
}

// Create the memoized TaskReviewCard component
const TaskReviewCard = memo(({
  task,
  index,
  technicians,
  groups,
  categories,
  aiMatchedFields,
  isThinkingModel,
  handleTaskChange,
  handleRemoveTask,
  findBestTechnicianMatch,
  findBestCategoryMatch,
  findBestGroupMatch,
  setShowNewGroupForm,
  onCreateGroup
}: TaskReviewCardProps) => {
  // Use refs to prevent focus jumping between elements
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  
  // Add debug logging for the task details
  React.useEffect(() => {
    console.log(`Task ${index} details:`, task.details ? task.details.substring(0, 100) : 'empty');
  }, [index, task.details]);
  
  // Memoize the handler for the title input
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleTaskChange(index, 'title', e.target.value);
  }, [index, handleTaskChange]);

  // Memoize the handler for the Quill editor (details)
  const handleDetailsChange = useCallback((value: string) => {
    console.log(`Updating task ${index} details to:`, value.substring(0, 100));
    handleTaskChange(index, 'details', value);
  }, [index, handleTaskChange]);
  
  return (
    <div 
      className={`task-card border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm relative ${
        isThinkingModel 
          ? 'border-purple-200 dark:border-purple-800'
          : 'border-blue-100 dark:border-blue-900'
      }`}
    >
      {/* Task header with title and remove button */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Title
          </label>
          <input
            ref={titleInputRef}
            type="text"
            value={task.title}
            onChange={handleTitleChange}
            className={`w-full text-md font-medium rounded-md ${
              aiMatchedFields?.title
                ? isThinkingModel 
                  ? 'border border-purple-300 dark:border-purple-700' 
                  : 'border border-blue-300 dark:border-blue-700'
                : 'border border-gray-300 dark:border-gray-700'
            } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800 p-2 direction-ltr`}
            placeholder="Task title"
            dir="ltr"
          />
        </div>
        <button
          type="button"
          onClick={() => handleRemoveTask(index)}
          className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 ml-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      
      {/* Two-column layout with details on left, fields on right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left column - Task details - now 75% width (9/12) */}
        <div className="relative z-0 overflow-hidden rounded-md h-full md:col-span-9">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Details
          </label>
          <div className="overflow-hidden h-full rounded-md border border-gray-300 dark:border-gray-700">
            <QuillEditor
              value={task.details || ''}
              onChange={handleDetailsChange}
              placeholder="Task details"
            />
          </div>
        </div>
        
        {/* Right column - Task metadata fields - now 25% width (3/12) */}
        <div className="space-y-3 md:col-span-3">
          {/* Assignee */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Assignee (Technician)
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
                aiMatchedFields?.assignee
                  ? isThinkingModel 
                    ? 'border border-purple-300 dark:border-purple-700' 
                    : 'border border-blue-300 dark:border-blue-700'
                  : 'border border-gray-300 dark:border-gray-700'
              } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800 p-2`}
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
                aiMatchedFields?.category
                  ? isThinkingModel 
                    ? 'border border-purple-300 dark:border-purple-700' 
                    : 'border border-blue-300 dark:border-blue-700'
                  : 'border border-gray-300 dark:border-gray-700'
              } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800 p-2`}
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
                aiMatchedFields?.dueDate
                  ? isThinkingModel 
                    ? 'border border-purple-300 dark:border-purple-700' 
                    : 'border border-blue-300 dark:border-blue-700'
                  : 'border border-gray-300 dark:border-gray-700'
              } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800 p-2`}
            />
          </div>
          
          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Priority
            </label>
            <select
              value={task.priority || 'Medium'}
              onChange={(e) => handleTaskChange(index, 'priority', e.target.value)}
              className={`w-full rounded-md text-sm ${
                aiMatchedFields?.priority
                  ? isThinkingModel 
                    ? 'border border-purple-300 dark:border-purple-700' 
                    : 'border border-blue-300 dark:border-blue-700'
                  : 'border border-gray-300 dark:border-gray-700'
              } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800 p-2`}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          
          {/* Group */}
          <div>
            <div className="flex justify-between items-center">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Group
              </label>
              {onCreateGroup && (
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  New Group
                </button>
              )}
            </div>
            <select
              value={findBestGroupMatch(task.group)}
              onChange={(e) => {
                const groupId = e.target.value;
                const groupName = groupId 
                  ? groups.find(g => g.id === groupId)?.name || null 
                  : null;
                handleTaskChange(index, 'group', groupName);
              }}
              className={`w-full rounded-md text-sm ${
                aiMatchedFields?.group
                  ? isThinkingModel 
                    ? 'border border-purple-300 dark:border-purple-700' 
                    : 'border border-blue-300 dark:border-blue-700'
                  : 'border border-gray-300 dark:border-gray-700'
              } shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 bg-white dark:bg-gray-800 p-2`}
            >
              <option value="">No Group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
});
TaskReviewCard.displayName = 'TaskReviewCard';


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
  const [editedTasks, setEditedTasks] = useState<ParsedTask[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [processingGroup, setProcessingGroup] = useState(false);
  
  // Initialize tasks from parsedTasks prop
  useEffect(() => {
    console.log('Initializing from parsedTasks:', parsedTasks.length, 'tasks');
    parsedTasks.forEach((task, i) => {
      console.log(`Task ${i} initial details:`, task.details ? task.details.substring(0, 100) : 'empty');
    });
    
    // Create a deep copy to avoid reference issues
    const tasksCopy = parsedTasks.map(task => ({...task}));
    setEditedTasks(tasksCopy);
  }, [parsedTasks]);
  
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
  
  // Handle field changes for a specific task - MEMOIZED
  const handleTaskChange = useCallback((index: number, field: keyof ParsedTask, value: any) => {
    setEditedTasks(prevTasks => {
      const updatedTasks = [...prevTasks];
      updatedTasks[index] = { ...updatedTasks[index], [field]: value };
      return updatedTasks;
    });
    
    // If a field is manually changed, remove the AI-matched flag
    setAiMatchedFields(prev => {
      const updated = {...prev};
      // Ensure index exists before trying to access it
      if (updated[index] && updated[index][field]) {
        updated[index] = {...updated[index], [field]: false};
      }
      return updated;
    });
  }, []); // Empty dependency array as it uses setter function form
  
  // Handle final submission
  const handleSubmit = useCallback(async () => {
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
  }, [editedTasks, onSubmit]);
  
  // Handle creating a new group - MEMOIZED
  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim() || !onCreateGroup) {
      return;
    }
    
    setProcessingGroup(true);
    
    try {
      const newGroup = await onCreateGroup(newGroupName.trim(), newGroupDescription.trim());
      
      // Update UI with new group
      // Note: Modifying props directly like this isn't ideal, 
      // but might be necessary if `groups` isn't updated higher up.
      // A better approach would be to lift state or have a callback to update groups.
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
  }, [newGroupName, newGroupDescription, onCreateGroup, groups]);
  
  // Handle removing a task - MEMOIZED
  const handleRemoveTask = useCallback((index: number) => {
    setEditedTasks(prevTasks => prevTasks.filter((_, i) => i !== index));
    // Also remove associated AI matched fields if necessary
    setAiMatchedFields(prev => {
      const updated = {...prev};
      delete updated[index];
      // Adjust subsequent indices if needed, though filtering might handle this implicitly
      // depending on how keys are used
      return updated;
    });
  }, []);
  
  // Prioritize matching technicians by name - MEMOIZED
  const findBestTechnicianMatch = useCallback((name: string | null): string => {
    if (!name) return '';
    if (typeof name !== 'string' || name.trim() === '') return '';
    const normalizedName = name.toLowerCase().trim();
    
    const exactMatch = technicians.find(tech => tech.name.toLowerCase().trim() === normalizedName);
    if (exactMatch) return exactMatch.id;
    
    const containsMatch = technicians.find(tech => tech.name.toLowerCase().trim().includes(normalizedName));
    if (containsMatch) return containsMatch.id;
    
    const reverseContainsMatch = technicians.find(tech => normalizedName.includes(tech.name.toLowerCase().trim()));
    if (reverseContainsMatch) return reverseContainsMatch.id;
    
    const nameParts = normalizedName.split(/\s+/);
    if (nameParts.length > 1) {
      for (const tech of technicians) {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        if (techParts.length > 1 && nameParts.length > 1) {
          if (techParts[0].includes(nameParts[0]) || nameParts[0].includes(techParts[0])) {
            if (techParts[techParts.length-1].includes(nameParts[nameParts.length-1]) || 
                nameParts[nameParts.length-1].includes(techParts[techParts.length-1])) {
              return tech.id;
            }
          }
        }
      }
    }
    
    for (const part of nameParts) {
      if (part.length < 2) continue;
      const partMatch = technicians.find(tech => {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        return techParts.some(techPart => techPart.includes(part) || part.includes(techPart));
      });
      if (partMatch) return partMatch.id;
    }
    
    if (nameParts.length > 1) {
      const initials = nameParts.map(part => part[0]).join('').toLowerCase();
      for (const tech of technicians) {
        const techParts = tech.name.toLowerCase().trim().split(/\s+/);
        const techInitials = techParts.map(part => part[0]).join('');
        if (techInitials === initials) return tech.id;
      }
    }
    return '';
  }, [technicians]);
  
  // Prioritize matching groups by name - MEMOIZED
  const findBestGroupMatch = useCallback((name: string | null): string => {
    if (!name) return '';
    const exactMatch = groups.find(group => group.name.toLowerCase() === name.toLowerCase());
    if (exactMatch) return exactMatch.id;
    const partialMatch = groups.find(group => 
      group.name.toLowerCase().includes(name.toLowerCase()) || 
      name.toLowerCase().includes(group.name.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;
    return '';
  }, [groups]);
  
  // Prioritize matching categories by value - MEMOIZED
  const findBestCategoryMatch = useCallback((categoryName: string | null): string => {
    if (!categoryName) return '';
    if (typeof categoryName !== 'string' || categoryName.trim() === '') return '';
    const normalizedName = categoryName.toLowerCase().trim();
    
    const exactMatch = categories.find(category => category.value.toLowerCase().trim() === normalizedName);
    if (exactMatch) return exactMatch.id;
    
    const partialMatch = categories.find(category => 
      category.value.toLowerCase().trim().includes(normalizedName) || 
      normalizedName.includes(category.value.toLowerCase().trim())
    );
    if (partialMatch) return partialMatch.id;
    
    const categoryWords = normalizedName.split(/\s+/);
    if (categoryWords.length > 1) {
      for (const category of categories) {
        const categoryValueWords = category.value.toLowerCase().trim().split(/\s+/);
        let matchingWords = 0;
        for (const word of categoryWords) {
          if (word.length < 3) continue;
          if (categoryValueWords.some(catWord => catWord.includes(word) || word.includes(catWord))) {
            matchingWords++;
          }
        }
        if (matchingWords > 0 && matchingWords >= Math.ceil(categoryWords.length/2)) {
          return category.id;
        }
      }
    }
    return '';
  }, [categories]);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10 py-2">
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
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      
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
      <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 pb-2">
        {editedTasks.map((task, index) => (
          // Use the memoized TaskReviewCard component here
          <TaskReviewCard
            key={`task-${index}`} // Use stable key with index only
            task={task}
            index={index}
            technicians={technicians}
            groups={groups}
            categories={categories}
            aiMatchedFields={aiMatchedFields[index] || {}} // Pass relevant part of aiMatchedFields
            isThinkingModel={isThinkingModel}
            handleTaskChange={handleTaskChange}
            handleRemoveTask={handleRemoveTask}
            findBestTechnicianMatch={findBestTechnicianMatch}
            findBestCategoryMatch={findBestCategoryMatch}
            findBestGroupMatch={findBestGroupMatch}
            setShowNewGroupForm={setShowNewGroupForm}
            onCreateGroup={onCreateGroup}
          />
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
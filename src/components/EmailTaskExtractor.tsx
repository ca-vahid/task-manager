'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Task, Technician, TaskStatus, Group, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { TaskReviewForm } from './TaskReviewForm';

interface EmailTaskExtractorProps {
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  currentOrderCount: number;
  onAddTasks: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

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

export function EmailTaskExtractor({
  technicians,
  groups,
  categories,
  currentOrderCount,
  onAddTasks,
  onCancel,
  onCreateGroup
}: EmailTaskExtractorProps) {
  // File and drop related states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamedOutput, setStreamedOutput] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamOutputRef = useRef<HTMLDivElement>(null);

  // Model and View states
  const [useThinkingModel, setUseThinkingModel] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showInputView, setShowInputView] = useState(true);
  const [showProcessingView, setShowProcessingView] = useState(false);
  const [showReviewView, setShowReviewView] = useState(false);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);

  // Clean up function for the progress interval
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Auto-scroll to the bottom of the output when it changes
  useEffect(() => {
    if (streamOutputRef.current) {
      streamOutputRef.current.scrollTop = streamOutputRef.current.scrollHeight;
    }
  }, [streamedOutput]);

  // Function to handle file selection from the file picker
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndSetFile(file);
    }
  };
  
  // Validate and set the file
  const validateAndSetFile = (file: File) => {
    // Get file extension
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    // Validate file type - accept .eml and .msg files
    if (fileExt === 'eml' || fileExt === 'msg') {
      setSelectedFile(file);
      setStreamedOutput('');
      setError(null);
    } else {
      setError('Please select an Outlook email file (.eml or .msg)');
    }
  };

  // Function to handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };
  
  // Handle drag enter/leave events to give visual feedback
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  // Prevent default behavior for drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Toggle the thinking model option
  const toggleThinkingModel = () => {
    setUseThinkingModel(prev => !prev);
  };
  
  // Toggle the transcript visibility
  const toggleTranscript = () => {
    setShowTranscript(prev => !prev);
  };

  // Function to analyze email and extract tasks
  const handleAnalyzeEmail = async () => {
    if (!selectedFile) {
      setError('Please select an email file (.eml or .msg)');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setStreamedOutput('');
    setUploadProgress(0);
    setShowInputView(false);
    setShowProcessingView(true);
    
    // Start progress animation
    progressIntervalRef.current = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 95) {
          return prev;
        }
        
        // Simulate progress with a curve that slows down as it approaches 95%
        const increment = (95 - prev) / 20;
        return Math.min(prev + increment, 95);
      });
    }, 300);
    
    try {
      // Create a FormData to send the file
      const formData = new FormData();
      formData.append('emailFile', selectedFile);
      formData.append('useThinkingModel', useThinkingModel.toString());
      
      // Send the request to the API
      const response = await fetch('/api/email/analyze', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || `Error: ${response.status} ${response.statusText}`;
        } catch (e) {
          errorMessage = errorText || `Error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      // Make sure the response body exists
      if (!response.body) {
        throw new Error('Response body is not available');
      }
      
      // We'll handle streaming here with error handling
      const reader = response.body.getReader();
      let receivedText = '';
      
      // Read the stream until it's done
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode the chunk and add to the streamed output
          const chunk = new TextDecoder().decode(value);
          receivedText += chunk;
          setStreamedOutput(receivedText);
        }
        
        // Try to extract JSON tasks from the output
        const parsedResults = extractTasksFromOutput(receivedText);
        if (parsedResults && parsedResults.length > 0) {
          setParsedTasks(parsedResults);
          setShowProcessingView(false);
          setShowReviewView(true);
        } else {
          // Better error message for no tasks
          if (receivedText.includes('Analysis complete')) {
            setError('No tasks were identified in the email. The AI analysis completed, but did not find actionable items.');
          } else {
            setError('Failed to extract tasks from the email. The response format was not as expected.');
          }
        }
      } catch (streamErr) {
        console.error('Stream reading error:', streamErr);
        throw new Error(`Error reading response stream: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}`);
      }
    } catch (err: any) {
      console.error('Failed to analyze email:', err);
      setError(`Error analyzing email: ${err.message}`);
      setShowProcessingView(false);
      setShowInputView(true);
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setUploadProgress(100);
      setIsProcessing(false);
    }
  };

  // Extract tasks from the AI response
  const extractTasksFromOutput = (text: string): ParsedTask[] | null => {
    try {
      // First, try a very specific check for the exact Gemini thinking model format seen in the error
      // This format has the schema definition with embedded task examples
      const thinkingModelMatch = text.match(/```json[\s\S]*?```/);
      if (thinkingModelMatch) {
        // Extract JSON content from markdown code block
        const jsonText = thinkingModelMatch[0].replace(/```json|```/g, '').trim();
        try {
          const parsedSchema = JSON.parse(jsonText);
          
          // Check if this matches our observed pattern with items array containing task examples
          if (parsedSchema.properties?.tasks?.items && Array.isArray(parsedSchema.properties.tasks.items)) {
            const taskExamples = parsedSchema.properties.tasks.items;
            const validTasks = taskExamples.filter((item: any) => item && item.title && item.details);
            if (validTasks.length > 0) {
              return validTasks;
            }
          }
        } catch (e) {
          console.log('Error parsing specific thinking model format:', e);
        }
      }
      
      // Continue with the general approach
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        
        // Standard response format
        if (parsedData.tasks && Array.isArray(parsedData.tasks)) {
          return parsedData.tasks;
        }
        
        // Handle the thinking model schema-like response format
        if (parsedData.properties && parsedData.properties.tasks) {
          // Case 1: When tasks property has items that are task objects
          if (parsedData.properties.tasks.items && Array.isArray(parsedData.properties.tasks.items)) {
            return parsedData.properties.tasks.items.filter((item: any) => item.title && item.details);
          }
          
          // Case 2: When tasks property contains a general schema with nested examples
          if (parsedData.properties.tasks.items && typeof parsedData.properties.tasks.items === 'object') {
            // If we have actual task data embedded in the schema
            if (parsedData.properties.tasks.items.title) {
              return [parsedData.properties.tasks.items];
            }
            
            // Look for additional nested structures that might contain example tasks
            if (parsedData.properties.tasks.items.properties) {
              // Try to construct a task from the schema properties definitions
              const taskSchema = parsedData.properties.tasks.items.properties;
              if (taskSchema.title && taskSchema.details) {
                // Use property description as fallback values if available
                const task: ParsedTask = {
                  title: taskSchema.title.default || taskSchema.title.description || "Extracted Task",
                  details: taskSchema.details.default || taskSchema.details.description || "",
                  assignee: taskSchema.assignee?.default || null,
                  group: taskSchema.group?.default || null,
                  category: taskSchema.category?.default || null,
                  dueDate: taskSchema.dueDate?.default || null,
                  priority: taskSchema.priority?.default || "Medium",
                  ticketNumber: taskSchema.ticketNumber?.default || null,
                  externalUrl: taskSchema.externalUrl?.default || null
                };
                return [task];
              }
            }
          }
        }
        
        // Special handling for the specific response format seen in the error
        if (parsedData.type === "object" && parsedData.properties && 
            parsedData.properties.tasks && parsedData.properties.tasks.type === "array") {
          // Example tasks might be in items array
          if (parsedData.properties.tasks.items && Array.isArray(parsedData.properties.tasks.items)) {
            const foundTasks = parsedData.properties.tasks.items.filter((item: any) => 
              item && typeof item === 'object' && item.title && item.details
            );
            
            if (foundTasks.length > 0) {
              return foundTasks;
            }
          }
        }
      }
      
      // As a last resort, try to extract any task-like objects from the text
      try {
        // Look for anything that might be a task definition
        const taskPattern = /"title":\s*"([^"]+)".*?"details":\s*"([^"]+)"/g;
        const matches = [...text.matchAll(taskPattern)];
        
        if (matches.length > 0) {
          // Attempt to reconstruct tasks from regex matches
          return matches.map(match => {
            const taskText = text.substring(match.index!, match.index! + match[0].length + 200);
            try {
              // Try to parse a JSON object from this section
              const taskObj = JSON.parse(`{${taskText}}`.replace(/}[^}]*$/, "}"));
              if (taskObj.title && taskObj.details) {
                return {
                  title: taskObj.title,
                  details: taskObj.details,
                  assignee: taskObj.assignee || null,
                  group: taskObj.group || null,
                  category: taskObj.category || null,
                  dueDate: taskObj.dueDate || null,
                  priority: taskObj.priority || "Medium",
                  ticketNumber: taskObj.ticketNumber || null,
                  externalUrl: taskObj.externalUrl || null
                };
              }
            } catch (e) {
              // If parsing fails, create a minimal task from what we found
              return {
                title: match[1] || "Extracted Task",
                details: match[2] || "",
                assignee: null,
                group: null,
                category: null,
                dueDate: null,
                priority: "Medium",
                ticketNumber: null,
                externalUrl: null
              };
            }
          }).filter(Boolean) as ParsedTask[];
        }
      } catch (regexError) {
        console.error('Error in fallback task extraction:', regexError);
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting tasks from output:', error);
      return null;
    }
  };

  // When the user submits the reviewed tasks
  const handleSubmitReviewedTasks = async (reviewedTasks: ParsedTask[]) => {
    try {
      setIsProcessing(true);
      
      // Convert parsed tasks to Task format
      const formattedTasks: Omit<Task, 'id'>[] = reviewedTasks.map((task, index) => {
        // Find technician ID by name
        let assigneeId = null;
        if (task.assignee) {
          const technician = technicians.find(tech => 
            tech.name.toLowerCase() === task.assignee?.toLowerCase()
          );
          if (technician) {
            assigneeId = technician.id;
          }
        }
        
        // Find group ID by name
        let groupId = null;
        if (task.group) {
          const group = groups.find(g => 
            g.name.toLowerCase() === task.group?.toLowerCase()
          );
          if (group) {
            groupId = group.id;
          }
        }
        
        // Find category ID by value
        let categoryId = null;
        if (task.category) {
          const category = categories.find(cat => 
            cat.value.toLowerCase() === task.category?.toLowerCase()
          );
          if (category) {
            categoryId = category.id;
          }
        }
        
        // Parse due date if provided
        let dueTimestamp = null;
        if (task.dueDate) {
          try {
            const dueDate = new Date(task.dueDate);
            if (!isNaN(dueDate.getTime())) {
              dueTimestamp = Timestamp.fromDate(dueDate);
            }
          } catch (e) {
            console.error('Error parsing date:', e);
          }
        }
        
        // Map priority string to enum
        let priority: PriorityLevel | null = null;
        if (task.priority) {
          const priorityLower = task.priority.toLowerCase();
          if (priorityLower.includes('high') || priorityLower.includes('critical')) {
            priority = PriorityLevel.High;
          } else if (priorityLower.includes('medium')) {
            priority = PriorityLevel.Medium;
          } else if (priorityLower.includes('low')) {
            priority = PriorityLevel.Low;
          }
        }
        
        return {
          title: task.title,
          explanation: task.details || '',
          status: TaskStatus.Open,
          priorityLevel: priority,
          estimatedCompletionDate: dueTimestamp,
          assigneeId,
          order: currentOrderCount + index,
          tags: ['email-extracted'],
          progress: 0,
          lastUpdated: Timestamp.now(),
          externalUrl: task.externalUrl,
          groupId,
          ticketNumber: task.ticketNumber,
          ticketUrl: null,
          categoryId
        };
      });
      
      // Add tasks via the callback
      await onAddTasks(formattedTasks);
      
      // Call onCancel to close the modal
      onCancel();
    } catch (error) {
      console.error('Error submitting tasks:', error);
      setError('Failed to add tasks');
      setIsProcessing(false);
    }
  };

  // Go back to the upload view
  const handleBackToUpload = () => {
    setShowProcessingView(false);
    setShowReviewView(false);
    setShowInputView(true);
    setStreamedOutput('');
    setError(null);
  };

  return (
    <div className="space-y-4">
      {showInputView && (
        /* Input view - Step 1: Email upload */
        <div className="space-y-4">
          <div>
            <label htmlFor="email-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Upload Outlook Email
            </label>
            
            {/* File drop zone */}
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center ${
                isDragging 
                  ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20' 
                  : selectedFile 
                    ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' 
                    : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
              } transition-colors cursor-pointer`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                id="email-upload"
                ref={fileInputRef}
                accept=".eml,.msg"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <svg className="w-8 h-8 text-green-500 dark:text-green-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-indigo-500 dark:text-indigo-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drag and drop an Outlook email here, or click to browse</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Outlook email files only (.eml, .msg)
                  </p>
                </div>
              )}
            </div>
            
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Drag an email from Outlook directly into this area to extract tasks. The AI will analyze the email content and any attachments to identify potential tasks.
            </p>
          </div>
          
          {/* Thinking model and transcript toggles */}
          <div className="flex flex-wrap items-center gap-3 mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-center cursor-pointer">
              <div className="relative inline-flex items-center">
                <input 
                  type="checkbox" 
                  id="thinking-model-toggle" 
                  className="sr-only"
                  checked={useThinkingModel}
                  onChange={toggleThinkingModel} 
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${useThinkingModel ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <div className={`transform transition-transform duration-200 ease-in-out h-5 w-5 rounded-full bg-white border border-gray-300 inline-block ${useThinkingModel ? 'translate-x-6' : 'translate-x-1'}`} style={{marginTop: '2px'}}></div>
                </div>
                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                  Use Gemini Thinking Model
                </span>
              </div>
            </label>
            <label className="flex items-center cursor-pointer">
              <div className="relative inline-flex items-center">
                <input 
                  type="checkbox" 
                  id="transcript-toggle" 
                  className="sr-only"
                  checked={showTranscript}
                  onChange={toggleTranscript} 
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${showTranscript ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <div className={`transform transition-transform duration-200 ease-in-out h-5 w-5 rounded-full bg-white border border-gray-300 inline-block ${showTranscript ? 'translate-x-6' : 'translate-x-1'}`} style={{marginTop: '2px'}}></div>
                </div>
                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                  Show AI Transcript
                </span>
              </div>
            </label>
            <div className="ml-auto">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {useThinkingModel ? 'Using more advanced model with better accuracy' : 'Standard model for faster results'}
              </span>
            </div>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-md border border-red-200 dark:border-red-800/50">
              {error}
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleAnalyzeEmail}
              disabled={!selectedFile || isProcessing}
              className={`px-4 py-2 text-sm text-white rounded ${
                !selectedFile || isProcessing
                  ? 'bg-blue-400 dark:bg-blue-700 cursor-not-allowed'
                  : 'bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </div>
              ) : "Extract Tasks"}
            </button>
          </div>
        </div>
      )}
      
      {showProcessingView && (
        /* Processing view - Step 2: AI analysis */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Analyzing Email
            </h3>
            <button
              onClick={handleBackToUpload}
              disabled={isProcessing}
              className={`text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Cancel
            </button>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div 
              className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          
          {/* Processing steps */}
          <div className="space-y-1">
            <div className={`text-sm ${uploadProgress > 10 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {uploadProgress > 10 ? "✓ " : ""} Reading email content
            </div>
            <div className={`text-sm ${uploadProgress > 30 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {uploadProgress > 30 ? "✓ " : ""} Processing attachments
            </div>
            <div className={`text-sm ${uploadProgress > 50 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {uploadProgress > 50 ? "✓ " : ""} Analyzing with AI
            </div>
            <div className={`text-sm ${uploadProgress > 80 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {uploadProgress > 80 ? "✓ " : ""} Identifying tasks
            </div>
            <div className={`text-sm ${uploadProgress === 100 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {uploadProgress === 100 ? "✓ " : ""} Processing complete
            </div>
          </div>
          
          {/* AI transcript output */}
          {showTranscript && (
            <div className="mt-4">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                AI Transcript
              </div>
              <div 
                ref={streamOutputRef}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 h-40 overflow-y-auto font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap"
              >
                {streamedOutput || 'Waiting for AI output...'}
              </div>
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-md border border-red-200 dark:border-red-800/50">
              {error}
            </div>
          )}
        </div>
      )}
      
      {showReviewView && (
        /* Review view - Step 3: Review extracted tasks */
        <TaskReviewForm
          parsedTasks={parsedTasks}
          technicians={technicians}
          groups={groups}
          categories={categories}
          onSubmit={handleSubmitReviewedTasks}
          onBack={handleBackToUpload}
          onCreateGroup={onCreateGroup}
          isThinkingModel={useThinkingModel}
        />
      )}
    </div>
  );
} 
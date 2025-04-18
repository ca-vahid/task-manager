"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Task, Technician, TaskStatus, Group, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { TaskReviewForm } from './TaskReviewForm';
// Import PDF.js for PDF text extraction
import * as pdfjsLib from 'pdfjs-dist';
// Import mammoth for Word document extraction
import * as mammoth from 'mammoth';

// Set the worker path directly to the public directory
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface BulkAddTaskFromOpenAIProps {
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  currentOrderCount: number;
  onAddTasks: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

// Define the structure of tasks returned by the API
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

// Simple Toggle Switch Component
interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ id, checked, onChange, label, disabled = false }) => {
  return (
    <div className="flex items-center">
      <label htmlFor={id} className="flex items-center cursor-pointer">
        <div className="relative">
          <input 
            type="checkbox" 
            id={id} 
            className="sr-only" 
            checked={checked} 
            onChange={(e) => !disabled && onChange(e.target.checked)} 
            disabled={disabled}
          />
          <div className={`block w-10 h-6 rounded-full transition ${disabled ? 'bg-gray-300 dark:bg-gray-600' : (checked ? 'bg-blue-500 dark:bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')}`}></div>
          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${checked ? 'translate-x-4' : ''}`}></div>
        </div>
        <div className={`ml-3 text-sm font-medium ${disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
          {label}
        </div>
      </label>
    </div>
  );
};

// JSON highlighting component for better output display
const JsonHighlight: React.FC<{ line: string }> = ({ line }) => {
  // For JSON content, apply proper syntax highlighting with CSS classes
  const formattedLine = line
    // Keys
    .replace(/"([^"]+)":/g, '<span class="text-red-600 dark:text-red-400 font-semibold">&quot;$1&quot;:</span>')
    // String values
    .replace(/: "([^"]+)"/g, ': <span class="text-blue-600 dark:text-blue-400">&quot;$1&quot;</span>')
    // Numbers
    .replace(/: (\d+)(,|$|})/g, ': <span class="text-green-600 dark:text-green-500">$1</span>$2')
    // Booleans
    .replace(/: (true|false)(,|$|})/g, ': <span class="text-amber-600 dark:text-amber-400">$1</span>$2')
    // Null values
    .replace(/: (null)(,|$|})/g, ': <span class="text-gray-600 dark:text-gray-400">null</span>$2')
    // Brackets and braces
    .replace(/([{}\[\]])/g, '<span class="text-gray-700 dark:text-gray-300">$1</span>');
  
  return (
    <div 
      className="leading-relaxed json-line font-mono text-sm"
      dangerouslySetInnerHTML={{ __html: formattedLine }}
    />
  );
};

// Improved HighlightedOutput component with enhanced JSON detection
const HighlightedOutput: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  let jsonMode = false;
  const systemMessages: JSX.Element[] = [];
  const contentLines: JSX.Element[] = [];
  
  // Process each line and categorize
  lines.forEach((line, i) => {
    // JSON detection logic - if a line starts with { or [ or specifically ```json
    if (line.trim().startsWith('{') || line.trim().startsWith('[') || line.trim().startsWith('```json')) {
      jsonMode = true;
      // If the line starts with ```json, strip that prefix
      const cleanLine = line.trim().startsWith('```json') ? line.replace('```json', '') : line;
      contentLines.push(<JsonHighlight key={`json-${i}`} line={cleanLine} />);
      return;
    }
    
    // End of JSON block
    if (jsonMode && line.trim() === '```') {
      jsonMode = false;
      return;
    }
    
    // Continue JSON highlighting if in json mode
    if (jsonMode) {
      contentLines.push(<JsonHighlight key={`json-${i}`} line={line} />);
      return;
    }
    
    // System messages - collect separately with enhanced formatting
    if (line.includes('[System:')) {
      const isOptimizationSummary = line.includes('Successfully optimized:') || 
                                    line.includes('Optimization complete');
                                   
      // Special highlighting for optimization summary
      if (isOptimizationSummary) {
        // Extract task counts for the optimization summary message
        const countMatch = line.match(/(\d+)\s*→\s*(\d+)/);
        let enhancedLine = line;
        
        if (countMatch && countMatch.length >= 3) {
          const originalCount = countMatch[1];
          const finalCount = countMatch[2];
          
          // Replace with enhanced formatting that highlights the numbers
          enhancedLine = line.replace(
            `${originalCount} → ${finalCount}`,
            `<span class="font-bold text-amber-600 dark:text-amber-400">${originalCount}</span> → <span class="font-bold text-green-600 dark:text-green-400">${finalCount}</span>`
          );
        }
        
        systemMessages.push(
          <div 
            key={`system-${i}`} 
            className="leading-relaxed text-gray-800 dark:text-gray-200 font-medium bg-green-100 dark:bg-green-900/30 p-3 rounded-md border-l-4 border-green-500 dark:border-green-600 mt-3 mb-1"
            dangerouslySetInnerHTML={{ __html: enhancedLine }}
          />
        );
      } else {
        // Enhance regular system messages with more vibrant colors
        let enhancedLine = line;
        
        // Apply special colors based on message content
        if (line.includes('Reading document')) {
          enhancedLine = `<span class="text-purple-600 dark:text-purple-400">🧠</span> ${line}`;
        } else if (line.includes('complete') || line.includes('finished')) {
          enhancedLine = `<span class="text-green-600 dark:text-green-400">✅</span> ${line}`;
        } else if (line.includes('Optimizing')) {
          enhancedLine = `<span class="text-amber-600 dark:text-amber-400">⚙️</span> ${line}`;
        } else if (line.includes('Found')) {
          enhancedLine = `<span class="text-blue-600 dark:text-blue-400">🔍</span> ${line}`;
        } else if (line.includes('Failed') || line.includes('Error') || line.includes('Could not')) {
          enhancedLine = `<span class="text-red-600 dark:text-red-400">❌</span> ${line}`;
        }
        
        systemMessages.push(
          <div 
            key={`system-${i}`} 
            className="leading-relaxed text-emerald-600 dark:text-emerald-400 italic mt-2 mb-1"
            dangerouslySetInnerHTML={{ __html: enhancedLine }}
          />
        );
      }
      return;
    }
    
    // Enhanced highlighting for model type indication
    if (line.includes('Using OpenAI')) {
      contentLines.push(
        <div key={`content-${i}`} className="text-orange-600 dark:text-orange-400 font-medium my-1">
          {line}
        </div>
      );
      return;
    }
    
    // Default content 
    contentLines.push(
      <div key={`content-${i}`} className="leading-relaxed">
        {line || <br />}
      </div>
    );
  });
  
  // Return content lines first, then system messages at the end with enhanced styling
  return (
    <>
      {contentLines}
      {systemMessages.length > 0 && (
        <div className="mt-4 sticky bottom-0 bg-white dark:bg-gray-800 pt-3 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          {systemMessages}
        </div>
      )}
    </>
  );
};

export function BulkAddTaskFromOpenAI({
  technicians,
  groups,
  categories,
  currentOrderCount,
  onAddTasks,
  onCancel,
  onCreateGroup
}: BulkAddTaskFromOpenAIProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[] | null>(null);
  const [useThinkingModel, setUseThinkingModel] = useState(false);
  const [isMeetingTranscript, setIsMeetingTranscript] = useState(false);
  const [pdfExtractionStatus, setPdfExtractionStatus] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [processingStep, setProcessingStep] = useState<string>('idle');
  const [modelInfo, setModelInfo] = useState<string>('');
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [streamedOutput, setStreamedOutput] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handler for meeting transcript toggle change
  const handleMeetingTranscriptChange = (checked: boolean) => {
    setIsMeetingTranscript(checked);
    // Automatically enable o3 model when meeting transcript is checked
    if (checked) {
      setUseThinkingModel(true);
    }
  };

  // Handler for model toggle change
  const handleThinkingModelChange = (checked: boolean) => {
    // Allow changing only if meeting transcript is NOT checked
    if (!isMeetingTranscript) {
      setUseThinkingModel(checked);
    }
  };

  // Function to handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Validate file type - accept PDF, DOC, DOCX, TXT files
      const validFileTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (validFileTypes.includes(file.type) || file.name.endsWith('.doc') || file.name.endsWith('.docx') || file.name.endsWith('.txt')) {
        setSelectedFile(file);
        setStreamedOutput('');
        setError(null);
      } else {
        setError('Please select a PDF, DOC, DOCX, or TXT file');
      }
    }
  };
  
  // Function to handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Validate file type - accept PDF, DOC, DOCX, TXT files
      const validFileTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (validFileTypes.includes(file.type) || file.name.endsWith('.doc') || file.name.endsWith('.docx') || file.name.endsWith('.txt')) {
        setSelectedFile(file);
        setStreamedOutput('');
        setError(null);
      } else {
        setError('Please drop a PDF, DOC, DOCX, or TXT file');
      }
    }
  };
  
  // Prevent default behavior for drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  // Main text extraction function that handles different file types
  const extractTextFromFile = async (file: File): Promise<string> => {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    // Handle different file types
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return extractTextFromPdf(file);
    } else if (
      fileType === 'application/msword' || 
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.doc') || 
      fileName.endsWith('.docx')
    ) {
      return extractTextFromWord(file);
    } else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
      return extractTextFromTxt(file);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  };
  
  // Extract text from Word documents
  const extractTextFromWord = async (file: File): Promise<string> => {
    try {
      setPdfExtractionStatus('Extracting text from Word document...');
      
      // Convert file to ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Use mammoth to extract text
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      
      if (!text || text.trim().length === 0) {
        setPdfExtractionStatus('Warning: No text content found in Word document.');
        throw new Error('No text content found in Word document.');
      }
      
      setPdfExtractionStatus(`Successfully extracted ${text.length} characters from Word document.`);
      return text;
    } catch (error: any) {
      console.error('Error extracting text from Word document:', error);
      setPdfExtractionStatus(`Word Document Extraction Error: ${error.message}`);
      throw error;
    }
  };
  
  // Extract text from plain text files
  const extractTextFromTxt = async (file: File): Promise<string> => {
    try {
      setPdfExtractionStatus('Reading text file...');
      
      // Read text file content
      const text = await file.text();
      
      if (!text || text.trim().length === 0) {
        setPdfExtractionStatus('Warning: Text file is empty.');
        throw new Error('Text file is empty.');
      }
      
      setPdfExtractionStatus(`Successfully read ${text.length} characters from text file.`);
      return text;
    } catch (error: any) {
      console.error('Error reading text file:', error);
      setPdfExtractionStatus(`Text File Error: ${error.message}`);
      throw error;
    }
  };
  
  // Function to extract text from a PDF file
  const extractTextFromPdf = async (file: File): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        setPdfExtractionStatus('Loading PDF document...');
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          setPdfExtractionStatus('Error: PDF is password protected.');
          reject(new Error('PDF is password protected'));
        };

        loadingTask.onProgress = (progressData: { loaded: number, total: number }) => {
          if (!progressData.total) return;
          const percent = Math.round((progressData.loaded / progressData.total) * 100);
          setPdfExtractionStatus(`Loading PDF... ${percent}%`);
        };

        const pdf = await loadingTask.promise;
        setPdfExtractionStatus(`PDF loaded (${pdf.numPages} pages). Extracting text...`);

        const numPages = pdf.numPages;
        let fullText = '';

        for (let i = 1; i <= numPages; i++) {
          setPdfExtractionStatus(`Processing page ${i}/${numPages}...`);
          try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .filter((item: any) => item.str && item.str.trim().length > 0)
              .map((item: any) => item.str)
              .join(' ');
            fullText += pageText + '\n\n';
          } catch (pageError: any) {
            console.error(`Error extracting text from page ${i}:`, pageError);
            setPdfExtractionStatus(`Error processing page ${i}: ${pageError.message}. Skipping.`);
            // Optionally continue to next page or reject based on severity
          }
        }

        if (fullText.trim().length === 0) {
          setPdfExtractionStatus('Warning: No text content found in PDF.');
          reject(new Error('No text content found in PDF. It might be a scanned image.'));
          return;
        }
        
        setPdfExtractionStatus('Text extraction complete.');
        resolve(fullText);
      } catch (error: any) {
        console.error('Error in extractTextFromPdf:', error);
        setPdfExtractionStatus(`PDF Extraction Error: ${error.message}`);
        reject(error);
      }
    });
  };
  
  // Process the document with OpenAI
  const handleAnalyzeDocument = async () => {
    if (!selectedFile) {
      setError('Please select a document file');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setParsedTasks(null);
    setPdfExtractionStatus(null);
    setApiResponse(null);
    setProcessingStep('preparing');
    setProgressPercentage(10); // Start at 10%
    
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      const formData = new FormData();
      let extractedText = null;

      // Use the general text extraction function
      try {
        setProcessingStep('pdf-extraction-start');
        setProgressPercentage(20); // 20% when extraction starts
        
        extractedText = await extractTextFromFile(selectedFile);
        
        setProcessingStep('pdf-extraction-end');
        setProgressPercentage(40); // 40% when extraction completes
      } catch (extractError: any) {
        console.error('Error extracting text from file:', extractError);
        setError(`Text Extraction Failed: ${extractError.message || 'Unknown error'}`);
        setIsProcessing(false);
        setProcessingStep('error');
        setProgressPercentage(0); // Reset progress
        return;
      }

      // Send extracted text to API
      if (extractedText) {
        formData.append('textContent', extractedText);
        formData.append('isExtractedText', 'true');
        formData.append('file', new File([], selectedFile?.name || 'document.pdf', { type: 'application/pdf' }));
      } else if (selectedFile) {
        formData.append('file', selectedFile);
      } else {
          setError('No file selected or text extracted.');
          setIsProcessing(false);
          setProcessingStep('idle');
          setProgressPercentage(0); // Reset progress
          return;
      }

      formData.append('technicians', JSON.stringify(technicians.map(tech => ({ id: tech.id, name: tech.name }))));
      formData.append('groups', JSON.stringify(groups.map(group => ({ id: group.id, name: group.name }))));
      formData.append('categories', JSON.stringify(categories.map(cat => ({ id: cat.id, value: cat.value }))));
      
      // Determine model name based on state - using EXACT specified names
      const modelToUse = useThinkingModel ? 'o3' : 'o4-mini';
      formData.append('modelName', modelToUse);
      setModelInfo(useThinkingModel 
        ? 'o3 (Higher Precision Model)' 
        : 'o4-mini (Standard Model)'
      );
      
      // Keep these for the API to know the context
      formData.append('useThinkingModel', useThinkingModel.toString());
      formData.append('isMeetingTranscript', isMeetingTranscript.toString());
      
      setPdfExtractionStatus(null);
      setProcessingStep('api-request');
      setProgressPercentage(50); // 50% when API request starts
      setError('Sending request to OpenAI...');
      
      // Start continuous progress increment
      let continueProgress = true;
      progressInterval = setInterval(() => {
        if (continueProgress) {
          setProgressPercentage(prev => {
            // Increment by small amount, but never exceed 95%
            const increment = Math.max(0.5, (95 - prev) / 20);
            return Math.min(95, prev + increment);
          });
        }
      }, 300);
      
      // API Call
      const fetchPromise = fetch('/api/openai/extract-tasks-from-pdf', {
        method: 'POST',
        body: formData,
      });
      
      // Set step to waiting
      setProcessingStep('api-request-waiting');
      setError('Waiting for response from OpenAI...');
      
      // Wait for response
      const response = await fetchPromise;
      
      // Stop continuous progress
      continueProgress = false;
      if (progressInterval) clearInterval(progressInterval);
      
      setProcessingStep('api-response-received');
      setProgressPercentage(96); // Jump to 96% when response is received
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API Error: ${response.statusText}`);
      }
      
      if (!result || !Array.isArray(result.tasks)) {
        throw new Error('Received invalid data structure from API.');
      }
      
      const tasks = result.tasks;
      setApiResponse(result); // Set response for confirmation screen
      setProcessingStep('response-processing');
      setProgressPercentage(98); // 98% during task processing
      
      // Process tasks
      const processedTasks = tasks.map((task: any, idx: number) => {
        // Log the task details for debugging
        console.log(`Processing task ${idx}:`, task);
        
        const details = task.details || task.description || '';
        if (!details) {
          console.warn(`Task ${idx} (${task.title}) has no details/description`);
        } else {
          console.log(`Task ${idx} (${task.title}) has details length: ${details.length}`);
        }
        
        return {
          title: task.title || 'Untitled Task',
          details: details,
          assignee: task.assignee || null,
          group: task.group || null,
          category: task.category || null,
          dueDate: task.dueDate || null,
          priority: task.priority || 'Medium',
          ticketNumber: task.ticketNumber || null,
          externalUrl: task.externalUrl || null
        } as ParsedTask;
      });
      
      setParsedTasks(processedTasks);
      setProcessingStep('complete');
      setProgressPercentage(100); // 100% when complete
      setError(null);
      
    } catch (err: any) {
      // Stop progress if there's an error
      if (progressInterval) clearInterval(progressInterval);
      console.error('Error analyzing document:', err);
      setError(err.message || 'An error occurred during analysis');
      setProcessingStep('error');
      setProgressPercentage(0);
    } finally {
      // Ensure interval is cleared when done
      if (progressInterval) clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };
  
  // Function to handle final submission of tasks
  const handleSubmitTasks = async (reviewedTasks: ParsedTask[]) => {
    try {
      // Map the reviewed tasks to our final Task format
      const taskObjects: Omit<Task, 'id'>[] = reviewedTasks.map((task, index) => {
        let assigneeId = null;
        if (task.assignee) {
          const matchedTech = findBestTechnicianMatch(task.assignee, technicians);
          if (matchedTech) assigneeId = matchedTech.id;
        }
        
        let groupId = null;
        if (task.group) {
          const matchedGroup = groups.find(g => g.name.toLowerCase() === task.group?.toLowerCase());
          if (matchedGroup) groupId = matchedGroup.id;
        }
        
        let categoryId = null;
        if (task.category) {
          const matchedCategory = categories.find(c => c.value.toLowerCase() === task.category?.toLowerCase());
          if (matchedCategory) categoryId = matchedCategory.id;
        }
        
        let dueDate = null;
        if (task.dueDate) {
          try {
            const date = new Date(task.dueDate);
            if (!isNaN(date.getTime())) dueDate = Timestamp.fromDate(date);
          } catch (e) { console.error('Error parsing date:', e); }
        }
        
        const priorityLevel = mapPriorityToPriorityLevel(task.priority);
        
        return {
          title: task.title,
          explanation: task.details || '',
          status: TaskStatus.Open,
          assigneeId,
          groupId,
          categoryId,
          estimatedCompletionDate: dueDate,
          order: currentOrderCount + index,
          priorityLevel,
          tags: [],
          progress: 0,
          lastUpdated: Timestamp.now(),
          externalUrl: task.externalUrl || null,
          ticketNumber: task.ticketNumber || null,
          ticketUrl: null
        };
      });
      
      await onAddTasks(taskObjects);
      onCancel(); // Close the modal
    } catch (err: any) {
      console.error('Failed to add tasks:', err);
      setError(err.message || 'Failed to add tasks');
    }
  };
  
  // Reset to the input phase
  const handleBackToInput = () => {
    setParsedTasks(null);
    setError(null);
    setPdfExtractionStatus(null);
    // Keep selectedFile so user doesn't have to re-select
  };
  
  // Helper function to map a technician's name to a technician object
  const findBestTechnicianMatch = (name: string | null, technicians: Technician[]): Technician | null => {
    if (!name) return null;
    const normalizedName = name.toLowerCase().trim();
    const exactMatch = technicians.find(tech => tech.name.toLowerCase().trim() === normalizedName);
    if (exactMatch) return exactMatch;
    const partialMatch = technicians.find(tech => 
      tech.name.toLowerCase().includes(normalizedName) || 
      normalizedName.includes(tech.name.toLowerCase())
    );
    return partialMatch || null;
  };
  
  // Helper function to map priority string to PriorityLevel enum
  const mapPriorityToPriorityLevel = (priority: string | null): PriorityLevel => {
    if (!priority) return PriorityLevel.Medium;
    switch (priority.toLowerCase()) {
      case 'low': return PriorityLevel.Low;
      case 'medium': return PriorityLevel.Medium;
      case 'high': return PriorityLevel.High;
      case 'critical': return PriorityLevel.Critical;
      default: return PriorityLevel.Medium;
    }
  };

  // Function to proceed from API response to review
  const handleProceedToReview = () => {
    setApiResponse(null); // Clear the API response to hide confirmation screen
  };

  // Determine which view to show: input, processing, confirmation, or review
  const showInputView = !isProcessing && !apiResponse && !parsedTasks;
  const showProcessingView = isProcessing;
  const showConfirmationView = !isProcessing && apiResponse && parsedTasks;
  const showReviewView = !isProcessing && !apiResponse && parsedTasks !== null;
  
  return (
    <div className="overflow-hidden h-full flex flex-col">
      {/* Input view - when no file is processing or no tasks parsed yet */}
      {showInputView && (
        <div className="space-y-4 overflow-y-auto flex-grow">
          <div className="mb-2">
            <h3 className="text-lg font-semibold mb-2 text-blue-700 dark:text-blue-300">Document Analysis with OpenAI</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Extract tasks from PDF documents using OpenAI's advanced document processing capabilities.
            </p>
          </div>
          
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={handleFileChange}
            />
             <div className="flex flex-col items-center justify-center">
              <svg className="w-12 h-12 mb-3 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">PDF, DOC, DOCX, or TXT files (MAX. 32MB)</p>
            </div>
          </div>

          {/* File selected indicator */} 
          {selectedFile && (
             <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-start">
               <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
               <div className="flex-1 overflow-hidden">
                 <p className="font-medium text-blue-700 dark:text-blue-300">Selected File:</p>
                 <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{selectedFile.name}</p>
                 <p className="text-xs text-gray-500 dark:text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
               </div>
               <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
               </button>
             </div>
           )}

          {/* Processing options (Unchanged) */}
          <div className="mt-4 space-y-3">
            <ToggleSwitch
              id="modelToggle"
              checked={useThinkingModel}
              onChange={handleThinkingModelChange}
              label={useThinkingModel ? 'Use o3 model (higher precision, costs more)' : 'Use o4-mini model'}
              disabled={isMeetingTranscript} // Disable if meeting transcript is checked
            />
            <ToggleSwitch
              id="meetingTranscript"
              checked={isMeetingTranscript}
              onChange={handleMeetingTranscriptChange}
              label="This is a meeting transcript (requires o3 model)"
            />
             {/* Optional: Add visual cue if o3 model is forced */}
             {isMeetingTranscript && (
                <p className="text-xs text-gray-500 dark:text-gray-400 ml-12">
                  o3 model is automatically enabled for meeting transcripts.
                </p>
              )}
          </div>
          
          {/* Status/Error message area */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-md text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
          {pdfExtractionStatus && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 rounded-md text-yellow-700 dark:text-yellow-300 text-sm">
              {pdfExtractionStatus}
            </div>
          )}
        </div>
      )}
      
      {/* Processing view - adding more detailed status info */}
      {showProcessingView && (
        <div className="flex flex-col h-full items-center justify-center p-6">
          <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Processing Document...</p>
          
          {/* Processing step indicator */}
          <div className="mt-3 w-full max-w-md">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {processingStep === 'preparing' && 'Preparing document...'}
                {processingStep === 'pdf-extraction-start' && 'Extracting text from PDF...'}
                {processingStep === 'pdf-extraction-end' && 'Text extraction complete.'}
                {processingStep === 'api-request' && 'Sending request to OpenAI...'}
                {processingStep === 'api-request-waiting' && 'Waiting for OpenAI response...'}
                {processingStep === 'api-response-received' && 'Response received, processing...'}
                {processingStep === 'response-processing' && 'Processing tasks...'}
                {processingStep === 'complete' && 'Processing complete!'}
                {processingStep === 'error' && 'Error occurred'}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div 
                className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>
          
          {/* Model information */}
          {modelInfo && (
            <div className="mt-4 flex items-center justify-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 shadow-sm">
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {modelInfo}
              </span>
            </div>
          )}
          
          {/* Detailed status message */}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 max-w-md text-center">
            {pdfExtractionStatus || 
             (processingStep === 'api-request' && 'Analyzing content with OpenAI...') ||
             (processingStep === 'api-response-received' && 'OpenAI response received, extracting tasks...') ||
             (processingStep === 'response-processing' && 'Processing and validating task data...') ||
             (processingStep === 'complete' && 'Task processing complete. Preparing review screen...')}
          </p>
          
          {/* Error display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-md text-red-700 dark:text-red-300 text-sm max-w-md">
              {error}
            </div>
          )}
        </div>
      )}
      
      {/* New Confirmation view - showing raw API response */}
      {showConfirmationView && parsedTasks && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              API Response Confirmation
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              OpenAI found {parsedTasks.length} tasks in your document. Review the raw API response below before proceeding.
            </p>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            <div className="mb-4 flex items-center text-sm">
              <span className="text-gray-700 dark:text-gray-300 font-semibold">Model used:</span>
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300">
                {modelInfo}
              </span>
            </div>
            
            {/* JSON Response display */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 flex justify-between items-center">
                <span>Raw API Response (JSON)</span>
              </div>
              <pre className="bg-white dark:bg-gray-900 p-4 overflow-auto text-sm text-gray-800 dark:text-gray-200 h-80 font-mono">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
          </div>
          
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
            <button
              onClick={() => setApiResponse(null)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleProceedToReview}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow transition"
            >
              Proceed to Review
            </button>
          </div>
        </div>
      )}
      
      {/* Review view - Pass parsedTasks directly */}
      {showReviewView && parsedTasks && (
        <TaskReviewForm
          parsedTasks={parsedTasks}
          onSubmit={handleSubmitTasks}
          onBack={() => {
            // Show the API response confirmation screen when going back from review
            setApiResponse({ tasks: parsedTasks });
          }}
          technicians={technicians}
          groups={groups}
          categories={categories}
          onCreateGroup={onCreateGroup}
          isThinkingModel={useThinkingModel}
        />
      )}
      
      {/* Footer buttons - only show in input view */}
      {showInputView && (
        <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAnalyzeDocument}
            disabled={!selectedFile || isProcessing}
            className={`px-4 py-2 ${
              !selectedFile || isProcessing
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } rounded-md transition`}
          >
            {isProcessing ? 'Processing...' : 'Analyze Document'}
          </button>
        </div>
      )}
    </div>
  );
} 
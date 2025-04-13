"use client";

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { Task, Technician, TaskStatus, Group, PriorityLevel, Category } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { TaskReviewForm } from './TaskReviewForm';
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import mammoth from 'mammoth';

interface BulkAddTaskFromPDFProps {
  technicians: Technician[];
  groups: Group[];
  categories: Category[];
  currentOrderCount: number;
  onAddTasks: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onCancel: () => void;
  onCreateGroup?: (name: string, description?: string) => Promise<Group>;
}

// Fix the JsonHighlight component to better detect JSON content
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

// Improved HighlightedOutput component with enhanced JSON detection and system messages at the end
const HighlightedOutput: React.FC<{ text: string }> = ({ text }) => {
  // Filter out meeting summary data before processing
  const filteredText = text.replace(/(?:<!-- NON-DISPLAY DATA BEGIN - FOR CLIENT PROCESSING ONLY -->)?\s*\[MEETING-SUMMARY-DATA-START\][\s\S]*?\[MEETING-SUMMARY-DATA-END\]\s*(?:<!-- NON-DISPLAY DATA END -->)?/g, '');
  
  const lines = filteredText.split('\n');
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
        } else if (line.includes('Final result:')) {
          // For the final result line, highlight the number
          const taskCountMatch = line.match(/(\d+)\s+tasks/);
          if (taskCountMatch && taskCountMatch[1]) {
            enhancedLine = line.replace(
              `${taskCountMatch[1]} tasks`,
              `<span class="font-bold text-green-600 dark:text-green-400">${taskCountMatch[1]}</span> tasks`
            );
          }
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
        if (line.includes('Creating meeting summary')) {
          enhancedLine = `<span class="text-purple-600 dark:text-purple-400">🧠</span> ${line}`;
        } else if (line.includes('Meeting summary generation complete')) {
          enhancedLine = `<span class="text-green-600 dark:text-green-400">✅</span> ${line}`;
        } else if (line.includes('Optimizing and consolidating tasks')) {
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
    
    // Transcript formatting - Meeting Title
    if (line.startsWith('# MEETING TITLE:')) {
      // Split the line around the colon
      const [prefix, title] = line.split(':', 2);
      
      contentLines.push(
        <div key={`content-${i}`} className="mt-4 mb-2">
          <span className="text-purple-600 dark:text-purple-400 font-semibold">{`${prefix}:`}</span>
          <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{title}</span>
        </div>
      );
      return;
    }
    
    // Transcript formatting - Section Headers
    if (line.startsWith('## ')) {
      contentLines.push(
        <div key={`content-${i}`} className="mt-3 mb-1 text-indigo-700 dark:text-indigo-300 font-bold border-b border-indigo-200 dark:border-indigo-800 pb-1">
          {line.substring(3)}
        </div>
      );
      return;
    }
    
    // Transcript formatting - Bullet Points
    if (line.startsWith('- ')) {
      // Check for bold text with **
      let bulletText = line.substring(2);
      let formattedBulletText = null;
      
      if (bulletText.includes('**')) {
        formattedBulletText = (
          <span dangerouslySetInnerHTML={{ 
            __html: bulletText.replace(/\*\*([^*]+)\*\*/g, '<span class="font-bold text-blue-600 dark:text-blue-400">$1</span>') 
          }} />
        );
      }
      
      contentLines.push(
        <div key={`content-${i}`} className="ml-4 flex items-start my-1 text-gray-800 dark:text-gray-200">
          <span className="inline-block text-amber-500 dark:text-amber-400 mr-2">•</span>
          <span>{formattedBulletText || bulletText}</span>
        </div>
      );
      return;
    }
    
    // Transcript formatting - Emphasized text for analysis
    if (line.includes('Analyzing meeting transcript') || line.includes('Step 1:') || line.includes('Step 2:') || line.includes('Analyzing PDF document') || line.includes('Analyzing Word document')) {
      contentLines.push(
        <div key={`content-${i}`} className="text-blue-600 dark:text-blue-400 font-medium flex items-center my-2">
          {(line.includes('Analyzing') || line.includes('Processing')) && (
            <span className="mr-2">📄</span>
          )}
          {line.includes('Step 1:') && (
            <span className="mr-2">🔍</span>
          )}
          {line.includes('Step 2:') && (
            <span className="mr-2">✅</span>
          )}
          <span>{line}</span>
        </div>
      );
      return;
    }
    
    // Enhanced highlighting for model type indication
    if (line.includes('Using Gemini')) {
      contentLines.push(
        <div key={`content-${i}`} className="text-indigo-600 dark:text-indigo-400 font-medium my-1">
          {line}
        </div>
      );
      return;
    }
    
    // Default content with enhanced formatting for potential emphasized text with **
    if (line.includes('**')) {
      contentLines.push(
        <div 
          key={`content-${i}`} 
          className="leading-relaxed"
          dangerouslySetInnerHTML={{ 
            __html: line.replace(/\*\*([^*]+)\*\*/g, '<span class="font-bold text-blue-600 dark:text-blue-400">$1</span>') 
          }}
        />
      );
    } else {
      // Standard line
      contentLines.push(
        <div key={`content-${i}`} className="leading-relaxed">
          {line || <br />}
        </div>
      );
    }
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

// Add a function to convert Word document to PDF
const convertWordToPdf = async (wordFile: File): Promise<File> => {
  try {
    // Read the Word file as an ArrayBuffer
    const wordBuffer = await wordFile.arrayBuffer();
    
    // Convert Word to HTML using mammoth
    const result = await mammoth.convertToHtml({ arrayBuffer: wordBuffer });
    const htmlContent = result.value;
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    
    // Add text from the Word document
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    const lineHeight = fontSize * 1.2;
    
    // Strip HTML tags to get plain text (simple approach)
    const plainText = htmlContent.replace(/<[^>]*>/g, '');
    
    // Add text to PDF
    const lines = plainText.split('\n');
    let y = page.getHeight() - 50; // Start from top with margin
    
    for (const line of lines) {
      if (y < 50) { // Add a new page if we reach the bottom margin
        const newPage = pdfDoc.addPage([612, 792]);
        y = newPage.getHeight() - 50;
      }
      
      if (line.trim()) { // Only draw non-empty lines
        page.drawText(line, {
          x: 50,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
      
      y -= lineHeight;
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Create a new file from the PDF bytes
    const convertedFile = new File([pdfBytes], `${wordFile.name.split('.')[0]}.pdf`, {
      type: 'application/pdf',
      lastModified: new Date().getTime(),
    });
    
    return convertedFile;
  } catch (error) {
    console.error('Error converting Word to PDF:', error);
    throw new Error('Failed to convert Word document to PDF');
  }
};

// Enhance the Word document handling
const extractWordContent = async (wordFile: File): Promise<string> => {
  try {
    // Read the Word file as an ArrayBuffer
    const wordBuffer = await wordFile.arrayBuffer();
    
    // Convert Word to HTML using mammoth
    const result = await mammoth.extractRawText({ arrayBuffer: wordBuffer });
    
    // Return the raw text
    return result.value;
  } catch (error) {
    console.error('Error extracting text from Word document:', error);
    throw new Error('Failed to extract text from Word document');
  }
};

export function BulkAddTaskFromPDF({
  technicians,
  groups,
  categories,
  currentOrderCount,
  onAddTasks,
  onCancel,
  onCreateGroup
}: BulkAddTaskFromPDFProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamedOutput, setStreamedOutput] = useState<string>('');
  const [parsedTasks, setParsedTasks] = useState<any[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [useThinkingModel, setUseThinkingModel] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isPaused, setIsPaused] = useState(false);
  const [optimizationComplete, setOptimizationComplete] = useState(false);
  const [isMeetingTranscript, setIsMeetingTranscript] = useState(false);
  const [convertedPdfFile, setConvertedPdfFile] = useState<File | null>(null);
  const [showConversionConfirmation, setShowConversionConfirmation] = useState(false);
  const [conversionUrl, setConversionUrl] = useState<string | null>(null);
  const [autoProgressTimer, setAutoProgressTimer] = useState<NodeJS.Timeout | null>(null);
  const [autoProgressCountdown, setAutoProgressCountdown] = useState(5);
  const [userInteracted, setUserInteracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamOutputRef = useRef<HTMLDivElement>(null);
  const meetingSummaryRef = useRef<string | null>(null);
  const meetingTitleRef = useRef<string>("Meeting Summary");
  
  // Add a ref for the progress interval:
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add state for no tasks found case
  const [noTasksFound, setNoTasksFound] = useState(false);
  
  // Add new state variables to track processing stages
  const [currentProcessStage, setCurrentProcessStage] = useState<'uploading' | 'initializing' | 'creating' | 'reading' | 'extracting' | 'optimizing' | 'complete'>('uploading');
  const [processingStages, setProcessingStages] = useState<{stage: string, percent: number}[]>([
    { stage: 'Uploading Document', percent: 1 },
    { stage: 'Initializing Analysis', percent: 15 },
    { stage: isMeetingTranscript ? 'Creating Meeting Summary' : 'Reading Document', percent: isMeetingTranscript ? 30 : 20 },
    { stage: 'Extracting Tasks', percent: 50 },
    { stage: 'Optimizing Results', percent: 95 },
    { stage: 'Complete', percent: 100 },
  ]);
  
  // Function to handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Get file extension
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      
      // Validate file type - now accept PDF and Word documents
      if (file.type === 'application/pdf') {
        // Reset state for PDF files
      setSelectedFile(file);
      setStreamedOutput('');
      setError(null);
      } else if (
        fileExt === 'docx' || 
        fileExt === 'doc' || 
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/msword'
      ) {
        // For Word documents, we'll set a flag to convert before processing
        setSelectedFile(file);
        setStreamedOutput('');
        setError(null);
      } else {
        setError('Please select a PDF or Word (.doc, .docx) file');
      }
    }
  };
  
  // Function to handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Get file extension
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      
      // Validate file type - now accept PDF and Word documents
      if (file.type === 'application/pdf') {
        // Reset state for PDF files
      setSelectedFile(file);
      setStreamedOutput('');
      setError(null);
      } else if (
        fileExt === 'docx' || 
        fileExt === 'doc' || 
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/msword'
      ) {
        // For Word documents, we'll set a flag to convert before processing
        setSelectedFile(file);
        setStreamedOutput('');
        setError(null);
      } else {
        setError('Please drop a PDF or Word (.doc, .docx) file');
      }
    }
  };
  
  // Prevent default behavior for drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  // Update the handleAnalyzeDocument function to use direct text extraction for Word files
  const handleAnalyzeDocument = async () => {
    if (!selectedFile) {
      setError('Please select a PDF or Word file');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setStreamedOutput('');
    setUploadProgress(0);
    
    try {
      // Get file extension
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
      
      // Check if it's a Word document
      if (
        fileExt === 'docx' || 
        fileExt === 'doc' || 
        selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        selectedFile.type === 'application/msword'
      ) {
        // Show extraction message
        setStreamedOutput('[System: Extracting content from Word document...]\n');
        
        try {
          // Extract text from the Word document
          const extractedText = await extractWordContent(selectedFile);
          
          // Create a preview text area
          setConversionUrl(null); // Clear any existing preview URL
          setStreamedOutput(prev => prev + '[System: Word document content extracted successfully.]\n\n');
          
          // Show the Word preview confirmation dialog
          setShowConversionConfirmation(true);
          setIsProcessing(false);
          
          // Store the extracted text
          const textBlob = new Blob([extractedText], { type: 'text/plain' });
          const textFile = new File([textBlob], `${selectedFile.name.split('.')[0]}.txt`, {
            type: 'text/plain',
            lastModified: new Date().getTime(),
          });
          
          setConvertedPdfFile(textFile);
          
          // Create a data URL for preview
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              setConversionUrl(e.target.result as string);
            }
          };
          reader.readAsDataURL(textBlob);
          
          return;
        } catch (conversionError) {
          throw new Error(`Failed to extract content from Word document: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
        }
      }
      
      // If we get here with a PDF file, process it directly
      await processFile(selectedFile);
      
    } catch (err: any) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      console.error('Error analyzing document:', err);
      setError(err.message || 'An error occurred while analyzing the document');
      setIsProcessing(false);
    } 
  };
  
  // New function to continue processing after confirmation
  const processFile = async (fileToProcess: File) => {
    setIsProcessing(true);
    setCurrentProcessStage('uploading');
    
    try {
      // Create a FormData object to send the file and context
      const formData = new FormData();
      
      // Check if this is a text file extracted from Word
      const isExtractedText = fileToProcess.type === "text/plain" && 
                              fileToProcess.name.endsWith(".txt") && 
                              convertedPdfFile === fileToProcess;
      
      if (isExtractedText) {
        // For word documents, send the actual text content instead of the file
        const textContent = await fileToProcess.text();
        formData.append('textContent', textContent);
        formData.append('isExtractedText', 'true'); // Flag to indicate this is extracted text
        formData.append('originalFileName', selectedFile?.name || ''); // Original filename for context
      } else {
        // For PDF files, send the file as usual
        formData.append('file', fileToProcess);
      }
      
      // Add common form data
      formData.append('technicians', JSON.stringify(technicians.map(tech => ({ id: tech.id, name: tech.name }))));
      formData.append('groups', JSON.stringify(groups.map(group => ({ id: group.id, name: group.name }))));
      formData.append('categories', JSON.stringify(categories.map(cat => ({ id: cat.id, value: cat.value }))));
      formData.append('useThinkingModel', useThinkingModel.toString());
      formData.append('isMeetingTranscript', isMeetingTranscript.toString());
      
      // Always use streaming mode for both models
      formData.append('streamOutput', 'true');
      
      // Only set stage without setting exact progress - let the incrementer handle it
      setCurrentProcessStage('initializing');
      
      // Send the file or text to the API for streaming analysis
        const response = await fetch('/api/gemini/extract-tasks-from-pdf', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to analyze document');
        }
        
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response stream');
        }
        
        // Read the stream
        let receivedText = '';
        
        // Create a function to read and process chunks
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = new TextDecoder().decode(value);
              receivedText += chunk;
            
              // Update progress based on detected markers in the stream
              if (isMeetingTranscript) {
                // Check for meeting transcript stages
                if (chunk.includes('Step 1: Creating meeting summary') || chunk.includes('Creating meeting summary from transcript')) {
                  setCurrentProcessStage('creating');
                } else if (chunk.includes('Meeting summary generation complete') || chunk.includes('Step 2: Extracting tasks') || chunk.includes('Extracting tasks from')) {
                  setCurrentProcessStage('extracting');
                } else if (chunk.includes('Optimizing...') || chunk.includes('Optimizing and consolidating tasks') || chunk.includes('Optimizing extracted tasks')) {
                  setCurrentProcessStage('optimizing');
                } else if (chunk.includes('Optimization complete') || chunk.includes('Successfully optimized')) {
                  setCurrentProcessStage('complete');
                }
              } else {
                // Check for regular document stages
                if (chunk.includes('Analyzing') && receivedText.length < 1000) {
                  setCurrentProcessStage('initializing');
                } else if (chunk.includes('Reading document content')) {
                  setCurrentProcessStage('reading');
                } else if (chunk.includes('Extracting tasks from') || chunk.includes('JSON')) {
                  setCurrentProcessStage('extracting');
                } else if (chunk.includes('Optimizing') || chunk.includes('Optimizing and consolidating tasks')) {
                  setCurrentProcessStage('optimizing');
                } else if (chunk.includes('Optimization complete') || chunk.includes('Successfully optimized')) {
                  setCurrentProcessStage('complete');
                }
              }
              
              // Check if this chunk contains meeting summary data
              if (isMeetingTranscript && chunk.includes('[MEETING-SUMMARY-DATA-START]')) {
                const startMarker = '[MEETING-SUMMARY-DATA-START]';
                const endMarker = '[MEETING-SUMMARY-DATA-END]';
                
                // If we have the complete summary in this chunk
                if (chunk.includes(startMarker) && chunk.includes(endMarker)) {
                  const startIndex = chunk.indexOf(startMarker) + startMarker.length;
                  const endIndex = chunk.indexOf(endMarker);
                  const summaryContent = chunk.substring(startIndex, endIndex).trim();
                  meetingSummaryRef.current = summaryContent;
                } 
                // Otherwise, start collecting the summary across chunks
                else if (chunk.includes(startMarker)) {
                  const startIndex = chunk.indexOf(startMarker) + startMarker.length;
                  meetingSummaryRef.current = chunk.substring(startIndex).trim();
                }
              } 
              // Continue collecting summary if we're in the middle of it
              else if (isMeetingTranscript && meetingSummaryRef.current !== null && chunk.includes('[MEETING-SUMMARY-DATA-END]')) {
                const endIndex = chunk.indexOf('[MEETING-SUMMARY-DATA-END]');
                meetingSummaryRef.current += chunk.substring(0, endIndex).trim();
              }
              // Add to the summary if we're collecting it
              else if (isMeetingTranscript && meetingSummaryRef.current !== null && !chunk.includes('[MEETING-SUMMARY-DATA-END]')) {
                meetingSummaryRef.current += chunk;
              }
              
              // Check if this chunk contains meeting title data
              if (isMeetingTranscript && chunk.includes('[MEETING-TITLE-DATA]')) {
                const startMarker = '[MEETING-TITLE-DATA]';
                const endMarker = '[/MEETING-TITLE-DATA]';
                
                // If we have the complete title in this chunk
                if (chunk.includes(startMarker) && chunk.includes(endMarker)) {
                  const startIndex = chunk.indexOf(startMarker) + startMarker.length;
                  const endIndex = chunk.indexOf(endMarker);
                  const titleContent = chunk.substring(startIndex, endIndex).trim();
                  meetingTitleRef.current = titleContent || "Meeting Summary";
                }
              }
              
              // Update the UI with each received chunk
              setStreamedOutput(prevText => prevText + chunk);
              
              // Force a small delay to ensure React updates the UI
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            return receivedText;
          } catch (error) {
            console.error('Error reading stream:', error);
            throw error;
          }
        };
        
        const completeText = await processStream();
        
        // After streaming completes, try to parse the accumulated JSON
        try {
          // Check if we have reached the completion markers in the streamed output
          if (hasStreamingCompleted(completeText)) {
            console.log("Streaming has completed based on output patterns");
            
            // Force extraction of tasks
            try {
          const tasks = parseAndExtractTasks(completeText);
          console.log("Tasks extracted successfully:", tasks.length);
          console.log("optimizationComplete state:", optimizationComplete);
            } catch (parseError) {
              console.error('Failed to parse streaming output as JSON, making direct request', parseError);
              await makeFallbackRequest();
            }
          } else {
        // Regular JSON extraction attempt
            try {
          const tasks = parseAndExtractTasks(completeText);
          console.log("Tasks extracted successfully:", tasks.length);
          console.log("optimizationComplete state:", optimizationComplete);
            } catch (parseError) {
              console.error('Failed to parse streaming output as JSON, making direct request', parseError);
              await makeFallbackRequest();
            }
          }
        } catch (error) {
          console.error('Error in streaming process:', error);
          setError(error instanceof Error ? error.message : 'An error occurred while analyzing the document');
          setIsProcessing(false);
          
          // Show a more user-friendly error that stays on screen
          setStreamedOutput(prevOutput => 
            prevOutput + 
            "\n\n❌ ERROR: Failed to extract tasks from the document. Please try again or use a different file."
          );
          // Keep in processing complete state but with error
          setProcessingComplete(true); 
          setCountdown(10); // Give more time to see the error
        }
    } catch (err: any) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      console.error('Error analyzing document:', err);
      setError(err.message || 'An error occurred while analyzing the document');
      setIsProcessing(false);
    }
  };
  
  // Update the download function for extracted text
  const downloadConvertedText = () => {
    if (!convertedPdfFile) return;
    
    const a = document.createElement('a');
    
    // If we have a URL, use it. Otherwise create a new one.
    if (conversionUrl && conversionUrl.startsWith('data:')) {
      a.href = conversionUrl;
    } else {
      // Create a new URL from the file
      const url = URL.createObjectURL(convertedPdfFile);
      a.href = url;
      
      // Clean up after download
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    
    a.download = convertedPdfFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  // Memoize the confirm conversion function to avoid dependency issues
  const memoizedConfirmProceed = React.useCallback(() => {
    if (!convertedPdfFile) {
      setError('Converted PDF file not found');
      return;
    }
    
    setShowConversionConfirmation(false);
    setStreamedOutput('[System: Word document successfully converted to PDF.]\n\n');
    // Use processFile directly here without making it a dependency
    if (convertedPdfFile) {
      processFile(convertedPdfFile);
    }
  }, [convertedPdfFile]); // Remove processFile from dependencies
  
  // Use the memoized function for the auto-progression useEffect
  useEffect(() => {
    if (showConversionConfirmation && !userInteracted) {
      // Start or continue the countdown
      const timer = setInterval(() => {
        setAutoProgressCountdown(prev => {
          // If countdown reaches 0, auto-progress
          if (prev <= 1) {
            if (convertedPdfFile) {
              memoizedConfirmProceed();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      setAutoProgressTimer(timer);
      
      // Setup event listeners to detect user interaction
      const handleUserInteraction = () => {
        setUserInteracted(true);
        if (autoProgressTimer) {
          clearInterval(autoProgressTimer);
          setAutoProgressTimer(null);
        }
      };
      
      window.addEventListener('click', handleUserInteraction);
      window.addEventListener('keydown', handleUserInteraction);
      window.addEventListener('mousemove', handleUserInteraction);
      
      return () => {
        if (autoProgressTimer) {
          clearInterval(autoProgressTimer);
        }
        window.removeEventListener('click', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
        window.removeEventListener('mousemove', handleUserInteraction);
      };
    } else if (!showConversionConfirmation) {
      // Reset the countdown and interaction state when dialog closes
      setAutoProgressCountdown(5);
      setUserInteracted(false);
      if (autoProgressTimer) {
        clearInterval(autoProgressTimer);
        setAutoProgressTimer(null);
      }
    }
  }, [showConversionConfirmation, userInteracted, convertedPdfFile, memoizedConfirmProceed]);
  
  // New function to cancel conversion and go back
  const cancelConversion = () => {
    // Clean up URL object
    if (conversionUrl) {
      URL.revokeObjectURL(conversionUrl);
    }
    
    setConvertedPdfFile(null);
    setConversionUrl(null);
    setShowConversionConfirmation(false);
          setIsProcessing(false);
    setStreamedOutput('');
  };
  
  // Cleanup the URL object when component unmounts
  useEffect(() => {
    return () => {
      if (conversionUrl) {
        URL.revokeObjectURL(conversionUrl);
      }
    };
  }, [conversionUrl]);
  
  // Function to check if streaming has completed based on text patterns
  const hasStreamingCompleted = (text: string): boolean => {
    // Check for patterns that indicate successful completion
    const optimizedPattern = /\[System: Optimized \d+ tasks to \d+ .*tasks.*\]/i;
    const extractionCompletePattern = /EXTRACTION COMPLETE/i;
    
    // If we have optimization confirmation and the array of parsed tasks, consider it complete
    if (optimizedPattern.test(text) && text.includes('{') && text.includes('}')) {
      console.log("Detected optimization completion pattern");
      return true;
    }
    
    // If we see EXTRACTION COMPLETE followed by optimization text
    if (extractionCompletePattern.test(text) && 
        text.includes('[System: Optimizing and consolidating tasks...]')) {
      console.log("Detected extraction complete pattern");
      return true;
    }
    
    return false;
  };
  
  // Function to handle final submission of tasks
  const handleSubmitTasks = async (reviewedTasks: any[]) => {
    try {
      // Map the parsed tasks to our task format
      const taskObjects: Omit<Task, 'id'>[] = reviewedTasks.map((task, index) => {
        // Match assignee name to technician id
        let assigneeId = null;
        if (task.assignee) {
          const matchedTech = findBestTechnicianMatch(task.assignee, technicians);
          if (matchedTech) {
            assigneeId = matchedTech.id;
          }
        }
        
        // Match group name to group id
        let groupId = null;
        if (task.group) {
          const matchedGroup = groups.find(group => group.name.toLowerCase() === task.group.toLowerCase());
          if (matchedGroup) {
            groupId = matchedGroup.id;
          }
        }
        
        // Match category value to category id
        let categoryId = null;
        if (task.category) {
          const matchedCategory = categories.find(category => 
            category.value.toLowerCase() === task.category.toLowerCase()
          );
          if (matchedCategory) {
            categoryId = matchedCategory.id;
          }
        }
        
        // Convert due date string to Timestamp
        let dueDate = null;
        if (task.dueDate) {
          try {
            const date = new Date(task.dueDate);
            if (!isNaN(date.getTime())) {
              dueDate = Timestamp.fromDate(date);
            }
          } catch (e) {
            console.error('Error parsing date:', e);
          }
        }
        
        // Map priority string to enum
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
      
      // Submit the tasks
      await onAddTasks(taskObjects);
      
      // Close the modal after successful submission
      onCancel();
    } catch (err: any) {
      console.error('Failed to add tasks:', err);
      setError(err.message || 'Failed to add tasks');
    }
  };
  
  // Reset to the input phase
  const handleBackToInput = () => {
    setParsedTasks(null);
    setStreamedOutput('');
    setError(null);
  };
  
  // Helper function to map a technician's name to a technician object
  const findBestTechnicianMatch = (name: string, technicians: Technician[]): Technician | null => {
    if (!name) return null;
    
    const normalizedName = name.toLowerCase().trim();
    
    // Try exact match
    const exactMatch = technicians.find(tech => 
      tech.name.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) return exactMatch;
    
    // Try partial match
    const partialMatch = technicians.find(tech => 
      tech.name.toLowerCase().includes(normalizedName) || 
      normalizedName.includes(tech.name.toLowerCase())
    );
    if (partialMatch) return partialMatch;
    
    return null;
  };
  
  // Helper function to map priority string to PriorityLevel enum
  const mapPriorityToPriorityLevel = (priority: string | null): PriorityLevel => {
    if (!priority) return PriorityLevel.Medium;
    
    switch (priority.toLowerCase()) {
      case 'low':
        return PriorityLevel.Low;
      case 'medium':
        return PriorityLevel.Medium;
      case 'high':
        return PriorityLevel.High;
      case 'critical':
        return PriorityLevel.Critical;
      default:
        return PriorityLevel.Medium;
    }
  };
  
  // Effect to auto-scroll the streaming output container to the bottom when content is added
  useEffect(() => {
    if (streamOutputRef.current && streamedOutput) {
      streamOutputRef.current.scrollTop = streamOutputRef.current.scrollHeight;
    }
  }, [streamedOutput]);
  
  // Add an effect to automatically transition to review when optimization is complete
  useEffect(() => {
    if (optimizationComplete && parsedTasks && parsedTasks.length > 0 && isProcessing) {
      // Give a delay to show the completion message
      const timer = setTimeout(() => {
        setIsProcessing(false); // This will trigger showing the review screen
      }, 180000); // Changed from 1500 to 180000 (180 seconds)
      
      return () => clearTimeout(timer);
    }
  }, [optimizationComplete, parsedTasks, isProcessing]);
  
  // Countdown effect after processing completes - only for error cases
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (processingComplete && countdown > 0 && !isPaused && error) {
      timer = setTimeout(() => {
        setCountdown(prevCount => prevCount - 1);
      }, 1000);
    } else if (processingComplete && countdown === 0 && error) {
      // Automatically go back to input when countdown reaches zero for errors
      handleBackToInput();
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [processingComplete, countdown, isPaused, error]);
  
  // Toggle countdown pause
  const toggleCountdown = () => {
    setIsPaused(!isPaused);
  };
  
  // Determine which view to show: input, processing, complete, or review
  const showInputView = !parsedTasks && !isProcessing && !processingComplete;
  const showProcessingView = isProcessing;
  const showProcessingCompleteView = processingComplete && error !== null;
  const showReviewView = !isProcessing && !processingComplete && parsedTasks !== null;
  
  // Debug output for component state
  console.log("Component State Debug:", {
    isProcessing,
    optimizationComplete,
    processingComplete,
    parsedTasks: parsedTasks ? `${parsedTasks.length} tasks` : null,
    error,
    showInputView,
    showProcessingView,
    showProcessingCompleteView,
    showReviewView
  });
  
  // Function to toggle the thinking model
  const toggleThinkingModel = () => {
    const newValue = !useThinkingModel;
    setUseThinkingModel(newValue);
    
    // We no longer automatically set transcript mode when thinking model is enabled
    // And we've removed the popup notifications as requested
  };
  
  // Function to toggle the meeting transcript option
  const toggleMeetingTranscript = () => {
    const newValue = !isMeetingTranscript;
    setIsMeetingTranscript(newValue);
    
    // If transcript mode is enabled, ensure thinking model is also enabled as it's required
    if (newValue && !useThinkingModel) {
      setUseThinkingModel(true);
    }
    
    // Removed popup notifications as requested
  };
  
  // Function to handle the parsing and extraction of tasks from JSON text
  const parseAndExtractTasks = (inputJson: string) => {
    console.log("🔍 DEBUG - parseAndExtractTasks called");
    try {
      console.log("🔍 DEBUG - Attempting to parse JSON string");
      console.log("🔍 DEBUG - First 100 characters of input:");
      console.log(inputJson.substring(0, 100));
      
      // Log the full string for debugging (but truncate if extremely long)
      console.log("🔍 DEBUG - FULL INPUT STRING (truncated if >10000 chars):");
      console.log(inputJson.length > 10000 ? inputJson.substring(0, 10000) + "..." : inputJson);
      
      // NEW: Try to extract JSON from markdown code blocks first
      const codeBlockPattern = /```json\s*([\s\S]*?)```/g;
      const codeBlocks = [...inputJson.matchAll(codeBlockPattern)];
      
      console.log(`🔍 DEBUG - Found ${codeBlocks.length} JSON code blocks`);
      
      let extractedTasks: any[] = [];
      
      // Try each code block until we find valid JSON with tasks
      if (codeBlocks.length > 0) {
        for (let i = 0; i < codeBlocks.length; i++) {
          const jsonContent = codeBlocks[i][1].trim();
          console.log(`🔍 DEBUG - Trying code block ${i+1}:`);
          console.log(jsonContent.substring(0, 100) + (jsonContent.length > 100 ? "..." : ""));
          
          try {
            const parsed = JSON.parse(jsonContent);
            console.log(`✅ Successfully parsed code block ${i+1}`);
            
            // Check if it's an array or has a tasks property
            if (Array.isArray(parsed)) {
              extractedTasks = parsed;
              console.log(`Found ${extractedTasks.length} tasks in code block array`);
              break;
            } else if (parsed.tasks && Array.isArray(parsed.tasks)) {
              extractedTasks = parsed.tasks;
              console.log(`Found ${extractedTasks.length} tasks in code block object.tasks`);
              break;
            }
          } catch (e: any) {
            console.log(`❌ Failed to parse code block ${i+1}: ${e.message}`);
          }
        }
      }
      
      // If we found tasks from code blocks, use them
      if (extractedTasks.length > 0) {
        console.log("🎯 Successfully extracted tasks from JSON code blocks");
      } else {
        // Fall back to the original method of trying to parse the whole string
        try {
          const parsedJson = JSON.parse(inputJson);
          
          // Add debug output with distinct markers
          console.log("🔍🔍🔍 DEBUG - SUCCESSFULLY PARSED FULL STRING 🔍🔍🔍");
          console.log(parsedJson);
          
          // Check if it's an array or has a tasks property
          if (Array.isArray(parsedJson)) {
            extractedTasks = parsedJson;
          } else if (parsedJson.tasks && Array.isArray(parsedJson.tasks)) {
            extractedTasks = parsedJson.tasks;
          } else if (typeof parsedJson === 'object' && parsedJson !== null) {
            extractedTasks = [parsedJson];
          }
        } catch (jsonError: any) {
          console.log("Couldn't parse as direct JSON, trying regex fallback", jsonError.message);
          
          // Log the first part of the string to see what's causing the issue
          console.log("🔎🔎🔎 FIRST 200 CHARACTERS OF STRING: 🔎🔎🔎");
          console.log(inputJson.substring(0, 200));
          console.log("🔎🔎🔎 END OF PREVIEW 🔎🔎🔎");
          
          // NEW: More robust pattern matching for JSON arrays and objects
          // Step 1: Try to find a JSON object with a tasks array
          const tasksObjectPattern = /\{\s*"tasks"\s*:\s*\[\s*\{[\s\S]*?\}\s*\]\s*\}/g;
          const tasksObjectMatches = [...inputJson.matchAll(tasksObjectPattern)];
          
          console.log(`Found ${tasksObjectMatches.length} potential tasks objects`);
          
          if (tasksObjectMatches.length > 0) {
            for (let i = 0; i < tasksObjectMatches.length; i++) {
              const potentialJson = tasksObjectMatches[i][0];
              console.log(`Trying tasks object match ${i+1}:`, potentialJson.substring(0, 100));
              
              try {
                const parsed = JSON.parse(potentialJson);
                if (parsed.tasks && Array.isArray(parsed.tasks)) {
                  extractedTasks = parsed.tasks;
                  console.log(`✅ Successfully extracted ${extractedTasks.length} tasks from tasks object`);
          break;
                }
              } catch (e: any) {
                console.log(`❌ Failed to parse tasks object ${i+1}: ${e.message}`);
              }
            }
          }
          
          // Step 2: Try to extract JSON array with title field (most specific)
          if (extractedTasks.length === 0) {
            const taskArrayPattern = /\[\s*\{\s*"title"[\s\S]*?\}\s*\]/;
            const taskArrayMatch = inputJson.match(taskArrayPattern);
            
            if (taskArrayMatch) {
              console.log("⭐⭐⭐ FOUND TASK ARRAY MATCH: ⭐⭐⭐");
              console.log(taskArrayMatch[0]);
              console.log("⭐⭐⭐ END OF MATCH ⭐⭐⭐");
              
              try {
                extractedTasks = JSON.parse(taskArrayMatch[0]);
                console.log("Extracted tasks using title pattern:", extractedTasks.length);
              } catch (error: any) {
                console.error("Failed to parse task array pattern match", error.message);
                console.log("📌📌📌 PROBLEMATIC MATCH: 📌📌📌");
                console.log(taskArrayMatch[0]);
                console.log("📌📌📌 END OF PROBLEMATIC MATCH 📌📌📌");
              }
            }
          }
          
          // Step 3: If that failed, try to find the JSON array between the last system message
      if (extractedTasks.length === 0) {
            // Find the last system message
            const systemMessageMatches = inputJson.match(/\[System:.*?\]/g);
            
            if (systemMessageMatches && systemMessageMatches.length > 0) {
              // Get position of the last system message
              const lastMessage = systemMessageMatches[systemMessageMatches.length - 1];
              const lastMessagePos = inputJson.lastIndexOf(lastMessage);
              
              if (lastMessagePos !== -1) {
                // Extract everything before the last system message
                const contentBeforeLastMessage = inputJson.substring(0, lastMessagePos);
                
                console.log("🔶🔶🔶 CONTENT BEFORE LAST SYSTEM MESSAGE: 🔶🔶🔶");
                console.log(contentBeforeLastMessage.slice(-200)); // Just the last 200 chars
                console.log("🔶🔶🔶 END OF CONTENT 🔶🔶🔶");
                
                // Look for JSON array pattern in that section
                const arrayMatch = contentBeforeLastMessage.match(/(\[\s*\{[\s\S]*?\}\s*\])/);
                
                if (arrayMatch) {
                  console.log("🔷🔷🔷 FOUND ARRAY MATCH BEFORE SYSTEM MESSAGE: 🔷🔷🔷");
                  console.log(arrayMatch[0]);
                  console.log("🔷🔷🔷 END OF MATCH 🔷🔷🔷");
                  
                  try {
                    extractedTasks = JSON.parse(arrayMatch[0]);
                    console.log("Extracted tasks from content before last system message:", extractedTasks.length);
                  } catch (error: any) {
                    console.error("Failed to parse array before system message", error.message);
                  }
                }
              }
            }
          }
          
          // Step 4: Last attempt - try to find any array pattern
          if (extractedTasks.length === 0) {
            const generalArrayMatches = inputJson.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
            
            if (generalArrayMatches && generalArrayMatches.length > 0) {
              console.log("🔸🔸🔸 FOUND GENERAL ARRAY MATCHES:", generalArrayMatches.length, "🔸🔸🔸");
              
              // Try each match until we find valid JSON
              for (let i = 0; i < generalArrayMatches.length; i++) {
                const match = generalArrayMatches[i];
                console.log(`🔹 Match ${i+1}/${generalArrayMatches.length} (first 100 chars): ${match.substring(0, 100)}...`);
                
                try {
                  const possibleTasks = JSON.parse(match);
                  if (Array.isArray(possibleTasks) && possibleTasks.length > 0 && 
                      possibleTasks[0].title && typeof possibleTasks[0].title === 'string') {
                    extractedTasks = possibleTasks;
                    console.log("Extracted tasks from general array pattern:", extractedTasks.length);
                    console.log("✅✅✅ SUCCESSFUL MATCH: ✅✅✅");
                    console.log(match);
                    console.log("✅✅✅ END OF SUCCESSFUL MATCH ✅✅✅");
                    break;
                  }
                } catch (error: any) {
                  // Continue to next match
                  console.log(`❌ Match ${i+1} failed to parse: ${error.message}`);
                }
              }
            }
          }
          
          // If we still don't have tasks, we can consider this an error or empty state
        if (extractedTasks.length === 0) {
            // Handle empty tasks array as a valid state
            console.log("No tasks found after all parsing attempts");
            setParsedTasks([]);
            setNoTasksFound(true);
            return [];
          }
        }
        }
        
        // Process and validate tasks
        const processedTasks = extractedTasks.map((task: any) => ({
          title: task.title || 'Untitled Task',
          details: task.details || '',
          assignee: task.assignee || null,
          group: task.group || null,
          category: task.category || null,
          dueDate: task.dueDate || null,
          priority: task.priority || 'Medium',
          ticketNumber: task.ticketNumber || null,
          externalUrl: task.externalUrl || null
        }));
        
      // Make sure to set the state with processed tasks
        setParsedTasks(processedTasks);
      
      // Set optimization complete to show the confirmation button
      setOptimizationComplete(true);
      
      return processedTasks;
    } catch (error: any) {
      console.error('Error parsing JSON:', error);
      throw new Error(`Failed to extract tasks: ${error.message}`);
    }
  };
  
  // Function to make a fallback direct request instead of streaming
  const makeFallbackRequest = async () => {
    try {
      // Check if file exists
      if (!selectedFile) {
        throw new Error('No file selected for processing');
      }
      
      // Update stage only, not progress
      setCurrentProcessStage('uploading');
      
      // Create new FormData without streaming flag
      const formDataDirect = new FormData();
      formDataDirect.append('file', selectedFile);
      formDataDirect.append('technicians', JSON.stringify(technicians.map(tech => ({ id: tech.id, name: tech.name }))));
      formDataDirect.append('groups', JSON.stringify(groups.map(group => ({ id: group.id, name: group.name }))));
      formDataDirect.append('categories', JSON.stringify(categories.map(cat => ({ id: cat.id, value: cat.value }))));
      formDataDirect.append('useThinkingModel', useThinkingModel.toString());
      formDataDirect.append('isMeetingTranscript', isMeetingTranscript.toString());
      
      // Indicate we're making the request, update stage without setting exact progress
      setCurrentProcessStage('initializing');
      setStreamedOutput(prev => prev + "\n\n[System: Making direct API request for task extraction...]\n");
      
      // Make direct request
      const directResponse = await fetch('/api/gemini/extract-tasks-from-pdf', {
        method: 'POST',
        body: formDataDirect,
      });
      
      // Move to extracting stage - let incrementer handle progress
      setCurrentProcessStage('extracting');
      
      if (!directResponse.ok) {
        const errorData = await directResponse.json();
        throw new Error(errorData.error || errorData.message || 'Failed to analyze document');
      }
      
      let extractedTasks = await directResponse.json();
      
      if (!extractedTasks || extractedTasks.length === 0) {
        // Handle empty tasks array as a valid state
        console.log("No tasks found in direct request response");
        setParsedTasks([]);
        setProcessingComplete(true);
        setOptimizationComplete(true);
        setNoTasksFound(true);
        setCurrentProcessStage('complete');
        return;
      }
      
      // Successfully got tasks, update progress
      setCurrentProcessStage('complete');
      setStreamedOutput(prev => prev + `\n\n[System: Successfully extracted ${extractedTasks.length} tasks directly]\n`);
      
      // Process and validate tasks
      const processedTasks = extractedTasks.map((task: any) => ({
        title: task.title || 'Untitled Task',
        details: task.details || '',
        assignee: task.assignee || null,
        group: task.group || null,
        category: task.category || null,
        dueDate: task.dueDate || null,
        priority: task.priority || 'Medium',
        ticketNumber: task.ticketNumber || null,
        externalUrl: task.externalUrl || null
      }));
      
      setParsedTasks(processedTasks);
      setOptimizationComplete(true); // Set optimization complete
      // Don't set isProcessing to false yet - let user confirm first
    } catch (secondError: any) {
      console.error('Error in fallback document analysis:', secondError);
      setError(secondError.message || 'An error occurred while analyzing the document');
      setIsProcessing(false); // We can set this to false on error
      
      // Show a more user-friendly error that stays on screen
      setStreamedOutput(prevOutput => 
        prevOutput + 
        `\n\n❌ ERROR: ${secondError.message || 'Failed to extract tasks from the document. Please try again or use a different file.'}`
      );
      // Keep in processing complete state but with error
      setProcessingComplete(true); 
      setCountdown(10); // Give more time to see the error
    }
  };
  
  // Add a function to handle user confirmation
  const handleConfirmOptimization = () => {
    setOptimizationComplete(false); // Reset for next time
    setIsProcessing(false); // Now end processing and move to review
  };
  
  // Add a function to download meeting summary as PDF
  const downloadMeetingSummary = async () => {
    if (!meetingSummaryRef.current) return;
    
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // US Letter size
      
      // Add fonts - both regular and bold
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontSize = 11;
      const titleSize = 18;
      const headingSize = 14;
      const subheadingSize = 12;
      const lineHeight = fontSize * 1.5;
      const pageWidth = page.getWidth();
      const margin = 50;
      const textWidth = pageWidth - (margin * 2);
      
      // Keep track of vertical position
      let y = page.getHeight() - margin;
      let currentPage = page;
      
      // Add title
      currentPage.drawText(meetingTitleRef.current, {
        x: margin,
        y,
        size: titleSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      y -= titleSize + 10;
      
      // Add date
      const currentDate = new Date().toLocaleDateString();
      currentPage.drawText(`Generated on ${currentDate}`, {
        x: margin,
        y,
        size: fontSize,
        font: regularFont,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= fontSize * 2;
      
      // Clean the summary text - remove HTML tags but keep new lines
      let plainText = meetingSummaryRef.current.replace(/<[^>]*>/g, '');
      
      // Split by lines
      const lines = plainText.split('\n');
      
      // Process each line with proper formatting
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) {
          y -= lineHeight / 2; // Add a small space for empty lines
          continue;
        }
        
        // Check if we need a new page
        if (y < margin + lineHeight) {
          currentPage = pdfDoc.addPage([612, 792]);
          y = currentPage.getHeight() - margin;
        }
        
        // Process headings
        if (line.startsWith('# ')) {
          // Main heading
          const headingText = line.replace(/^# /, '');
          currentPage.drawText(headingText, {
            x: margin,
            y,
            size: headingSize,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          y -= headingSize + 10;
        } else if (line.startsWith('## ')) {
          // Subheading
          const subheadingText = line.replace(/^## /, '');
          currentPage.drawText(subheadingText, {
            x: margin,
            y,
            size: subheadingSize,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          y -= subheadingSize + 8;
        } else if (line.startsWith('- ')) {
          // Bullet point
          const bulletText = line.replace(/^- /, '');
          
          // Draw bullet
          currentPage.drawText('•', {
            x: margin,
            y,
            size: fontSize,
            font: regularFont,
            color: rgb(0, 0, 0),
          });
          
          // Wrap and draw the bullet text
          y = drawWrappedText(bulletText, currentPage, margin + 15, y, textWidth - 15, lineHeight, fontSize, regularFont, boldFont);
        } else {
          // Regular paragraph - handle text wrapping
          y = drawWrappedText(line, currentPage, margin, y, textWidth, lineHeight, fontSize, regularFont, boldFont);
        }
      }
      
      // Function to draw wrapped text with bold formatting
      function drawWrappedText(text: string, page: PDFPage, x: number, y: number, maxWidth: number, lineHeight: number, fontSize: number, regularFont: PDFFont, boldFont: PDFFont): number {
        // Process markdown ** for bold text and split into segments
        const segments: { text: string, bold: boolean }[] = [];
        let remaining = text;
        let boldStart = -1;
        
        while (remaining.length > 0) {
          boldStart = remaining.indexOf('**');
          
          if (boldStart === -1) {
            // No more bold markers, add the rest as regular text
            if (remaining.length > 0) {
              segments.push({ text: remaining, bold: false });
            }
            break;
          }
          
          // Add text before the bold marker
          if (boldStart > 0) {
            segments.push({ text: remaining.substring(0, boldStart), bold: false });
          }
          
          // Find the end of the bold section
          const boldEnd = remaining.indexOf('**', boldStart + 2);
          if (boldEnd === -1) {
            // Unclosed bold marker, treat the rest as regular text
            segments.push({ text: remaining, bold: false });
            break;
          }
          
          // Add the bold text without the markers
          segments.push({ text: remaining.substring(boldStart + 2, boldEnd), bold: true });
          
          // Continue with the rest of the text
          remaining = remaining.substring(boldEnd + 2);
        }
        
        // If no segments were created (no ** found), add the whole text as one segment
        if (segments.length === 0) {
          segments.push({ text: text, bold: false });
        }
        
        // Now draw the text with wrapping
        let curX = x;
        let curY = y;
        let currentLineWidth = 0;
        let currentLine = '';
        let currentBold = false;
        
        // Process word by word for each segment
        for (const segment of segments) {
          const words = segment.text.split(' ');
          
          for (const word of words) {
            if (!word) continue; // Skip empty words
            
            const font = segment.bold ? boldFont : regularFont;
            const wordWidth = font.widthOfTextAtSize(word + ' ', fontSize);
            
            // Check if this word would exceed the line width
            if (currentLineWidth + wordWidth > maxWidth) {
              // Draw the current line
              if (currentLine) {
                page.drawText(currentLine, {
                  x: curX,
                  y: curY,
                  size: fontSize,
                  font: currentBold ? boldFont : regularFont,
                  color: rgb(0, 0, 0),
                });
              }
              
              // Move to next line
              curY -= lineHeight;
              currentLine = word + ' ';
              currentLineWidth = wordWidth;
              currentBold = segment.bold;
              
              // Check if we need a new page
              if (curY < margin) {
                const newPage = pdfDoc.addPage([612, 792]);
                page = newPage;
                curY = page.getHeight() - margin;
              }
            } else {
              // If we're changing bold state in the middle of a line
              if (currentBold !== segment.bold && currentLine) {
                // Draw the current part of the line
                page.drawText(currentLine, {
                  x: curX,
                  y: curY,
                  size: fontSize,
                  font: currentBold ? boldFont : regularFont,
                  color: rgb(0, 0, 0),
                });
                
                // Update x position for next segment
                curX += (currentBold ? boldFont : regularFont).widthOfTextAtSize(currentLine, fontSize);
                currentLine = '';
                currentBold = segment.bold;
              }
              
              // Add word to current line
              currentLine += word + ' ';
              currentLineWidth += wordWidth;
            }
          }
          
          // Draw the remaining text in this segment
          if (currentLine) {
            page.drawText(currentLine, {
              x: curX,
              y: curY,
              size: fontSize,
              font: currentBold ? boldFont : regularFont,
              color: rgb(0, 0, 0),
            });
            
            // Update positions for next segment
            curX += (currentBold ? boldFont : regularFont).widthOfTextAtSize(currentLine, fontSize);
            currentLine = '';
            currentBold = segment.bold;
          }
        }
        
        // Return the new y position
        return curY - lineHeight;
      }
      
      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      
      // Create a download link with a unique filename based on meeting title and date
      const sanitizedTitle = meetingTitleRef.current
        .replace(/[^a-z0-9\s-]/gi, '') // Remove special characters
        .replace(/\s+/g, '_'); // Replace spaces with underscores
      
      const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `${sanitizedTitle}_${dateStr}.pdf`;
      
      // Create a download link
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF summary. Please try again.');
    }
  };
  
  // Update processing stages when meeting transcript mode changes
  useEffect(() => {
    setProcessingStages([
      { stage: 'Uploading Document', percent: 1 },
      { stage: 'Initializing Analysis', percent: 15 },
      { stage: isMeetingTranscript ? 'Creating Meeting Summary' : 'Reading Document', percent: isMeetingTranscript ? 30 : 20 },
      { stage: 'Extracting Tasks', percent: 50 },
      { stage: 'Optimizing Results', percent: 95 },
      { stage: 'Complete', percent: 100 },
    ]);
  }, [isMeetingTranscript]);
  
  // Function to make progress bar continuously increase during long operations
  const useProgressIncrementer = (currentStage: string, currentProgress: number, targetPercent?: number) => {
    useEffect(() => {
      let incrementInterval: NodeJS.Timeout | undefined;
      const currentStageInfo = processingStages.find(stage => stage.stage.toLowerCase().includes(currentStage));
      const currentTarget = targetPercent || (currentStageInfo?.percent || 0);
      const previousStageInfo = processingStages.findIndex(stage => stage.stage.toLowerCase().includes(currentStage)) > 0 
        ? processingStages[processingStages.findIndex(stage => stage.stage.toLowerCase().includes(currentStage)) - 1] 
        : { percent: 0 };
      
      // Only increment if we're in an active stage and not at target
      if (currentStage !== 'complete' && currentStage !== '' && currentProgress < currentTarget) {
        // Start from current progress or previous stage's percentage
        const startPercent = currentProgress > previousStageInfo.percent ? currentProgress : previousStageInfo.percent;
        
        // Determine increment timing based on the stage
        // Reading/Creating step should be slower because it takes longer
        const isSlowStage = currentStage === 'reading' || currentStage === 'creating';
        
        // Calculate small increment steps (0.1-0.3% per interval for slow stages, 0.2-0.5% for others)
        const incrementFactor = isSlowStage ? 3 : 2; // Higher factor = smaller increments
        const totalIncrements = Math.max(isSlowStage ? 20 : 10, (currentTarget - startPercent) * incrementFactor);
        const incrementSize = (currentTarget - startPercent) / totalIncrements;
        
        // Slower intervals for reading/creating stage (500ms vs 300ms for others)
        const incrementTime = isSlowStage ? 500 : 300;
        
        setUploadProgress(startPercent);
        
        incrementInterval = setInterval(() => {
          setUploadProgress(prev => {
            // Slow down even more as we approach the target for slow stages
            const dynamicIncrementSize = isSlowStage && (prev > (startPercent + (currentTarget - startPercent) * 0.7))
              ? incrementSize * 0.5 // Even smaller increments in the last 30% of the stage
              : incrementSize;
              
            // Stop just short of target to avoid overshooting
            if (prev >= currentTarget - dynamicIncrementSize) {
              if (incrementInterval) clearInterval(incrementInterval);
              return prev;
            }
            return Math.min(prev + dynamicIncrementSize, currentTarget);
          });
        }, incrementTime);
      }
      
      return () => {
        if (incrementInterval) clearInterval(incrementInterval);
      };
    }, [currentStage, currentProgress, targetPercent, processingStages]);
  };
  
  // Set progress to 100% when processing is complete
  useEffect(() => {
    if (currentProcessStage === 'complete') {
      setUploadProgress(100);
    }
  }, [currentProcessStage]);
  
  // Also ensure progress is 100% when optimization is complete
  useEffect(() => {
    if (optimizationComplete) {
      setCurrentProcessStage('complete');
      setUploadProgress(100);
    }
  }, [optimizationComplete]);
  
  // Use the incremented progress
  useProgressIncrementer(currentProcessStage, uploadProgress, undefined);
  
  return (
    <div className="space-y-4 bg-white dark:bg-gray-800 rounded-md">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      
      {/* Show conversion confirmation UI */}
      {showConversionConfirmation && convertedPdfFile && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800/50 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <svg className="h-6 w-6 text-blue-500 dark:text-blue-400 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <h3 className="text-base font-medium text-blue-800 dark:text-blue-300">Word Document Content Extracted</h3>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-200 mb-4">
              Your Word document has been processed. Please verify the content is extracted correctly before proceeding with task analysis.
            </p>
            
            {/* Text Content Preview */}
            <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-300 dark:border-gray-700 mb-4 p-4 max-h-96 overflow-auto">
              {conversionUrl ? (
                <pre className="text-sm whitespace-pre-wrap font-mono text-gray-800 dark:text-gray-200">
                  {atob(conversionUrl.split(',')[1])}
                </pre>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">Processing document content...</p>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0 sm:space-x-3">
              <div>
                <button
                  onClick={downloadConvertedText}
                  className="w-full sm:w-auto px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download Text
                </button>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={cancelConversion}
                  className="w-full sm:w-auto px-4 py-2 border-2 border-red-300 dark:border-red-700 rounded-md text-sm font-medium text-red-700 dark:text-red-200 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Extraction Failed, Go Back
                </button>
                <button
                  onClick={memoizedConfirmProceed}
                  className="w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors flex items-center"
                >
                  Looks Good, Continue
                  {!userInteracted && autoProgressCountdown > 0 && (
                    <span className="ml-2 text-xs bg-white/20 rounded-full h-5 w-5 inline-flex items-center justify-center">
                      {autoProgressCountdown}
                    </span>
                  )}
                </button>
              </div>
            </div>
            
            {/* Auto-progression notice */}
            {!userInteracted && autoProgressCountdown > 0 && (
              <div className="text-center mt-3">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Continuing automatically in {autoProgressCountdown} {autoProgressCountdown === 1 ? 'second' : 'seconds'}...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      
      {showInputView && !showConversionConfirmation && (
        /* Input view - Step 1: PDF upload */
        <div className="space-y-4">
          <div>
            <label htmlFor="pdf-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Upload PDF Document
            </label>
            
            {/* File drop zone */}
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center ${
                selectedFile 
                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' 
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
              } transition-colors cursor-pointer`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                id="pdf-upload"
                ref={fileInputRef}
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,.pdf,.doc,.docx"
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
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drag and drop your PDF or Word document here, or click to browse</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    PDF or Word files only (.pdf, .doc, .docx), max 10MB
                  </p>
                </div>
              )}
            </div>
            
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Upload a PDF or Word document such as meeting minutes, project plans, or emails that contain tasks. 
              Word documents will be automatically converted to PDF for processing.
            </p>
          </div>
          
          {/* Thinking model and transcript toggles */}
          <div className="space-y-3">
          {/* Thinking model toggle */}
          <div className="flex items-center">
            <label htmlFor="thinking-model-toggle" className="flex items-center cursor-pointer">
              <div className="relative inline-flex items-center">
                <input 
                  type="checkbox" 
                  id="thinking-model-toggle" 
                  className="sr-only"
                  checked={useThinkingModel}
                  onChange={toggleThinkingModel} 
                    disabled={isMeetingTranscript} // Disable if transcript mode is on as it requires thinking model
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${useThinkingModel ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <div className={`transform transition-transform duration-200 ease-in-out h-5 w-5 rounded-full bg-white border border-gray-300 inline-block ${useThinkingModel ? 'translate-x-6' : 'translate-x-1'}`} style={{marginTop: '2px'}}></div>
                </div>
                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                  Use Gemini Thinking Model
                </span>
              </div>
            </label>
            <div className="relative ml-2 group">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                aria-label="More information about thinking model"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="absolute hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-60">
                Uses Gemini 2.5 Pro&apos;s enhanced reasoning capabilities for better task extraction. May improve accuracy for complex documents.
                <div className="absolute left-1/2 transform -translate-x-1/2 top-full">
                  <div className="w-2 h-2 bg-black rotate-45"></div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Meeting transcript toggle */}
            <div className="flex items-center">
              <label htmlFor="transcript-toggle" className="flex items-center cursor-pointer">
                <div className="relative inline-flex items-center">
                  <input 
                    type="checkbox" 
                    id="transcript-toggle" 
                    className="sr-only"
                    checked={isMeetingTranscript}
                    onChange={toggleMeetingTranscript} 
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${isMeetingTranscript ? 'bg-amber-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <div className={`transform transition-transform duration-200 ease-in-out h-5 w-5 rounded-full bg-white border border-gray-300 inline-block ${isMeetingTranscript ? 'translate-x-6' : 'translate-x-1'}`} style={{marginTop: '2px'}}></div>
                  </div>
                  <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                    This is a meeting transcript
                  </span>
                </div>
              </label>
              <div className="relative ml-2 group">
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  aria-label="More information about transcript mode"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="absolute hidden group-hover:block bg-black text-white text-xs rounded py-1 px-2 z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72">
                  For documents containing multiple speakers (like meeting minutes or call transcripts). AI will first create a meeting summary before extracting tasks, improving task identification.
                  <div className="absolute left-1/2 transform -translate-x-1/2 top-full">
                    <div className="w-2 h-2 bg-black rotate-45"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAnalyzeDocument}
              className={`px-4 py-2 bg-gradient-to-r ${
                useThinkingModel 
                  ? 'from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800' 
                  : 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
              } text-white rounded-md text-sm shadow-md disabled:opacity-50 flex items-center`}
              disabled={!selectedFile || isProcessing}
            >
              {useThinkingModel ? (
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z"></path>
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              )}
              Analyze with {useThinkingModel ? "Gemini Thinking" : "Gemini"}
            </button>
          </div>
        </div>
      )}
      
      {showProcessingView && (
        /* Processing view - Step 2: Showing model output */
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            {optimizationComplete ? (
              <svg className="h-5 w-5 text-green-500 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="animate-spin h-5 w-5 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {optimizationComplete ? 'Processing Complete!' : 'Processing Document...'}
            </h3>
          </div>
          
          {/* Progress bar with stage label */}
          <div className="w-full space-y-1 mb-4">
            <div className="mb-4">
              <div className="mb-1 flex justify-between items-center">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {currentProcessStage === 'uploading' && 'Uploading Document'}
                  {currentProcessStage === 'initializing' && 'Initializing Analysis'}
                  {currentProcessStage === 'creating' && 'Creating Meeting Summary'}
                  {currentProcessStage === 'reading' && 'Reading Document Content'}
                  {currentProcessStage === 'extracting' && 'Extracting Tasks'}
                  {currentProcessStage === 'optimizing' && 'Optimizing Results'}
                  {currentProcessStage === 'complete' && 'Processing Complete'}
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${uploadProgress}%` }} 
                ></div>
              </div>
            </div>
          </div>
          
          {/* Output display */}
          <div>
              <div 
                ref={streamOutputRef}
              className={`font-mono text-sm overflow-auto max-h-96 p-4 border ${
                  useThinkingModel 
                    ? 'border-purple-200 dark:border-purple-800' 
                    : 'border-gray-200 dark:border-gray-800'
              } rounded-lg bg-white dark:bg-gray-900 whitespace-pre-wrap`}
            >
              <HighlightedOutput text={streamedOutput} />
              <div className="h-4"></div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
              {optimizationComplete 
                ? 'Optimization complete. Review the output above before continuing.'
                : `Gemini ${useThinkingModel ? 'Thinking' : 'AI'} is analyzing your document and extracting tasks in real-time`}
              </p>
            </div>
          
          {/* Buttons with better layout */}
          {optimizationComplete && (
            <div className="flex justify-between mt-4">
          <button
            type="button"
            onClick={onCancel}
                className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
              
              <button
                onClick={handleConfirmOptimization}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                Review Tasks
          </button>
            </div>
          )}
          
          {/* Download summary button (processing view) */}
          {showProcessingView && isMeetingTranscript && meetingSummaryRef.current && optimizationComplete && (
            <div className="mt-4">
              <button
                onClick={downloadMeetingSummary}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download Meeting Summary
              </button>
            </div>
          )}
        </div>
      )}
      
      {showProcessingCompleteView && (
        /* Processing complete view - Step 3: Show completion with countdown */
        <div className="flex flex-col items-center space-y-4 py-6">
          <div className={`w-20 h-20 ${
            error 
              ? 'bg-red-100 dark:bg-red-900/30' 
              : noTasksFound
                ? 'bg-amber-100 dark:bg-amber-900/30'
              : useThinkingModel 
                ? 'bg-purple-100 dark:bg-purple-900/30' 
                : 'bg-green-100 dark:bg-green-900/30'
          } rounded-full flex items-center justify-center`}>
            {error ? (
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : noTasksFound ? (
              <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            ) : useThinkingModel ? (
              <svg className="w-10 h-10 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg className="w-10 h-10 text-green-600 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          
          <div className="text-center">
            <h3 className={`text-lg font-medium ${
              error 
                ? 'text-red-600 dark:text-red-400' 
                : noTasksFound
                  ? 'text-amber-600 dark:text-amber-400'
                : useThinkingModel 
                  ? 'text-purple-600 dark:text-purple-400' 
                  : 'text-green-600 dark:text-green-400'
            }`}>
              {error 
                ? 'Error Processing Document' 
                : noTasksFound
                  ? 'No Tasks Found'
                : useThinkingModel 
                  ? 'Thinking Analysis Complete!' 
                  : 'Document Analysis Complete!'
              }
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {error 
                ? error 
                : noTasksFound
                  ? 'No tasks could be extracted from this document. The document may not contain any task descriptions or action items.'
                : `We found ${parsedTasks?.length || 0} tasks in your document using
                   ${useThinkingModel ? ' Gemini Thinking with enhanced reasoning' : ' Gemini standard analysis'}.`
              }
            </p>
          </div>
          
          {/* Analysis output display */}
          <div className="w-full mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
              <span className={`inline-block h-2 w-2 rounded-full ${
                error 
                  ? 'bg-red-500' 
                  : noTasksFound
                    ? 'bg-amber-500'
                  : useThinkingModel 
                    ? 'bg-purple-500' 
                    : 'bg-green-500'
              } mr-2`}></span>
              {error 
                ? 'Error Details:' 
                : noTasksFound
                  ? 'Details:'
                : useThinkingModel 
                  ? 'Gemini Thinking output:' 
                  : 'Analysis output:'
              }
            </h3>
            <div 
              ref={streamOutputRef}
              className={`bg-gray-50 dark:bg-gray-900 border-2 ${
                error
                  ? 'border-red-200 dark:border-red-800'
                  : noTasksFound
                    ? 'border-amber-200 dark:border-amber-800'
                  : useThinkingModel 
                    ? 'border-purple-200 dark:border-purple-800' 
                    : 'border-gray-200 dark:border-gray-800'
              } rounded-lg p-4 h-64 overflow-auto font-mono text-xs relative`}
            >
              {streamedOutput.split('\n').map((line, i) => (
                <div key={i} className={`leading-relaxed ${
                  line.includes('ERROR:') 
                    ? 'text-red-600 dark:text-red-400 font-semibold' 
                    : i === streamedOutput.split('\n').length - 1 && !error && !noTasksFound
                      ? `${useThinkingModel ? 'text-purple-600 dark:text-purple-400' : 'text-green-600 dark:text-green-400'} font-semibold animate-pulse` 
                      : ''
                }`}>
                  {line || <br />}
                </div>
              ))}
            </div>
            {error && (
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Returning to document upload in <span className="font-medium">{countdown}</span> {countdown === 1 ? 'second' : 'seconds'}...
                </p>
                <button
                  type="button"
                  onClick={toggleCountdown}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isPaused ? "Resume countdown" : "Pause countdown"}
                </button>
              </div>
            )}
          </div>
          
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            {error ? (
              <button
                type="button"
                onClick={handleBackToInput}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm shadow flex items-center"
              >
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Try Again
              </button>
            ) : noTasksFound ? (
              <button
                type="button"
                onClick={handleBackToInput}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm shadow flex items-center"
              >
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Go Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setProcessingComplete(false); 
                  setIsProcessing(false);
                }}
                className={`px-4 py-2 ${
                  useThinkingModel 
                    ? 'bg-purple-600 hover:bg-purple-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white rounded-md text-sm shadow flex items-center`}
              >
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Continue to Review
              </button>
            )}
          </div>
        </div>
      )}
      
      {showReviewView && parsedTasks && (
        <TaskReviewForm
          parsedTasks={parsedTasks}
          technicians={technicians}
          groups={groups}
          categories={categories}
          onSubmit={handleSubmitTasks}
          onBack={handleBackToInput}
          onCreateGroup={onCreateGroup}
          isThinkingModel={useThinkingModel}
        />
      )}
    </div>
  );
} 
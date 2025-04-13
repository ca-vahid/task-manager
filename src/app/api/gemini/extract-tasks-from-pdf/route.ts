import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { StreamingTextResponse } from 'ai';

// Initialize the Gemini API with the key from environment variables
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

// Model constants
const STANDARD_MODEL = "gemini-2.0-flash";
const THINKING_MODEL = "gemini-2.5-pro-preview-03-25";

// Task schema for structured output
const TASK_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Clear, concise title summarizing the task" },
          details: { type: "string", description: "Detailed explanation of the task in HTML format" },
          assignee: { type: "string", nullable: true, description: "Person assigned to the task" },
          group: { type: "string", nullable: true, description: "Group responsible for the task" },
          category: { type: "string", nullable: true, description: "Category the task belongs to" },
          dueDate: { type: "string", format: "date", nullable: true, description: "Due date in YYYY-MM-DD format" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "Task priority level" },
          ticketNumber: { type: "string", nullable: true, description: "Associated ticket number" },
          externalUrl: { type: "string", nullable: true, description: "External URL related to the task" }
        },
        required: ["title", "details"]
      }
    }
  },
  required: ["tasks"]
};

// In-memory job storage (would use a database in production)
const jobStorage = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startTime: number;
  pdfData: string;
  processingOptions: {
    technicians: any[];
    groups: any[];
    categories: any[];
    useThinkingModel: boolean;
  };
}>();

// Cleanup function to remove old jobs (run periodically)
const cleanupJobs = () => {
  const now = Date.now();
  const MAX_AGE_MS = 1000 * 60 * 30; // 30 minutes
  
  for (const [jobId, job] of jobStorage.entries()) {
    if (now - job.startTime > MAX_AGE_MS) {
      jobStorage.delete(jobId);
    }
  }
};

// Schedule cleanup every 5 minutes (only if running in a non-serverless environment)
if (typeof window === 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(cleanupJobs, 1000 * 60 * 5);
}

// Function to check if response seems incomplete or cut off
function isResponseIncomplete(text: string): boolean {
  // Check for signs of cutoff or incomplete response
  if (!text) return true;
  
  // Check if the response has a complete JSON structure
  try {
    JSON.parse(text);
    return false; // Successfully parsed, likely complete
  } catch (e) {
    // Check for unclosed JSON brackets
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    
    // If mismatched braces, probably incomplete
    if (openBraces !== closeBraces) return true;
    
    // Check for trailing quotes or commas which could indicate cutoff
    if (text.trim().endsWith('"') || text.trim().endsWith(',')) return true;
    
    // If JSON parsing failed but braces match, might be other JSON format issues
    return true;
  }
}

// Function to optimize and consolidate tasks using the thinking model
async function optimizeTasks(tasks: any[], streamController?: ReadableStreamDefaultController): Promise<any[]> {
  if (!tasks || tasks.length === 0) {
    if (streamController) {
      streamController.enqueue(new TextEncoder().encode("\n[System: No tasks to optimize. Returning original input.]\n"));
    }
    return tasks; // Nothing to optimize
  }
  
  if (streamController) {
    streamController.enqueue(new TextEncoder().encode(`\n[System: Starting task optimization with ${tasks.length} tasks...]\n`));
  }
  
  console.log(`Starting task optimization with ${tasks.length} tasks using Thinking model`);
  
  try {
    if (streamController) {
      streamController.enqueue(new TextEncoder().encode("\n[System: Creating optimization prompt for Gemini...]\n"));
    }
    
    // Create a new Gemini API client for task optimization
    const optimizationGenAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || ""
    });
    
    // Always use the thinking model for optimization
    const chat = optimizationGenAI.chats.create({
      model: THINKING_MODEL
    });
    
    // Create a comprehensive prompt that focuses on consolidation and optimization
    const prompt = `
      I need you to optimize this list of tasks by removing duplicates and consolidating related items.
      
      Here's the list of tasks extracted from a document:
      ${JSON.stringify(tasks, null, 2)}
      
      Please:
      1. Go through these tasks carefully
      2. Remove duplicate tasks 
      3. Combine and merge related tasks when possible
      4. Account for typos in the original transcript when deciding if tasks are similar
      5. Ensure each final task is comprehensive and clear
      
      Return ONLY the optimized JSON array of tasks with the same structure as the input. 
      Do not include any explanation or additional text.
    `;
    
    if (streamController) {
      streamController.enqueue(new TextEncoder().encode("\n[System: Sending optimization request to Gemini...]\n"));
    }
    
    // Use streaming if available
    if (streamController) {
      try {
        const responseStream = await chat.sendMessageStream({
          message: prompt
        });
        
        streamController.enqueue(new TextEncoder().encode("\n[System: Receiving optimization results in real-time...]\n"));
        
        let outputText = '';
        for await (const chunk of responseStream) {
          if (chunk && chunk.text) {
            outputText += chunk.text;
            
            // Send the actual text content to show streaming progress
            streamController.enqueue(new TextEncoder().encode(chunk.text));
          }
        }
        
        streamController.enqueue(new TextEncoder().encode("\n[System: Optimization complete, finalizing results...]\n"));
        
        // Extract the JSON array from the streamed response
        try {
          // Try to parse the entire accumulated response
          const optimizedTasks = JSON.parse(outputText);
          
          streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${optimizedTasks.length} tasks]\n`));
          
          return optimizedTasks;
        } catch (parseError) {
          // If that fails, try to find a JSON array in the response
          const arrayMatch = outputText.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            const optimizedTasks = JSON.parse(arrayMatch[0]);
            
            streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${optimizedTasks.length} tasks]\n`));
            
            return optimizedTasks;
          }
          
          // Handle case where model returns {tasks: [...]}
          try {
            const parsedJson = JSON.parse(outputText);
            if (Array.isArray(parsedJson)) {
              streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${parsedJson.length} tasks]\n`));
              return parsedJson;
            } else if (parsedJson.tasks && Array.isArray(parsedJson.tasks)) {
              streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${parsedJson.tasks.length} tasks]\n`));
              return parsedJson.tasks;
            }
          } catch (nestedError) {
            // Already in error handling, just continue to fallback
          }
          
          // Fallback to original tasks
          streamController.enqueue(new TextEncoder().encode("\n[System: Could not parse optimization result, using original tasks]\n"));
          return tasks;
        }
      } catch (streamError) {
        streamController.enqueue(new TextEncoder().encode(`\n[System: Error during streaming optimization: ${streamError instanceof Error ? streamError.message : 'Unknown error'}]\n`));
        // Fall back to non-streaming approach
      }
    }
    
    // Non-streaming fallback approach
    const response = await chat.sendMessage({
      message: prompt
    });
    
    const outputText = response?.text || "";
    
    if (streamController) {
      streamController.enqueue(new TextEncoder().encode("\n[System: Received optimization results (non-streaming)]\n"));
    }
    
    // Extract the JSON array from the response
    try {
      // First try to find a JSON array
      const arrayMatch = outputText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const optimizedTasks = JSON.parse(arrayMatch[0]);
        
        if (streamController) {
          streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${optimizedTasks.length} tasks]\n`));
        }
        
        console.log(`Successfully optimized: ${tasks.length} → ${optimizedTasks.length} tasks`);
        return optimizedTasks;
      }
      
      // If no array found, try to parse the entire response as JSON
      try {
        const parsedJson = JSON.parse(outputText);
        if (Array.isArray(parsedJson)) {
          if (streamController) {
            streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${parsedJson.length} tasks]\n`));
          }
          
          console.log(`Successfully optimized: ${tasks.length} → ${parsedJson.length} tasks`);
          return parsedJson;
        } else if (parsedJson.tasks && Array.isArray(parsedJson.tasks)) {
          // Handle case where model returns {tasks: [...]}
          if (streamController) {
            streamController.enqueue(new TextEncoder().encode(`\n[System: Successfully optimized: ${tasks.length} → ${parsedJson.tasks.length} tasks]\n`));
          }
          
          console.log(`Successfully optimized: ${tasks.length} → ${parsedJson.tasks.length} tasks`);
          return parsedJson.tasks;
        }
      } catch (parseError) {
        console.error("Failed to parse response as JSON, falling back to original tasks");
        
        if (streamController) {
          streamController.enqueue(new TextEncoder().encode("\n[System: Failed to parse optimization response as JSON]\n"));
        }
      }
      
      // Fallback to original tasks if we couldn't parse the response
      if (streamController) {
        streamController.enqueue(new TextEncoder().encode("\n[System: Could not extract task array from model response]\n"));
      }
      
      console.error("Could not extract task array from model response");
      return tasks;
    } catch (error) {
      if (streamController) {
        streamController.enqueue(new TextEncoder().encode(`\n[System: Error during task optimization: ${error instanceof Error ? error.message : 'Unknown error'}]\n`));
      }
      
      console.error("Error during task optimization:", error);
      // Return original tasks if there was an error
      return tasks;
    }
  } catch (error) {
    if (streamController) {
      streamController.enqueue(new TextEncoder().encode(`\n[System: Error during task optimization: ${error instanceof Error ? error.message : 'Unknown error'}]\n`));
    }
    
    console.error("Error during task optimization:", error);
    // Return original tasks if there was an error
    return tasks;
  }
}

// Function to process a PDF document and extract tasks
async function processPdfJob(jobId: string): Promise<void> {
  const job = jobStorage.get(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }
  
  try {
    job.status = 'processing';
    
    const { pdfData, processingOptions } = job;
    const { technicians, groups, categories, useThinkingModel } = processingOptions;
    
    // Select the appropriate model based on user preference
    const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
    
    // Generate the initial prompt for Gemini
    const initialPrompt = `
      You are a task extraction assistant that analyzes PDFs to identify tasks.
      
      ${technicians.length > 0 
        ? `Available technicians: ${technicians.map((tech: any) => tech.name).join(', ')}.`
        : 'No technicians specified.'}
      
      ${groups.length > 0 
        ? `Available groups: ${groups.map((group: any) => group.name).join(', ')}.`
        : 'No groups specified.'}
      
      ${categories.length > 0
        ? `Available categories: ${categories.map((cat: any) => cat.value).join(', ')}.`
        : 'No categories specified.'}
      
      Please analyze the attached PDF document and extract tasks that need to be done.
      
      For each task, extract:
      
      1. Title - A clear, concise title that summarizes the task
      2. Details - A detailed explanation of what the task involves, formatted as HTML with proper paragraphs, lists, and basic formatting
      3. Assignee - The person assigned to the task (from the available technicians if mentioned)
      4. Group - The group responsible for the task (from the available groups if mentioned)
      5. Category - The most appropriate category for the task (from the available categories)
      6. Due date - Preferred in YYYY-MM-DD format if mentioned, otherwise null
      7. Priority - Low, Medium, High, or Critical based on urgency mentioned
      8. Ticket number - If mentioned in the document
      9. External URL - If mentioned in the document
      
      Extract as many tasks as you can find in the document. If information isn't available for certain fields, set them to null.
      
      Format your response as valid JSON in this structure:
      {
        "tasks": [
          {
            "title": "Task title",
            "details": "<p>Task details as HTML</p>",
            "assignee": "Name of assignee or null",
            "group": "Group name or null",
            "category": "Category value or null",
            "dueDate": "YYYY-MM-DD or two weeks from today if you can't find a specific date",
            "priority": "Low|Medium|High|Critical"
          }
        ]
      }
    `;

    // For the thinking model, set up the generation config
    const generationConfig = useThinkingModel ? {
      responseStructure: { schema: TASK_SCHEMA }
    } : {};

    // Initial PDF content as attachment
    const initialMessageContent = [
      { text: initialPrompt },
      { 
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfData
        }
      }
    ];

    // Create a chat instance to maintain conversation context
    const chat = genAI.chats.create({
      model: MODEL,
      ...(useThinkingModel ? { generationConfig } : {})
    });

    // Start with the initial PDF content
    let responseText = '';
    
    try {
      // Send the initial message with PDF
      const chatResponse = await chat.sendMessage({
        message: initialMessageContent
      });
      
      responseText += chatResponse.text || '';
      
      // Check if the response seems complete
      if (isResponseIncomplete(responseText)) {
        // Send a follow-up message asking to continue
        console.log("Response seems incomplete. Requesting continuation...");
        
        const continuationResponse = await chat.sendMessage({
          message: "Please continue. It seems your response was cut off. Complete the JSON output of the tasks you were extracting."
        });
        
        responseText += continuationResponse.text || '';
        
        // Check if we need a final message to complete/wrap up - only for standard model
        if (!useThinkingModel && isResponseIncomplete(responseText)) {
          console.log("Response still incomplete. Sending final request...");
          
          const finalResponse = await chat.sendMessage({
            message: "Please ensure your response is complete and properly formatted as JSON. If you're done, please state 'EXTRACTION COMPLETE'."
          });
          
          responseText += finalResponse.text || '';
        }
      }

      // Try to extract tasks from the response
      let extractedTasks = [];
      try {
        // More aggressive patterns to find JSON
        let jsonData = null;
        
        // First, try to find a tasks array pattern
        const tasksArrayPattern = /"tasks"\s*:\s*\[([\s\S]*?)\]/;
        const tasksMatch = responseText.match(tasksArrayPattern);
        
        if (tasksMatch) {
          // Try to extract the tasks array by reconstructing it
          try {
            const tasksJsonText = `{"tasks":[${tasksMatch[1]}]}`;
            jsonData = JSON.parse(tasksJsonText);
          } catch (arrayParseError) {
            console.error("Failed to parse tasks array:", arrayParseError);
          }
        }
        
        // If tasks array extraction failed, try for complete JSON object
        if (!jsonData) {
          // Try to extract the JSON object with more permissive pattern
          const jsonPattern = /\{[\s\S]*?("tasks"\s*:[\s\S]*?|\[[\s\S]*?\])[\s\S]*?\}/g;
          const jsonMatches = [...responseText.matchAll(jsonPattern)];
          
          if (jsonMatches.length > 0) {
            // Try each match until we find one that parses
            for (const match of jsonMatches) {
              try {
                const possibleJson = match[0];
                jsonData = JSON.parse(possibleJson);
                break; // If parsing succeeds, break out of the loop
              } catch (err) {
                // Continue to the next match
              }
            }
          }
        }
        
        // Standard fallback for basic JSON object
        if (!jsonData) {
          const basicJsonMatch = responseText.match(/\{[\s\S]*?\}/);
          if (basicJsonMatch) {
            try {
              jsonData = JSON.parse(basicJsonMatch[0]);
            } catch (e) {
              console.error("Failed to parse even basic JSON match");
            }
          }
        }
        
        // Process whatever JSON data we found
        if (jsonData) {
          if (jsonData.tasks && Array.isArray(jsonData.tasks)) {
            extractedTasks = jsonData.tasks;
          } else if (Array.isArray(jsonData)) {
            extractedTasks = jsonData;
          } else {
            // Check if this is actually a task object itself
            if (jsonData.title && typeof jsonData.title === 'string') {
              extractedTasks = [jsonData]; // Single task object
            }
          }
        }
        
        // Last resort: Try to find an array pattern directly
        if (extractedTasks.length === 0) {
          const arrayPattern = /\[\s*\{\s*"title"[\s\S]*?\}\s*\]/;
          const arrayMatch = responseText.match(arrayPattern);
          if (arrayMatch) {
            try {
              const possibleArray = JSON.parse(arrayMatch[0]);
              if (Array.isArray(possibleArray)) {
                extractedTasks = possibleArray;
              }
            } catch (e) {
              console.error("Failed to parse array pattern");
            }
          }
        }
        
        // Ensure each task has all required fields
        if (extractedTasks.length > 0) {
          extractedTasks = extractedTasks.map((task: any) => ({
            title: task.title || "Untitled Task",
            details: task.details || task.explanation || "",
            assignee: task.assignee || null,
            group: task.group || null,
            category: task.category || null,
            dueDate: task.dueDate || null,
            priority: task.priority || "Medium",
            ticketNumber: task.ticketNumber || null,
            externalUrl: task.externalUrl || null
          }));
        }
      } catch (e: unknown) {
        console.error("Failed to parse JSON from response:", e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        throw new Error(`Failed to parse tasks from Gemini response: ${errorMessage}`);
      }
      
      // If still no tasks after all attempts, throw an error
      if (extractedTasks.length === 0) {
        throw new Error("No tasks could be extracted from the document");
      }
      
      // Optimize tasks if we have them
      if (extractedTasks.length > 0) {
        console.log(`Extracted ${extractedTasks.length} tasks. Optimizing...`);
        const optimizedTasks = await optimizeTasks(extractedTasks);
        
        // Update job with successful result
        job.status = 'completed';
        job.result = optimizedTasks;
      } else {
        throw new Error("No tasks could be extracted from the document");
      }
    } catch (error: any) {
      console.error("Error processing PDF:", error);
      job.status = 'failed';
      job.error = error.message || "Unknown error occurred during processing";
    }
  } catch (error: any) {
    console.error("Error in processPdfJob:", error);
    job.status = 'failed';
    job.error = error.message || "Unknown error occurred";
  }
}

// Handle job status request (for transition/backward compatibility)
function handleJobStatusRequest(jobId: string) {
  const job = jobStorage.get(jobId);
  
  if (!job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }
  
  // Return the job status (and result if completed)
  return NextResponse.json({
    jobId,
    status: job.status,
    result: job.status === 'completed' ? job.result : undefined,
    error: job.status === 'failed' ? job.error : undefined,
    elapsedTime: Date.now() - job.startTime
  });
}

// Main route handler for PDF extraction
export async function POST(req: Request) {
  // Check if it's a status check request
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const jobId = url.searchParams.get('jobId');
  
  if (action === 'status' && jobId) {
    // Handle job status request - we'll still support this for transition
    return handleJobStatusRequest(jobId);
  }
  
  // Process a new extraction request
  try {
    const formData = await req.formData();
    
    // Check if this is extracted text content from a Word document
    const isExtractedText = formData.get('isExtractedText') === 'true';
    const textContent = formData.get('textContent') as string;
    const originalFileName = formData.get('originalFileName') as string;
    
    let base64File = '';
    
    if (isExtractedText && textContent) {
      // For extracted text content, we'll encode it as base64
      console.log('Processing extracted text from Word document:', originalFileName);
      base64File = Buffer.from(textContent).toString('base64');
    } else {
      // Get the PDF file from the request
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: "No file or text content was provided" }, { status: 400 });
      }
      
      // Validate file type for PDFs
      if (!isExtractedText && file.type !== 'application/pdf') {
        return NextResponse.json({ error: "Only PDF files are supported. Word documents should be converted to text before uploading." }, { status: 400 });
      }
      
      // Get the file content as base64
      const fileBuffer = await file.arrayBuffer();
      base64File = Buffer.from(fileBuffer).toString('base64');
    }
    
    // Get context data from the request
    const techniciansJson = formData.get('technicians') as string;
    const groupsJson = formData.get('groups') as string;
    const categoriesJson = formData.get('categories') as string;
    const useThinkingModelStr = formData.get('useThinkingModel') as string;
    const isMeetingTranscriptStr = formData.get('isMeetingTranscript') as string;
    
    // Parse JSON strings into objects
    const technicians = techniciansJson ? JSON.parse(techniciansJson) : [];
    const groups = groupsJson ? JSON.parse(groupsJson) : [];
    const categories = categoriesJson ? JSON.parse(categoriesJson) : [];
    const useThinkingModel = useThinkingModelStr === 'true';
    const isMeetingTranscript = isMeetingTranscriptStr === 'true';
    
    // Always use streaming for better UX
    return await handleStreamingRequest(
      base64File,
      technicians,
      groups,
      categories,
      useThinkingModel,
      isMeetingTranscript,
      isExtractedText
    );
    
  } catch (error: any) {
    console.error("Error processing document with Gemini:", error);
    return NextResponse.json(
      { 
        error: "An error occurred while processing the document",
        details: error.message || "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// Add meeting transcript processing to handleStreamingRequest function

async function handleStreamingRequest(
  base64File: string,
  technicians: any[],
  groups: any[],
  categories: any[],
  useThinkingModel: boolean,
  isMeetingTranscript = false, // Add this parameter with default value
  isExtractedText = false // Add this parameter to indicate text content
) {
  // Transcript processing requires thinking model
  if (isMeetingTranscript) {
    useThinkingModel = true;
  }

  // Select the appropriate model based on user preference
  const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
  
  // Start with a progress update for better UX
  const modelTypeMsg = useThinkingModel 
    ? isMeetingTranscript 
      ? "Using Gemini Thinking model for transcript processing..." 
      : "Using Gemini Thinking model..."
    : "Using Gemini standard model...";
  
  // Create context strings for technicians, groups, and categories
  const technicianContext = technicians.length > 0 
    ? `Available technicians: ${technicians.map((tech: any) => tech.name).join(', ')}.`
    : 'No technicians specified.';
  
  const groupContext = groups.length > 0 
    ? `Available groups: ${groups.map((group: any) => group.name).join(', ')}.`
    : 'No groups specified.';
  
  const categoryContext = categories.length > 0
    ? `Available categories: ${categories.map((cat: any) => cat.value).join(', ')}.`
    : 'No categories specified.';
  
  // Create a text-decoder stream for the Gemini response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Add initial processing update
        const documentType = isExtractedText ? 'Word document' : 'PDF document';
        controller.enqueue(new TextEncoder().encode(`📃 Analyzing ${isMeetingTranscript ? 'meeting transcript' : documentType}\n${modelTypeMsg}\n\n`));
        
        // For meeting transcripts, we first summarize the meeting
        let meetingSummary = '';
        let initialPrompt = '';
        let initialMessageContent = [];
        let streamResponseText = '';
        
        if (isMeetingTranscript) {
          // Step 1: Create a meeting summary first
          controller.enqueue(new TextEncoder().encode("🔍 Step 1: Creating meeting summary from transcript...\n\n"));
          
          // Modify the meeting summary prompt to include a request for a meeting title
          const summaryPrompt = `
            You're analyzing a transcript of a meeting with multiple participants. 
            
            First, create a detailed summary of the meeting that addresses:
            
            1. Main topics discussed
            2. Key decisions made
            3. Any identified problems or challenges
            4. Important action items or tasks mentioned

            Please include as much details about these as possible. Do not be breief, this summary will be used to create detailed tasks for these employees so your extraction should not omit any information, infac the opposite you should try and collect as much information as possible throughtout the entire transcript text
            
            Format your response as a well-structured meeting summary with clear sections and bullet points where appropriate.
            Use this format:
            
            # MEETING TITLE: [Create a short, descriptive title for this meeting based on its content]
            
            ## Overview
            [Provide a brief overview of the meeting purpose and participants]
            
            ## Main Topics Discussed
            - [Topic 1]
            - [Topic 2]
            ...
            
            ## Key Decisions
            - [Decision 1]
            - [Decision 2]
            ...
            
            ## Problems & Challenges Identified
            - [Problem 1]
            - [Problem 2]
            ...
            
            ## Detailed Action Items & Tasks
            - [Task 1]
            - [Task 2]
            ...
            
            
            When you've completed the summary, state "MEETING SUMMARY COMPLETE".
          `;
          
          // Create the initial content as attachment
          const summaryMessageContent = isExtractedText
            ? [
                { text: summaryPrompt },
                { text: Buffer.from(base64File, 'base64').toString() }
              ]
            : [
                { text: summaryPrompt },
                { 
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: base64File
                  }
                }
              ];
          
          // Create a chat instance for meeting summary
          const summaryChat = genAI.chats.create({
            model: THINKING_MODEL // Always use thinking model for summaries
          });
          
          // Start streaming the summary process
          const summaryStream = await summaryChat.sendMessageStream({
            message: summaryMessageContent
          });
          
          // Process the summary stream
          for await (const chunk of summaryStream) {
            if (chunk && chunk.text) {
              meetingSummary += chunk.text;
              
              // Send the actual summary chunk to the frontend stream
              controller.enqueue(new TextEncoder().encode(chunk.text));
              
              // Check for completion marker, but don't send progress dots anymore
              if (chunk.text.includes('MEETING SUMMARY COMPLETE')) {
                controller.enqueue(new TextEncoder().encode("\n[System: Meeting summary generation complete]\n"));
              }
            }
          }
          
          // Show a completion message instead of the full summary
          controller.enqueue(new TextEncoder().encode("\n[System: Meeting summary generated successfully. You can download it after processing is complete.]\n"));
          
          // After collecting the meeting summary, extract the meeting title for later use
          let meetingTitle = "Meeting Summary";
          const titleMatch = meetingSummary.match(/# MEETING TITLE: ([^\n]+)/);
          if (titleMatch && titleMatch[1]) {
            meetingTitle = titleMatch[1].trim();
            controller.enqueue(new TextEncoder().encode(`\n[System: Meeting Title: "${meetingTitle}"]\n`));
          }
          
          // Add the title to the meeting summary data markers for the client to extract
          controller.enqueue(new TextEncoder().encode("\n\n[MEETING-TITLE-DATA]" + meetingTitle + "[/MEETING-TITLE-DATA]\n\n"));
          
          // Check if meeting summary is complete
          if (!meetingSummary.includes("MEETING SUMMARY COMPLETE")) {
            // Ask for completion
            controller.enqueue(new TextEncoder().encode("\n\n[System: Summary seems incomplete. Requesting completion...]\n\n"));
            
            const completionStream = await summaryChat.sendMessageStream({
              message: "Please complete the meeting summary. When finished, state 'MEETING SUMMARY COMPLETE'."
            });
            
            // Process the completion stream
            for await (const chunk of completionStream) {
              if (chunk && chunk.text) {
                meetingSummary += chunk.text;
                // Don't show the content, just progress indicators
                if (chunk.text.includes('MEETING SUMMARY COMPLETE')) {
                  controller.enqueue(new TextEncoder().encode("\n[System: Meeting summary completion finished]\n"));
                }
              }
            }
          }
          
          // Now prepare for task extraction using the meeting summary
          controller.enqueue(new TextEncoder().encode("\n\n🔍 Step 2: Extracting tasks from meeting summary...\n\n"));
          
          // Generate the task extraction prompt
          initialPrompt = `
            Using the meeting summary I just provided, please identify and extract all tasks and action items mentioned.
            
            ${technicianContext}
            ${groupContext}
            ${categoryContext}
            
            For each task, extract:
            
            1. Title - A clear, concise title that summarizes the task
            2. Details - A detailed explanation of what the task involves, formatted as HTML with proper paragraphs, lists, and basic formatting
            3. Assignee - The person assigned to the task (from the available technicians if mentioned)
            4. Group - The group responsible for the task (from the available groups if mentioned)
            5. Category - The most appropriate category for the task (from the available categories)
            6. Due date - Preferred in YYYY-MM-DD format if mentioned, otherwise null
            7. Priority - Low, Medium, High, or Critical based on urgency mentioned
            8. Ticket number - If mentioned in the document
            9. External URL - If mentioned in the document
            
            Extract as many tasks as you can find in the meeting summary. If information isn't available for certain fields, set them to null.
            
            Format your response as valid JSON in this structure:
            {
              "tasks": [
                {
                  "title": "Task title",
                  "details": "<p>Task details as HTML</p>",
                  "assignee": "Name of assignee or null",
                  "group": "Group name or null",
                  "category": "Category value or null",
                  "dueDate": "YYYY-MM-DD or null",
                  "priority": "Low|Medium|High|Critical",
                  "ticketNumber": "Ticket number or null",
                  "externalUrl": "URL or null"
                }
              ]
            }
          `;
          
          // Set up the message content with the meeting summary
          initialMessageContent = [
            { text: initialPrompt },
            { text: meetingSummary }
          ];
          
        } else {
          // Regular document processing
          // Generate the initial prompt for Gemini
          initialPrompt = `
            You are a task extraction assistant that analyzes ${isExtractedText ? 'document text' : 'PDFs'} to identify tasks.
            
            ${technicianContext}
            ${groupContext}
            ${categoryContext}
            
            Please analyze the ${isExtractedText ? 'text content' : 'attached PDF document'} and extract tasks that need to be done.
            
            For each task, extract:
            
            1. Title - A clear, concise title that summarizes the task
            2. Details - A detailed explanation of what the task involves, formatted as HTML with proper paragraphs, lists, and basic formatting
            3. Assignee - The person assigned to the task (from the available technicians if mentioned)
            4. Group - The group responsible for the task (from the available groups if mentioned)
            5. Category - The most appropriate category for the task (from the available categories)
            6. Due date - Preferred in YYYY-MM-DD format if mentioned, otherwise null
            7. Priority - Low, Medium, High, or Critical based on urgency mentioned
            8. Ticket number - If mentioned in the document
            9. External URL - If mentioned in the document
            
            Extract as many tasks as you can find in the ${isExtractedText ? 'text' : 'document'}. If information isn't available for certain fields, set them to null.
            
            ${useThinkingModel ? 'As you analyze the content, please provide your thoughts and reasoning throughout the process so I can see your work.' : ''}

            Format your response as valid JSON in this structure:
            {
              "tasks": [
                {
                  "title": "Task title",
                  "details": "<p>Task details as HTML</p>",
                  "assignee": "Name of assignee or null",
                  "group": "Group name or null",
                  "category": "Category value or null",
                  "dueDate": "YYYY-MM-DD or null",
                  "priority": "Low|Medium|High|Critical",
                  "ticketNumber": "Ticket number or null",
                  "externalUrl": "URL or null"
                }
              ]
            }
          `;

          // Set up initialMessageContent based on content type
          if (isExtractedText) {
            // For extracted text, send as plain text
            initialMessageContent = [
              { text: initialPrompt },
              { text: Buffer.from(base64File, 'base64').toString() }
            ];
          } else {
            // For PDF, send as attachment
            initialMessageContent = [
              { text: initialPrompt },
              { 
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64File
                }
              }
            ];
          }
        }

        // For the thinking model, set up the generation config
        const generationConfig = useThinkingModel ? {
          responseStructure: { schema: TASK_SCHEMA }
        } : {};

        // Create a chat instance to maintain conversation context
        const chat = genAI.chats.create({
          model: MODEL,
          ...(useThinkingModel ? { generationConfig } : {})
        });

        // Add a progress indicator
        if (useThinkingModel && !isMeetingTranscript) {
          controller.enqueue(new TextEncoder().encode("🧠 Thinking model is analyzing your document. You'll see real-time progress as it works...\n\n"));
        }
        
        // Send the initial message
        const chatStream = await chat.sendMessageStream({
          message: initialMessageContent
        });
        
        // Process the initial stream
        for await (const chunk of chatStream) {
          if (chunk && chunk.text) {
            streamResponseText += chunk.text;
            controller.enqueue(new TextEncoder().encode(chunk.text));
          }
        }
        
        // Check if the response seems complete
        if (isResponseIncomplete(streamResponseText)) {
          // Send a follow-up message asking to continue
          controller.enqueue(new TextEncoder().encode("\n\n[System: Response seems incomplete. Requesting continuation...]\n\n"));
          
          const continuationStream = await chat.sendMessageStream({
            message: "Please continue. It seems your response was cut off. Complete the JSON output of the tasks you were extracting."
          });
          
          // Process the continuation stream
          for await (const chunk of continuationStream) {
            if (chunk && chunk.text) {
              streamResponseText += chunk.text;
              controller.enqueue(new TextEncoder().encode(chunk.text));
            }
          }
          
          // Check if we need a final message to complete/wrap up - only for standard model
          if (!useThinkingModel) {
            controller.enqueue(new TextEncoder().encode("\n\n[System: Finalizing response...]\n\n"));
            
            const finalStream = await chat.sendMessageStream({
              message: "Continue. If you're done, please state 'EXTRACTION COMPLETE'."
            });
            
            // Process the final stream
            for await (const chunk of finalStream) {
              if (chunk && chunk.text) {
                streamResponseText += chunk.text;
                controller.enqueue(new TextEncoder().encode(chunk.text));
              }
            }
          }
        }

        // Always perform task optimization as a final step
        controller.enqueue(new TextEncoder().encode("\n\n[System: Optimizing and consolidating tasks...]\n\n"));
        
        try {
          // Extract and optimize tasks
          const extractedTasks = extractTasksFromText(streamResponseText);
          
          if (extractedTasks.length > 0) {
            // Show task count
            controller.enqueue(new TextEncoder().encode(`[System: Found ${extractedTasks.length} tasks in the ${isMeetingTranscript ? 'meeting summary' : 'document'}. `));
            
            // Skip optimization for 4 or fewer tasks
            if (extractedTasks.length <= 4) {
              controller.enqueue(new TextEncoder().encode(`Skipping optimization for ${extractedTasks.length} tasks as it's not needed for small task sets.]\n\n`));
              
              // Output the tasks as JSON directly
              controller.enqueue(new TextEncoder().encode(`\n\n`));
              controller.enqueue(new TextEncoder().encode(`\`\`\`json\n${JSON.stringify(extractedTasks, null, 2)}\n\`\`\`\n\n`));
              
              // Add completion message
              controller.enqueue(new TextEncoder().encode(
                `[System: Analysis complete. Final result: ${extractedTasks.length} tasks]` +
                (isMeetingTranscript ? `\n[System: Meeting summary available for download]` : '')
              ));
              
              // If it's a meeting transcript, add the summary data
              if (isMeetingTranscript) {
                controller.enqueue(new TextEncoder().encode(`\n\n<!-- NON-DISPLAY DATA BEGIN - FOR CLIENT PROCESSING ONLY -->\n[MEETING-SUMMARY-DATA-START]\n${meetingSummary}\n[MEETING-SUMMARY-DATA-END]\n<!-- NON-DISPLAY DATA END -->\n\n`));
              }
            } else {
              // Proceed with optimization for larger task sets
              controller.enqueue(new TextEncoder().encode(`Optimizing...]\n\n`));
              
              // Optimize tasks - pass the controller for streaming updates
              const optimizedTasks = await optimizeTasks(extractedTasks, controller);
              
              // Output the tasks as JSON first, then the summary as the very last thing
              controller.enqueue(new TextEncoder().encode(`\n\n`));
              controller.enqueue(new TextEncoder().encode(`\`\`\`json\n${JSON.stringify(optimizedTasks, null, 2)}\n\`\`\`\n\n`));
              
              // Add the summary message at the very end with emphasis
              const originalCount = extractedTasks.length;
              const finalCount = optimizedTasks.length;
              
              // Always include both counts for better visibility
              controller.enqueue(new TextEncoder().encode(
                `[System: Successfully optimized: ${originalCount} → ${finalCount} tasks]\n` +
                `[System: Optimization complete. Final result: ${finalCount} tasks]` +
                (isMeetingTranscript ? `\n[System: Meeting summary available for download]` : '')
              ));
              
              // If it's a meeting transcript, add a marker that can be detected by the client
              if (isMeetingTranscript) {
                controller.enqueue(new TextEncoder().encode(`\n\n<!-- NON-DISPLAY DATA BEGIN - FOR CLIENT PROCESSING ONLY -->\n[MEETING-SUMMARY-DATA-START]\n${meetingSummary}\n[MEETING-SUMMARY-DATA-END]\n<!-- NON-DISPLAY DATA END -->\n\n`));
              }
            }
          } else {
            controller.enqueue(new TextEncoder().encode("\n\n[System: Could not extract tasks for optimization. Original extraction will be used.]\n\n"));
          }
        } catch (error: any) {
          controller.enqueue(new TextEncoder().encode("\n\n[System: Error during task optimization: " + error.message + "]\n\n"));
        }
      } catch (error: any) {
        console.error("Error processing stream:", error);
        controller.enqueue(new TextEncoder().encode("\nError during streaming: " + error.message));
      } finally {
        controller.close();
      }
    },
  });

  return new StreamingTextResponse(stream);
}

// Helper function to extract tasks from text
function extractTasksFromText(text: string): any[] {
  try {
    // More aggressive patterns to find JSON
    let jsonData = null;
    
    // First, try to find a tasks array pattern
    const tasksArrayPattern = /"tasks"\s*:\s*\[([\s\S]*?)\]/;
    const tasksMatch = text.match(tasksArrayPattern);
    
    if (tasksMatch) {
      // Try to extract the tasks array by reconstructing it
      try {
        const tasksJsonText = `{"tasks":[${tasksMatch[1]}]}`;
        jsonData = JSON.parse(tasksJsonText);
      } catch (arrayParseError) {
        console.error("Failed to parse tasks array:", arrayParseError);
      }
    }
    
    // If tasks array extraction failed, try for complete JSON object
    if (!jsonData) {
      // Try to extract the JSON object with more permissive pattern
      const jsonPattern = /\{[\s\S]*?("tasks"\s*:[\s\S]*?|\[[\s\S]*?\])[\s\S]*?\}/g;
      const jsonMatches = [...text.matchAll(jsonPattern)];
      
      if (jsonMatches.length > 0) {
        // Try each match until we find one that parses
        for (const match of jsonMatches) {
          try {
            const possibleJson = match[0];
            jsonData = JSON.parse(possibleJson);
            break; // If parsing succeeds, break out of the loop
          } catch (err) {
            // Continue to the next match
          }
        }
      }
    }
    
    // Standard fallback for basic JSON object
    if (!jsonData) {
      const basicJsonMatch = text.match(/\{[\s\S]*?\}/);
      if (basicJsonMatch) {
        try {
          jsonData = JSON.parse(basicJsonMatch[0]);
        } catch (e) {
          console.error("Failed to parse even basic JSON match");
        }
      }
    }
    
    // Process whatever JSON data we found
    let extractedTasks = [];
    if (jsonData) {
      if (jsonData.tasks && Array.isArray(jsonData.tasks)) {
        extractedTasks = jsonData.tasks;
      } else if (Array.isArray(jsonData)) {
        extractedTasks = jsonData;
      } else {
        // Check if this is actually a task object itself
        if (jsonData.title && typeof jsonData.title === 'string') {
          extractedTasks = [jsonData]; // Single task object
        }
      }
    }
    
    // Last resort: Try to find an array pattern directly
    if (extractedTasks.length === 0) {
      const arrayPattern = /\[\s*\{\s*"title"[\s\S]*?\}\s*\]/;
      const arrayMatch = text.match(arrayPattern);
      if (arrayMatch) {
        try {
          const possibleArray = JSON.parse(arrayMatch[0]);
          if (Array.isArray(possibleArray)) {
            extractedTasks = possibleArray;
          }
        } catch (e) {
          console.error("Failed to parse array pattern");
        }
      }
    }
    
    // Ensure each task has all required fields
    if (extractedTasks.length > 0) {
      extractedTasks = extractedTasks.map((task: any) => ({
        title: task.title || "Untitled Task",
        details: task.details || task.explanation || "",
        assignee: task.assignee || null,
        group: task.group || null,
        category: task.category || null,
        dueDate: task.dueDate || null,
        priority: task.priority || "Medium",
        ticketNumber: task.ticketNumber || null,
        externalUrl: task.externalUrl || null
      }));
    }
    
    return extractedTasks;
  } catch (e) {
    console.error("Error extracting tasks from text:", e);
    return [];
  }
} 
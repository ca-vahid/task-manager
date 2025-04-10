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

// Job storage (in-memory for this demo)
// In a production app, you'd use a database or external service
interface Job {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startTime: number;
  pdfData: string;
  processingOptions: {
    technicians: any[];
    groups: any[];
    categories: any[];
    useThinkingModel: boolean;
  };
  streamContent?: string; // Add field to store streaming content for thinking model
  result?: any;
  error?: string;
}

// In-memory job storage (would use a database in production)
const jobStorage = new Map<string, Job>();

// Cleanup function to remove old jobs (run periodically)
const cleanupJobs = () => {
  const now = Date.now();
  const MAX_AGE_MS = 1000 * 60 * 60; // Increase to 60 minutes (from 30)
  
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
async function optimizeTasks(tasks: any[]): Promise<any[]> {
  if (!tasks || tasks.length === 0) {
    return tasks; // Nothing to optimize
  }
  
  console.log(`Starting task optimization with ${tasks.length} tasks using Thinking model`);
  
  try {
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
    
    const response = await chat.sendMessage({
      message: prompt
    });
    
    const outputText = response?.text || "";
    
    // Extract the JSON array from the response
    try {
      // First try to find a JSON array
      const arrayMatch = outputText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const optimizedTasks = JSON.parse(arrayMatch[0]);
        console.log(`Successfully optimized: ${tasks.length} → ${optimizedTasks.length} tasks`);
        return optimizedTasks;
      }
      
      // If no array found, try to parse the entire response as JSON
      try {
        const parsedJson = JSON.parse(outputText);
        if (Array.isArray(parsedJson)) {
          console.log(`Successfully optimized: ${tasks.length} → ${parsedJson.length} tasks`);
          return parsedJson;
        } else if (parsedJson.tasks && Array.isArray(parsedJson.tasks)) {
          // Handle case where model returns {tasks: [...]}
          console.log(`Successfully optimized: ${tasks.length} → ${parsedJson.tasks.length} tasks`);
          return parsedJson.tasks;
        }
      } catch (parseError) {
        console.error("Failed to parse response as JSON, falling back to original tasks");
      }
      
      // Fallback to original tasks if we couldn't parse the response
      console.error("Could not extract task array from model response");
      return tasks;
    } catch (error) {
      console.error("Error parsing optimized tasks:", error);
      // Return original tasks if optimization fails
      return tasks;
    }
  } catch (error) {
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
    
    // Add a heartbeat mechanism to update the job status periodically
    let lastHeartbeat = Date.now();
    const HEARTBEAT_INTERVAL = 15000; // 15 seconds
    
    // Create a heartbeat function that updates the job's timestamp
    const updateHeartbeat = () => {
      const currentTime = Date.now();
      if (currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        // Update the job's progress message to show it's still alive
        job.streamContent = (job.streamContent || '') + 
          `\n[System: Still processing... ${new Date().toISOString()}]\n`;
        lastHeartbeat = currentTime;
        return true;
      }
      return false;
    };

    const { pdfData, processingOptions } = job;
    const { technicians, groups, categories, useThinkingModel } = processingOptions;
    
    // Select the appropriate model based on user preference
    const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
    
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
    
    // Generate the initial prompt for Gemini
    const initialPrompt = `
      You are a task extraction assistant that analyzes PDFs to identify tasks.
      
      ${technicianContext}
      ${groupContext}
      ${categoryContext}
      
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
            "dueDate": "YYYY-MM-DD or null",
            "priority": "Low|Medium|High|Critical",
            "ticketNumber": "Ticket number or null",
            "externalUrl": "URL or null"
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

    // Initialize the chat with throttling/retry logic
    const initChat = async () => {
      job.streamContent = (job.streamContent || '') + "\n[System: Initializing document processing...]\n";
      
      // Retry logic for model initialization
      let attempts = 0;
      const MAX_ATTEMPTS = 3;
      
      while (attempts < MAX_ATTEMPTS) {
        try {
          return genAI.chats.create({
            model: MODEL,
            ...(useThinkingModel ? { generationConfig } : {})
          });
        } catch (error) {
          attempts++;
          job.streamContent = (job.streamContent || '') + 
            `\n[System: Retry ${attempts}/${MAX_ATTEMPTS} initializing model...]\n`;
          await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds before retry
        }
      }
      
      throw new Error('Failed to initialize AI model after multiple attempts');
    };
    
    // Create a chat instance to maintain conversation context
    const chat = await initChat();
    
    // Process and capture both response text and streaming content
    let responseText = '';
    
    // Send the initial message with PDF
    job.streamContent = (job.streamContent || '') + "\n[System: Sending document to Gemini...]\n";
    
    const chatStream = await chat.sendMessageStream({
      message: initialMessageContent
    });
    
    // Process the initial stream
    let chunkCount = 0;
    for await (const chunk of chatStream) {
      if (chunk && chunk.text) {
        responseText += chunk.text;
        // Store streaming content in job for thinking model
        if (useThinkingModel) {
          job.streamContent = (job.streamContent || '') + chunk.text;
        }
        
        // Update heartbeat periodically during streaming
        updateHeartbeat();
        
        // Log chunk count occasionally
        chunkCount++;
        if (chunkCount % 20 === 0) {
          job.streamContent = (job.streamContent || '') + 
            `\n[System: Received ${chunkCount} chunks of content so far...]\n`;
        }
      }
    }
    
    // Update the heartbeat after receiving the initial response
    updateHeartbeat();
    
    // For thinking models, capture and store the model's thought process
    if (useThinkingModel) {
      // Add an explicit marker to show thought process phase
      job.streamContent = (job.streamContent || '') + "\n\n[System: Model is analyzing and reasoning through the document...]\n\n";
      
      // Send a follow-up message to get the model's reasoning
      const reasoningStream = await chat.sendMessageStream({
        message: "Can you explain your analysis process? What tasks did you identify and why? What were the key parts of the document that led to your task extraction decisions?"
      });
      
      // Process the reasoning stream
      for await (const chunk of reasoningStream) {
        if (chunk && chunk.text) {
          responseText += chunk.text;
          job.streamContent = (job.streamContent || '') + chunk.text;
          
          // Update heartbeat periodically during reasoning
          updateHeartbeat();
        }
      }
    }
    
    // Update the heartbeat before response validation
    updateHeartbeat();
    job.streamContent = (job.streamContent || '') + "\n[System: Validating extraction results...]\n";
    
    // Check if response is incomplete and continue as needed
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

    // Update heartbeat before JSON extraction
    updateHeartbeat();
    job.streamContent = (job.streamContent || '') + "\n[System: Extracting structured task data...]\n";

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
    
    // Update heartbeat before optimization
    updateHeartbeat();
    job.streamContent = (job.streamContent || '') + "\n[System: Starting task optimization process...]\n";
    
    // Optimize tasks if we have them
    if (extractedTasks.length > 0) {
      console.log(`Extracted ${extractedTasks.length} tasks. Optimizing...`);
      job.streamContent = (job.streamContent || '') + 
        `\n[System: Optimizing ${extractedTasks.length} extracted tasks...]\n`;
      
      const optimizedTasks = await optimizeTasks(extractedTasks);
      
      // Final heartbeat before completion
      updateHeartbeat();
      
      // Update job with successful result
      job.status = 'completed';
      job.result = optimizedTasks;
      job.streamContent = (job.streamContent || '') + 
        `\n[System: Successfully completed task extraction and optimization! Found ${optimizedTasks.length} tasks.]\n`;
    } else {
      throw new Error("No tasks could be extracted from the document");
    }
  } catch (error: any) {
    console.error("Error processing PDF:", error);
    job.status = 'failed';
    job.error = error.message || "Unknown error occurred during processing";
    // Add the error to streaming content
    job.streamContent = (job.streamContent || '') + 
      `\n[System: Error occurred during processing: ${error.message}]\n`;
  }
}

// Main route handler with job queue support
export async function POST(req: Request) {
  try {
    // Determine the action (start new job or check status)
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'start';
    const jobId = searchParams.get('jobId');
    
    // --- Action: Check job status ---
    if (action === 'status' && jobId) {
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
        elapsedTime: Date.now() - job.startTime,
        streamContent: job.streamContent || '' // Include streaming content for UI display
      });
    }
    
    // --- Action: Start new job ---
    // Parse form data to get the file and context
    const formData = await req.formData();
    const pdfFile = formData.get("file") as File;
    const technicians = JSON.parse(formData.get("technicians") as string || "[]");
    const groups = JSON.parse(formData.get("groups") as string || "[]");
    const categories = JSON.parse(formData.get("categories") as string || "[]");
    const streamOutput = formData.get("streamOutput") === "true";
    const useThinkingModel = formData.get("useThinkingModel") === "true";
    
    if (!pdfFile) {
      return NextResponse.json(
        { error: "No PDF file provided" },
        { status: 400 }
      );
    }
    
    // Check if it's a PDF
    if (pdfFile.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Uploaded file is not a PDF" },
        { status: 400 }
      );
    }
    
    // Check file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (pdfFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "PDF file is too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }
    
    // Convert the file to a base64 string
    const arrayBuffer = await pdfFile.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const base64File = fileBuffer.toString("base64");
    
    // If streaming is requested, use the original implementation
    if (streamOutput) {
      // Continue with the original streaming implementation
      return handleStreamingRequest(
        base64File,
        technicians,
        groups,
        categories,
        useThinkingModel
      );
    }
    
    // --- Start a new job ---
    // Generate a unique job ID
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Store job data
    jobStorage.set(newJobId, {
      status: 'pending',
      startTime: Date.now(),
      pdfData: base64File,
      processingOptions: {
        technicians,
        groups,
        categories,
        useThinkingModel
      }
    });
    
    // Start processing job in the background
    // Note: In a real production environment, you would use a proper job queue
    // like AWS SQS, Google Cloud Tasks, or a database-backed queue
    setTimeout(() => {
      processPdfJob(newJobId).catch(err => {
        console.error(`Job ${newJobId} failed:`, err);
        const job = jobStorage.get(newJobId);
        if (job) {
          job.status = 'failed';
          job.error = err.message || "Unknown error occurred";
        }
      });
    }, 0);
    
    // Return job ID immediately
    return NextResponse.json({
      jobId: newJobId,
      status: 'pending',
      message: 'Processing started. Check job status using the jobId.',
    });
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

// Original streaming implementation (used when streamOutput=true)
async function handleStreamingRequest(
  base64File: string,
  technicians: any[],
  groups: any[],
  categories: any[],
  useThinkingModel: boolean
) {
  // Select the appropriate model based on user preference
  const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
  
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
  
  // Generate the initial prompt for Gemini
  const initialPrompt = `
    You are a task extraction assistant that analyzes PDFs to identify tasks.
    
    ${technicianContext}
    ${groupContext}
    ${categoryContext}
    
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
          "dueDate": "YYYY-MM-DD or null",
          "priority": "Low|Medium|High|Critical",
          "ticketNumber": "Ticket number or null",
          "externalUrl": "URL or null"
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
        data: base64File
      }
    }
  ];

  // Create a chat instance to maintain conversation context
  const chat = genAI.chats.create({
    model: MODEL,
    ...(useThinkingModel ? { generationConfig } : {})
  });

  // Start streaming with the initial PDF content
  let streamResponseText = '';
  
  // Create a text-decoder stream for the Gemini response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send the initial message with PDF
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
              message: "Please ensure your response is complete and properly formatted as JSON. If you're done, please state 'EXTRACTION COMPLETE'."
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
          // Try to extract JSON from the response text
          let extractedTasks = [];
          try {
            // More aggressive patterns to find JSON
            let jsonData = null;
            
            // First, try to find a tasks array pattern
            const tasksArrayPattern = /"tasks"\s*:\s*\[([\s\S]*?)\]/;
            const tasksMatch = streamResponseText.match(tasksArrayPattern);
            
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
              const jsonMatches = [...streamResponseText.matchAll(jsonPattern)];
              
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
              const basicJsonMatch = streamResponseText.match(/\{[\s\S]*?\}/);
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
              const arrayMatch = streamResponseText.match(arrayPattern);
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
            
            // Log the extraction for debugging
            console.log(`JSON extraction attempt: found ${extractedTasks.length} tasks`);
            
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
            console.error("Error extracting JSON:", e);
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            controller.enqueue(new TextEncoder().encode(`\n\n[System: Error parsing JSON: ${errorMessage}. Will attempt to extract tasks for optimization.]\n\n`));
          }
          
          // If still no tasks, make an emergency extraction attempt from text
          if (extractedTasks.length === 0) {
            try {
              // Look for patterns like "Task: X" or "Title: X" in the text
              const taskTitlePattern = /(?:Task|Title):\s*([^\n]+)/g;
              const titleMatches = [...streamResponseText.matchAll(taskTitlePattern)];
              
              if (titleMatches.length > 0) {
                controller.enqueue(new TextEncoder().encode("\n\n[System: Attempting emergency task extraction from text patterns...]\n\n"));
                
                // Create basic task objects from text patterns
                extractedTasks = titleMatches.map(match => ({
                  title: match[1].trim(),
                  details: `<p>Automatically extracted from text: ${match[1].trim()}</p>`,
                  assignee: null,
                  group: null,
                  category: null,
                  dueDate: null,
                  priority: "Medium",
                  ticketNumber: null,
                  externalUrl: null
                }));
              }
            } catch (e) {
              console.error("Emergency extraction failed:", e);
            }
          }
          
          // Optimize tasks if we have them
          if (extractedTasks.length > 0) {
            const optimizedTasks = await optimizeTasks(extractedTasks);
            controller.enqueue(new TextEncoder().encode("\n\n[System: Optimized " + extractedTasks.length + " tasks to " + optimizedTasks.length + " consolidated tasks.]\n\n"));
            controller.enqueue(new TextEncoder().encode(JSON.stringify(optimizedTasks, null, 2)));
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
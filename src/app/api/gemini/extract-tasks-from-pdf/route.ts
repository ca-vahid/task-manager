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

export async function POST(req: Request) {
  try {
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

    // Set a timeout for Vercel - abort the operation before Vercel's 10s limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('Serverless function timeout'), 9500);
    
    try {
      // Convert the file to a base64 string
      const arrayBuffer = await pdfFile.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      const base64File = fileBuffer.toString("base64");
      
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
      
      // Select the appropriate model based on user preference
      const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
      
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

      // Initialize an empty string to collect the full response
      let fullResponseText = '';
      
      // Create a more resilient TransformStream to process chunks
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
                fullResponseText += chunk.text;
                controller.enqueue(new TextEncoder().encode(chunk.text));
              }
            }
            
            // Check if the response seems incomplete
            if (isResponseIncomplete(fullResponseText)) {
              try {
                // Try to extract any valid JSON from the partial response
                const extractedJson = extractValidJSON(fullResponseText);
                if (extractedJson) {
                  controller.enqueue(new TextEncoder().encode("\n\n[System: Extracted partial JSON before timeout]\n\n"));
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(extractedJson, null, 2)));
                } else {
                  controller.enqueue(new TextEncoder().encode("\n\n[System: Response was incomplete due to timeout. Try processing a smaller PDF or using the standard model.]\n\n"));
                }
              } catch (jsonError) {
                controller.enqueue(new TextEncoder().encode("\n\n[System: Response was incomplete and could not extract valid JSON. Try a smaller PDF.]\n\n"));
              }
            }
            
            controller.close();
          } catch (error: any) {
            // Handle timeout or other errors gracefully
            if (error.name === 'AbortError' || error.message?.includes('timeout')) {
              console.error("Request timed out:", error);
              
              // Try to extract any valid JSON from the partial response
              try {
                const extractedJson = extractValidJSON(fullResponseText);
                if (extractedJson) {
                  controller.enqueue(new TextEncoder().encode("\n\n[System: Vercel serverless function timed out. Extracted partial results:]\n\n"));
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(extractedJson, null, 2)));
                } else {
                  controller.enqueue(new TextEncoder().encode("\n\n[System: Vercel serverless function timed out. Could not extract any valid tasks.]\n\n"));
                }
              } catch (jsonError) {
                controller.enqueue(new TextEncoder().encode("\n\n[System: Vercel serverless function timed out. Try processing a smaller PDF or upgrading your Vercel plan for longer timeouts.]\n\n"));
              }
            } else {
              console.error("Error processing stream:", error);
              controller.enqueue(new TextEncoder().encode(`\n\nError during streaming: ${error.message}\n\n`));
            }
            controller.close();
          }
        },
      });

      // Clear the timeout if we complete successfully
      clearTimeout(timeoutId);
      
      return new StreamingTextResponse(stream);
    } catch (error: any) {
      // Clear the timeout
      clearTimeout(timeoutId);
      
      console.error("Error processing document with Gemini:", error);
      
      // Check if it's a timeout error from Vercel
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        return NextResponse.json(
          { 
            error: "Vercel serverless function timed out",
            message: "The PDF processing exceeded the Vercel timeout limit. Try a smaller PDF or upgrade your Vercel plan." 
          },
          { status: 504 }
        );
      }
      
      return NextResponse.json(
        { error: "An error occurred while processing the document", message: error.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in main request handler:", error);
    return NextResponse.json(
      { error: "An error occurred while processing the document", message: error.message },
      { status: 500 }
    );
  }
}

// New helper function to extract valid JSON from possibly truncated text
function extractValidJSON(text: string): any {
  try {
    // First attempt: try to parse the whole text
    try {
      return JSON.parse(text);
    } catch (e) {
      // Not valid JSON
    }
    
    // Second attempt: look for a complete JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Not valid JSON
      }
    }
    
    // Third attempt: look for tasks array
    const tasksArrayMatch = text.match(/\"tasks\"\s*:\s*\[\s*\{[\s\S]*?\}\s*\]/);
    if (tasksArrayMatch) {
      try {
        return { tasks: JSON.parse(`[${text.match(/\"tasks\"\s*:\s*\[\s*(\{[\s\S]*?\})\s*\]/)?.[1]}]`) };
      } catch (e) {
        // Not valid JSON
      }
    }
    
    // Fourth attempt: extract tasks by finding individual complete task objects
    const taskObjectsMatch = text.match(/\{[^\{\}]*"title"[^\{\}]*\}/g);
    if (taskObjectsMatch && taskObjectsMatch.length > 0) {
      try {
        const validTasks = taskObjectsMatch
          .map(taskStr => {
            try {
              return JSON.parse(taskStr);
            } catch (e) {
              return null;
            }
          })
          .filter(task => task !== null);
        
        if (validTasks.length > 0) {
          return { tasks: validTasks };
        }
      } catch (e) {
        // Failed to extract tasks
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting JSON:", error);
    return null;
  }
} 
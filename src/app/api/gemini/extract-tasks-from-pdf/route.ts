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
              // Try to extract the JSON portion using regex pattern matching
              const jsonMatch = streamResponseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0]);
                
                if (jsonData && jsonData.tasks && Array.isArray(jsonData.tasks)) {
                  extractedTasks = jsonData.tasks;
                } 
                // Handle case where the response is a direct tasks array
                else if (Array.isArray(jsonData)) {
                  extractedTasks = jsonData;
                }
                // Handle case where Gemini returned a differently shaped response
                else {
                  extractedTasks = [jsonData]; // Wrap in array as fallback
                }
              }
            } catch (e) {
              // If JSON extraction fails, let the client handle the raw text
              controller.enqueue(new TextEncoder().encode("\n\n[System: Error parsing JSON. Will attempt to extract tasks for optimization.]\n\n"));
            }
            
            // Optimize tasks if we have them
            if (extractedTasks.length > 0) {
              const optimizedTasks = await optimizeTasks(extractedTasks);
              controller.enqueue(new TextEncoder().encode("\n\n[System: Optimized " + extractedTasks.length + " tasks to " + optimizedTasks.length + " consolidated tasks.]\n\n"));
              controller.enqueue(new TextEncoder().encode(JSON.stringify(optimizedTasks, null, 2)));
            } else if (!streamOutput) {
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
  } catch (error) {
    console.error("Error processing document with Gemini:", error);
    return NextResponse.json(
      { error: "An error occurred while processing the document" },
      { status: 500 }
    );
  }
} 
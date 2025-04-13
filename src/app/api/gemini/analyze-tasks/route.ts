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

// Task analysis schema for structured output
const TASK_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "object",
      properties: {
        duplicates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task ID"
                },
                minItems: 2
              },
              reason: {
                type: "string",
                description: "Reason why these tasks are considered duplicates"
              },
              recommendedAction: {
                type: "string",
                enum: ["merge", "keep_first", "keep_second", "keep_all"],
                description: "Recommended action to take"
              },
              mergedTask: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  details: { type: "string" },
                  assignee: { type: "string", nullable: true },
                  group: { type: "string", nullable: true },
                  category: { type: "string", nullable: true },
                  priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] }
                },
                required: ["title", "details"]
              }
            },
            required: ["tasks", "reason", "recommendedAction"]
          }
        },
        similar: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task ID"
                },
                minItems: 2
              },
              reason: {
                type: "string",
                description: "Reason why these tasks are similar or related"
              },
              recommendedAction: {
                type: "string",
                enum: ["merge", "keep_separate"],
                description: "Recommended action to take"
              },
              mergedTask: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  details: { type: "string" },
                  assignee: { type: "string", nullable: true },
                  group: { type: "string", nullable: true },
                  category: { type: "string", nullable: true },
                  priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] }
                },
                required: ["title", "details"]
              }
            },
            required: ["tasks", "reason", "recommendedAction"]
          }
        }
      },
      required: ["duplicates", "similar"]
    }
  },
  required: ["analysis"]
};

// Handler for streaming API requests
export async function POST(request: Request) {
  // Get request data
  const requestData = await request.json();
  
  // Extract necessary information from the request
  const { tasks, useThinkingModel = false } = requestData;
  
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: "Tasks array is required" }, { status: 400 });
  }

  // Set up streaming response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Initial message to client
        controller.enqueue(new TextEncoder().encode(`[System: Starting task analysis with ${tasks.length} tasks...]\n`));

        // Select the appropriate model based on user preference
        const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
        
        // For the thinking model, set up the generation config with schema
        const generationConfig = useThinkingModel ? {
          responseStructure: { schema: TASK_ANALYSIS_SCHEMA }
        } : {};

        controller.enqueue(new TextEncoder().encode(`[System: Using ${useThinkingModel ? 'Gemini Thinking' : 'Standard Gemini'} model for analysis...]\n`));

        // Generate an analysis prompt for Gemini
        const analysisPrompt = `
          You are a task analysis assistant that helps identify duplicate and similar tasks.

          I have a set of tasks that may contain duplicates or tasks that could be merged. Please analyze them and provide recommendations.

          ${useThinkingModel ? 'As you analyze the tasks, please provide your thoughts and reasoning throughout the process so I can follow your analysis.' : ''}

          Important guidelines:
          1. When describing differences between tasks, don't just list IDs. Instead, describe the tasks by their titles, assignees by name, and categories by name.
          2. Focus on describing differences in terms of content, meaning, and objectives, not just metadata.
          3. Use human-readable descriptions like "Task about database backup" rather than referring to IDs.

          For each set of duplicate tasks:
          1. Identify why they are duplicates
          2. Recommend which one to keep or how to merge them
          3. If recommending a merge, provide the merged task details

          For each set of similar but not duplicate tasks:
          1. Explain why they are similar
          2. Recommend whether to keep them separate or merge them
          3. If recommending a merge, provide the merged task details

          Here are the tasks to analyze:
          ${JSON.stringify(tasks, null, 2)}

          ${useThinkingModel ? '' : 'Format your response as a valid JSON with the following structure:'}
          ${useThinkingModel ? '' : `
          {
            "analysis": {
              "duplicates": [
                {
                  "tasks": ["taskId1", "taskId2"],
                  "reason": "These tasks are duplicates because they both concern updating the backup system...",
                  "recommendedAction": "merge",
                  "mergedTask": {
                    "title": "Merged title",
                    "details": "Merged details",
                    "assignee": "Assignee or null",
                    "group": "Group or null",
                    "category": "Category or null",
                    "priority": "Priority level"
                  }
                }
              ],
              "similar": [
                {
                  "tasks": ["taskId3", "taskId4"],
                  "reason": "These tasks are similar because they both deal with user access permissions...",
                  "recommendedAction": "merge",
                  "mergedTask": {
                    "title": "Merged title",
                    "details": "Merged details",
                    "assignee": "Assignee or null",
                    "group": "Group or null",
                    "category": "Category or null",
                    "priority": "Priority level"
                  }
                }
              ]
            }
          }`}
        `;

        // Create a chat instance with the appropriate model
        const chat = genAI.chats.create({
          model: MODEL,
          ...(useThinkingModel ? { generationConfig } : {})
        });

        // Initial message with streaming
        controller.enqueue(new TextEncoder().encode("[System: Sending tasks to Gemini for analysis...]\n\n"));

        // Generate AI response
        const result = await chat.sendMessage({
          message: analysisPrompt,
        });

        // Send the complete response
        if (result && result.text) {
          // Use string() instead of text() for the response text
          controller.enqueue(new TextEncoder().encode(result.text));
        } else {
          controller.enqueue(new TextEncoder().encode("\n\n[System: No response received from Gemini.]\n"));
        }

        // Completion message
        controller.enqueue(new TextEncoder().encode("\n\n[System: Analysis complete.]\n"));
        controller.close();
      } catch (error) {
        console.error("Error in task analysis:", error);
        controller.enqueue(new TextEncoder().encode(`\n\n[System ERROR: ${error}]\n`));
        controller.close();
      }
    }
  });

  // Return streaming response
  return new StreamingTextResponse(stream);
} 
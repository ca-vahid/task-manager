import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { StreamingTextResponse } from 'ai';

// Configure for Edge Runtime
export const runtime = 'edge';

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
  const { tasks, useThinkingModel = false, technicians = [], groups = [], categories = [] } = requestData;
  
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: "Tasks array is required" }, { status: 400 });
  }

  // Create lookup maps for converting IDs to names
  const technicianMap: Record<string, string> = {};
  const groupMap: Record<string, string> = {};
  const categoryMap: Record<string, string> = {};
  
  // Fill lookup maps
  if (Array.isArray(technicians)) {
    technicians.forEach((tech: any) => {
      if (tech.id && tech.name) {
        technicianMap[tech.id] = tech.name;
      }
    });
  }
  
  if (Array.isArray(groups)) {
    groups.forEach((group: any) => {
      if (group.id && group.name) {
        groupMap[group.id] = group.name;
      }
    });
  }
  
  if (Array.isArray(categories)) {
    categories.forEach((category: any) => {
      if (category.id && category.value) {
        categoryMap[category.id] = category.value;
      }
    });
  }
  
  // Transform tasks to use human-readable names instead of IDs
  const transformedTasks = tasks.map((task: any) => ({
    ...task,
    // Include the assignee name alongside the ID
    assigneeName: task.assigneeId ? technicianMap[task.assigneeId] || `Unknown (${task.assigneeId})` : null,
    groupName: task.groupId ? groupMap[task.groupId] || `Unknown (${task.groupId})` : null,
    categoryName: task.categoryId ? categoryMap[task.categoryId] || `Unknown (${task.categoryId})` : null
  }));

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

          ${useThinkingModel ? 
            'Include your detailed reasoning in the "reason" field for each group of tasks. Be thorough in explaining why tasks should be merged or kept separate.' : 
            'Be concise in your reasoning.'}

          Important guidelines:
          1. When describing differences between tasks, don't just list IDs. Instead, describe the tasks by their titles, assignees by name, and categories by name.
          2. Focus on describing differences in terms of content, meaning, and objectives, not just metadata.
          3. Use human-readable descriptions like "Task about database backup" rather than referring to IDs.
          4. ALWAYS USE TEXT NAMES for assignees, groups, and categories in your output - never use ID values.
          5. For the mergedTask, the assignee, group, and category fields should contain the NAME not the ID.
          
          CRITICAL: The following fields must ALWAYS contain TEXT NAMES (not IDs):
          - mergedTask.assignee: Use the person's name (e.g., "Anton Kuzmychev")
          - mergedTask.group: Use the group name (e.g., "Security Team")
          - mergedTask.category: Use the category name (e.g., "Security Incident")

          For each set of duplicate tasks:
          1. Identify why they are duplicates
          2. Recommend which one to keep or how to merge them
          3. If recommending a merge, provide the merged task details

          For each set of similar but not duplicate tasks:
          1. Explain why they are similar
          2. Recommend whether to keep them separate or merge them
          3. If recommending a merge, provide the merged task details

          Here are the tasks to analyze:
          ${JSON.stringify(transformedTasks, null, 2)}

          CRITICAL INSTRUCTIONS:
          1. You MUST return valid analysis data with actual content, NOT just a schema definition
          2. Your response should contain actual task analysis with real results, not a type definition
          3. DO NOT return a JSONSchema definition - return actual data
          4. Return the analysis results in the following format with real analysis of the tasks provided

          Format your response ONLY as a valid JSON object conforming to this structure (do not include any extra text or markdown formatting like \`\`\`json):
          ${JSON.stringify(TASK_ANALYSIS_SCHEMA, null, 2)}
        `;

        // Update the API call to use generateContentStream
        const response = await genAI.models.generateContentStream({
          model: MODEL,
          contents: [{role: "user", parts: [{text: analysisPrompt}]}],
          // Add proper generation config for thinking model
          ...(useThinkingModel ? {
            generation_config: {
              response_structure: { schema: TASK_ANALYSIS_SCHEMA }
            }
          } : {})
        });

        // Process the streaming response
        let fullResponse = "";
        for await (const chunk of response) {
          if (chunk.text) {
            fullResponse += chunk.text;
            controller.enqueue(new TextEncoder().encode(chunk.text));
          }
        }

        // Ensure the response is valid JSON by attempting to parse it
        try {
          JSON.parse(fullResponse);
        } catch (error) {
          controller.enqueue(new TextEncoder().encode("\n\n[System: Warning - Response is not valid JSON. Processing may fail.]\n"));
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
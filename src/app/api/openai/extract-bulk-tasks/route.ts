import { NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize the OpenAI client with the API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    // Get the text content and additional context from the request body
    const { text, technicians, groups, categories, currentDate } = await request.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }
    
    console.log("Received text to extract multiple tasks:", text.substring(0, 100) + "...");
    
    // Create context strings for technicians and groups
    const technicianContext = technicians && technicians.length > 0 
      ? `Available technicians: ${technicians.map((tech: any) => tech.name).join(', ')}.` 
      : '';
    
    const groupContext = groups && groups.length > 0 
      ? `Available groups: ${groups.map((group: any) => group.name).join(', ')}.` 
      : '';
    
    const categoryContext = categories && categories.length > 0
      ? `Available categories: ${categories.map((cat: any) => cat.value).join(', ')}.`
      : '';
    
    const dateContext = currentDate 
      ? `Today's date is ${currentDate}. If no due date is provided, set it to one week from today.` 
      : 'If no due date is provided, set it to one week from today.';
    
    // Prepare the system message with detailed instructions
    const systemMessage = `
      You are an assistant that extracts information about multiple tasks from unstructured text.
      
      ${technicianContext}
      ${groupContext}
      ${categoryContext}
      ${dateContext}
      
      For each task found in the text, extract the following fields:
      - Title (the main name or title of the task)
      - Details/explanation (a longer description of what the task involves - format this as HTML with proper paragraphs, lists, and basic formatting)
      - Assignee/Technician name (the person assigned to the task)
      - Group (the group this task belongs to)
      - Category (the category this task belongs to)
      - Due date (in YYYY-MM-DD format)
      - Priority (Low, Medium, High, or Critical)
      - External URL or ticket number (if mentioned)
      
      Rules for extraction:
      1. If an assignee is mentioned, match it to one of the available technicians if possible.
         Even if only a first name is mentioned, try to match it to the full name of an available technician.
         For example, if "John" is mentioned and there's a technician named "John Smith" in the list, use "John Smith".
      2. If a group is mentioned, match it to one of the available groups if possible.
      3. If a category is mentioned or implied, match it to the closest one from the available categories list.
         Look for keywords or themes in the text that might indicate a specific category.
         Each task can have a different category based on the content of that task.
      4. If a due date is mentioned in natural language (like "next Wednesday" or "due in 2 weeks"), 
         convert it to a YYYY-MM-DD format based on the current date.
      5. If no due date is specified, set it to one week from today.
      6. If priority is not explicitly mentioned, infer it from language used (urgent = High/Critical).
      7. Multiple tasks may be separated by new lines, numbers, bullet points, or other formatting.
      8. For the details field, format the output as HTML with proper paragraphs (<p>), lists (<ul>/<ol>, <li>), and 
         basic formatting (<strong>, <em>, <u>) as appropriate to preserve structure and emphasis.
      
      Be thorough and extract ALL tasks described in the text, even if the format is inconsistent.
      
      Return a JSON object with a "tasks" array containing all extracted tasks:
      {
        "tasks": [
          {
            "title": "...",
            "details": "<p>HTML formatted details...</p>", // Formatted as HTML
            "assignee": "...", // Full name from available technicians, or null if not found
            "group": "...", // or null if not found
            "category": "...", // or null if not found, use exact name from available categories
            "dueDate": "YYYY-MM-DD", // one week from today if not specified
            "priority": "Low|Medium|High|Critical", // Medium if not specified
            "ticketNumber": "...", // or null if not found
            "externalUrl": "..." // or null if not found
          },
          {
            // second task
          },
          // and so on for all tasks found
        ]
      }
      
      If you can't find a particular field for a task, set it to null.
      Don't include any commentary, just return the JSON object with the tasks array.
    `;
    
    console.log("Sending request to OpenAI for bulk task extraction...");
    
    // Call the OpenAI API to extract information about multiple tasks
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text }
      ],
      temperature: 0.1, // Lower temperature for more consistent output
      response_format: { type: "json_object" }
    });
    
    // Get the generated content
    const content = response.choices[0].message.content;
    console.log("Received response from OpenAI for bulk tasks:", content);
    
    // Parse the JSON response
    let extractedData;
    try {
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }
      
      const parsed = JSON.parse(content);
      
      // Check for the tasks array in the parsed response
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        extractedData = parsed.tasks;
        console.log(`Successfully parsed ${extractedData.length} tasks:`, extractedData);
      }
      // If no tasks array but we have an array directly
      else if (Array.isArray(parsed)) {
        extractedData = parsed;
        console.log(`Successfully parsed ${extractedData.length} tasks from direct array:`, extractedData);
      }
      // If it's a single task object, convert to array
      else if (parsed.title) {
        extractedData = [parsed];
        console.log("Received a single task object, converted to array:", extractedData);
      }
      // If nothing above worked, maybe the format is unexpected
      else {
        console.warn("Unexpected response format:", parsed);
        // As a fallback, wrap the entire response in an array if nothing else worked
        extractedData = Array.isArray(parsed) ? parsed : [parsed];
        console.log("Using fallback parsing approach:", extractedData);
      }
      
      // Sanity check the extracted data
      if (!extractedData || extractedData.length === 0) {
        throw new Error("No tasks were found in the response");
      }
      
      // Verify each task has at least the required fields
      extractedData = extractedData.map((task: any) => {
        // Ensure minimum required fields exist
        return {
          title: task.title || "",
          details: task.details || "",
          assignee: task.assignee || null,
          group: task.group || null,
          category: task.category || null,
          dueDate: task.dueDate || null,
          priority: task.priority || "Medium",
          ticketNumber: task.ticketNumber || null,
          externalUrl: task.externalUrl || null
        };
      });
      
    } catch (error) {
      console.error("Failed to parse OpenAI response:", error, content);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }
    
    // Return the extracted information
    return NextResponse.json(extractedData);
    
  } catch (error) {
    console.error("Error processing bulk extraction request:", error);
    return NextResponse.json(
      { error: "Failed to extract task information" },
      { status: 500 }
    );
  }
} 
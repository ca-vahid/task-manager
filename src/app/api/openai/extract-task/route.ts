import { NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize the OpenAI client with the API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    // Get the text content, technicians, and categories from the request body
    const { text, technicians = [], categories = [] } = await request.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }
    
    console.log("Received text to extract task:", text.substring(0, 100) + "...");
    
    // Create a context string for technicians
    const technicianContext = technicians.length > 0 
      ? `Available technicians: ${technicians.map((tech: any) => tech.name).join(', ')}.` 
      : '';
    
    // Create a context string for categories
    const categoryContext = categories.length > 0
      ? `Available categories: ${categories.map((cat: any) => cat.value).join(', ')}.`
      : '';
    
    // Prepare the system message with detailed instructions
    const systemMessage = `
      You are an assistant that extracts information about a task from unstructured text.
      
      ${technicianContext}
      
      ${categoryContext}
      
      For the task described in the text, extract the following fields:
      - Title (the main name or title of the task)
      - Explanation (a longer description of what the task involves)
      - Technician (the person assigned to the task)
      - Due date (in YYYY-MM-DD format)
      - Priority (Low, Medium, High, or Critical)
      - External URL or ticket number (if mentioned)
      - Category (select from available categories)
      
      Rules for extraction:
      1. If a technician is mentioned, match it to one of the available technicians if possible.
         Even if only a first name is mentioned, try to match it to the full name of a technician.
      2. If a category is mentioned or implied, match it to the closest one from the available categories list.
         Look for keywords or themes in the text that might indicate a specific category.
      3. If a due date is mentioned in natural language (like "next Wednesday" or "due in 2 weeks"), 
         convert it to a YYYY-MM-DD format based on the current date.
      4. If no due date is specified, set it to null.
      5. If priority is not explicitly mentioned, infer it from language used (urgent = High/Critical).
      
      Return a JSON object containing the extracted task:
      {
        "title": "...",
        "explanation": "...",
        "technician": "...", // or null if not found, use full name from the available technicians
        "category": "...", // or null if not found, use exact name from available categories
        "dueDate": "YYYY-MM-DD", // or null if not specified
        "priority": "Low|Medium|High|Critical", // Medium if not specified
        "ticketNumber": "...", // or null if not found
        "externalUrl": "..." // or null if not found
      }
      
      If you can't find a particular field, set it to null.
      Don't include any commentary, just return the JSON object.
    `;
    
    console.log("Sending request to OpenAI for task extraction...");
    
    // Call the OpenAI API to extract information about the task
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
    console.log("Received response from OpenAI for task:", content);
    
    // Parse the JSON response
    let extractedData;
    try {
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }
      
      extractedData = JSON.parse(content);
      
      // Map field names to match the format expected by the frontend
      const mappedData = {
        title: extractedData.title || "",
        explanation: extractedData.explanation || "",
        technician: extractedData.technician || null,
        category: extractedData.category || null,
        estimatedCompletionDate: extractedData.dueDate || null,
        priority: extractedData.priority || "Medium",
        ticketNumber: extractedData.ticketNumber || null,
        externalUrl: extractedData.externalUrl || null
      };
      
      return NextResponse.json(mappedData);
      
    } catch (error) {
      console.error("Failed to parse OpenAI response:", error, content);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error("Error processing extraction request:", error);
    return NextResponse.json(
      { error: "Failed to extract task information" },
      { status: 500 }
    );
  }
} 
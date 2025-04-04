import { NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize the OpenAI client with the API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    // Get the text content from the request body
    const { text } = await request.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }
    
    console.log("Received text to extract control information:", text.substring(0, 100) + "...");
    
    // Prepare the system message with detailed instructions
    const systemMessage = `
      You are an assistant that extracts information about controls from text.
      Extract the following fields:
      - DCF ID (a number, often prefixed with "DCF-" or "#")
      - Title (the main name or title of the control)
      - Explanation (a longer description of what the control does)
      - Technician (the name of the person assigned to the control)
      - Expected completion date (in YYYY-MM-DD format)
      - URL (any web link associated with the control)
      
      Return ONLY a JSON object with these fields:
      {
        "dcfId": "123", // (just the number, no "DCF-" prefix)
        "title": "...",
        "explanation": "...",
        "technician": "...", // or null if not found
        "estimatedCompletionDate": "YYYY-MM-DD", // or null if not found
        "externalUrl": "..." // or null if not found
      }
      
      If you can't find a particular field, set it to null.
      Don't include any commentary, just return the JSON.
    `;
    
    console.log("Sending request to OpenAI...");
    
    // Call the OpenAI API to extract information
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
    console.log("Received response from OpenAI:", content);
    
    // Parse the JSON response
    let extractedData;
    try {
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }
      extractedData = JSON.parse(content);
      console.log("Successfully parsed extracted data:", extractedData);
    } catch (error) {
      console.error("Failed to parse OpenAI response:", error);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }
    
    // Apply additional processing or validation if needed
    
    // Return the extracted information
    return NextResponse.json(extractedData);
    
  } catch (error) {
    console.error("Error processing extraction request:", error);
    return NextResponse.json(
      { error: "Failed to extract information" },
      { status: 500 }
    );
  }
} 
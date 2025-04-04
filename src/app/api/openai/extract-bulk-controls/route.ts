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
    
    console.log("Received text to extract multiple controls:", text.substring(0, 100) + "...");
    
    // Prepare the system message with detailed instructions for multiple control extraction
    const systemMessage = `
      You are an assistant that extracts information about multiple ISO 27002:2022 controls from text.
      
      Extract EACH control mentioned in the text. A control typically has a DCF ID number mentioned (like DCF-51, DCF-421, or DCF-783).
      You MUST identify and extract ALL controls in the text, not just the first one.
      
      Look for patterns like these:
      - "{Title} (DCF-{number}): {explanation}"
      - "DCF-{number}: {title} - {explanation}"
      - "{Title} DCF-{number} {explanation}"
      
      Even if controls are not separated by blank lines, you should still extract each one.
      
      For each control found, extract the following fields:
      - DCF ID (a number, often prefixed with "DCF-" or "#" - extract ONLY the number)
      - Title (the main name or title of the control)
      - Explanation (a longer description of what the control does)
      - Technician (the name of the person assigned to the control, often mentioned at the beginning of the text)
      - Expected completion date (in YYYY-MM-DD format)
      - External URL (any web link associated with the control)
      
      If an explanation is missing but you can determine what the control is about from the title or context, 
      generate a reasonable explanation based on ISO 27002:2022 standards.
      
      If a date is mentioned in natural language (like "next Wednesday" or "due in 2 weeks"), 
      convert it to a YYYY-MM-DD format based on the current date.
      
      The exact format of the input may vary. BE THOROUGH and extract ALL controls.
      
      IMPORTANT: Return a JSON object with a "controls" array containing all extracted controls:
      {
        "controls": [
          {
            "dcfId": "123", // (just the number, no "DCF-" prefix)
            "title": "...",
            "explanation": "...",
            "technician": "...", // or null if not found
            "estimatedCompletionDate": "YYYY-MM-DD", // or null if not found
            "externalUrl": "..." // or null if not found
          },
          {
            // second control
          },
          {
            // third control
          },
          {
            // fourth control (if present)
          }
          // continue for ALL controls found, do not skip any
        ]
      }
      
      If you can't find a particular field for a control, set it to null.
      A single person mentioned at the beginning might be the technician for all controls.
      Don't include any commentary, just return the JSON object with the controls array.
      DOUBLE-CHECK your work to ensure you've extracted ALL controls mentioned in the text.
    `;
    
    console.log("Sending request to OpenAI for bulk control extraction...");
    
    // Call the OpenAI API to extract information about multiple controls
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
    console.log("Received response from OpenAI for bulk controls:", content);
    
    // Parse the JSON response
    let extractedData;
    try {
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }
      
      const parsed = JSON.parse(content);
      
      // Check for the controls array in the parsed response
      if (parsed.controls && Array.isArray(parsed.controls)) {
        extractedData = parsed.controls;
        console.log(`Successfully parsed ${extractedData.length} controls:`, extractedData);
      }
      // If no controls array but we have an array directly
      else if (Array.isArray(parsed)) {
        extractedData = parsed;
        console.log(`Successfully parsed ${extractedData.length} controls from direct array:`, extractedData);
      }
      // If it's a single control object, convert to array
      else if (parsed.dcfId) {
        extractedData = [parsed];
        console.log("Received a single control object, converted to array:", extractedData);
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
        throw new Error("No controls were found in the response");
      }
      
      // Verify each control has at least the required fields
      extractedData = extractedData.map((control: any) => {
        // Ensure minimum required fields exist
        return {
          dcfId: control.dcfId || "",
          title: control.title || "",
          explanation: control.explanation || "",
          technician: control.technician || null,
          estimatedCompletionDate: control.estimatedCompletionDate || null,
          externalUrl: control.externalUrl || null
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
      { error: "Failed to extract control information" },
      { status: 500 }
    );
  }
} 
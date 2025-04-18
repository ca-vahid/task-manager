import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 300; // Set max duration to 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Parse the form data
    const formData = await req.formData();
    
    // Get file from form data
    const file = formData.get('file') as File | null;
    const useThinkingModel = formData.get('useThinkingModel') === 'true';
    const isMeetingTranscript = formData.get('isMeetingTranscript') === 'true';
    const textContent = formData.get('textContent') as string | null;
    const isExtractedText = formData.get('isExtractedText') === 'true';
    const modelName = formData.get('modelName') as string || 'o4-mini'; // Default to o4-mini
    
    // Get technicians, groups, and categories data
    const techniciansJson = formData.get('technicians') as string;
    const groupsJson = formData.get('groups') as string;
    const categoriesJson = formData.get('categories') as string;
    
    // Parse the JSON strings to objects
    const technicians = techniciansJson ? JSON.parse(techniciansJson) : [];
    const groups = groupsJson ? JSON.parse(groupsJson) : [];
    const categories = categoriesJson ? JSON.parse(categoriesJson) : [];
    
    // Validate input
    if (!file && !textContent) {
      return NextResponse.json(
        { error: 'No file or text content provided' },
        { status: 400 }
      );
    }
    
    // Create the base64 data URI for OpenAI if file is provided
    let fileData;
    let fileName;
    let extractedTextFromFile = null;
    
    if (file) {
      fileName = file.name;
      const fileType = file.type;
      
      // Check if it's a PDF or other document type (not an image)
      if (fileType === 'application/pdf' || !fileType.startsWith('image/')) {
        // For PDFs or non-image files, we need to process text differently
        // If we have textContent (already extracted client-side), we'll use that
        if (!textContent && !isExtractedText) {
          // This case should ideally not happen if client extracts first
          // but as a fallback, return an error or handle differently.
          console.warn('API received PDF without pre-extracted text. Client should extract first.');
          return NextResponse.json(
            { error: 'PDF text not extracted before sending to API' },
            { status: 400 }
          );
        }
      } else if (fileType.startsWith('image/')) {
        // This is an image file, so we can use the vision API
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString('base64');
        fileData = `data:${file.type};base64,${base64}`;
      }
    }
    
    // Build the prompt based on extracted text or file
    let systemPrompt = '';
    
    // Create better context strings for technicians and categories
    const technicianContext = technicians.length > 0 
      ? `Available team members (ONLY use these exact names when assigning tasks):\n${technicians.map((t: any) => `- ${t.name}`).join('\n')}`
      : '';
    
    const groupContext = groups.length > 0
      ? `Available groups/projects (ONLY use these exact names when assigning groups):\n${groups.map((g: any) => `- ${g.name}`).join('\n')}`
      : '';
    
    const categoryContext = categories.length > 0
      ? `Available categories (ONLY use these exact category names):\n${categories.map((c: any) => `- ${c.value}`).join('\n')}`
      : '';
    
    if (isMeetingTranscript) {
      systemPrompt = `You are an expert meeting analyzer and task extraction assistant. Your job is to:
1. First, create a concise executive-style summary of the meeting transcript.
2. Then, identify and extract specific actionable tasks from the transcript.

For each task, include:
- title: Clear, concise title (required)
- details: More detailed explanation (required, be specific and thorough)
- assignee: Person assigned (if mentioned, match to an available team member)
- dueDate: Due date (if mentioned, in YYYY-MM-DD format)
- priority: Priority level (Low, Medium, High, Critical)
- category: Type of task (if applicable, match to an available category)
- group: Team or project this belongs to (if mentioned, match to an available group)

${technicianContext ? `\n${technicianContext}\n` : ''}
${groupContext ? `\n${groupContext}\n` : ''}
${categoryContext ? `\n${categoryContext}\n` : ''}

FORMAT YOUR RESPONSE AS A JSON OBJECT containing a SINGLE KEY "tasks" which holds an ARRAY of task objects:
{
  "tasks": [
    {
      "title": "Task title",
      "details": "Task details/description - BE THOROUGH and SPECIFIC",
      "assignee": "Person name", 
      "dueDate": "YYYY-MM-DD",
      "priority": "Medium", 
      "category": "Category name",
      "group": "Group name"
    }
  ]
}
If no tasks are found, return {"tasks": []}. DO NOT include the meeting summary or any other text outside the JSON object.`;
    } else {
      systemPrompt = `You are an expert document analyzer and task extraction assistant. Your job is to extract specific actionable tasks from the provided document. 

For each task, include:
- title: Clear, concise title (required)
- details: More detailed explanation (required, be specific and thorough)
- assignee: Person assigned (if mentioned, match to an available team member)
- dueDate: Due date (if mentioned, in YYYY-MM-DD format)
- priority: Priority level (Low, Medium, High, Critical)
- category: Type of task (if applicable, match to an available category)
- group: Team or project this belongs to (if mentioned, match to an available group)

${technicianContext ? `\n${technicianContext}\n` : ''}
${groupContext ? `\n${groupContext}\n` : ''}
${categoryContext ? `\n${categoryContext}\n` : ''}

FORMAT YOUR RESPONSE AS A JSON OBJECT containing a SINGLE KEY "tasks" which holds an ARRAY of task objects:
{
  "tasks": [
    {
      "title": "Task title",
      "details": "Task details/description - BE THOROUGH and SPECIFIC",
      "assignee": "Person name", 
      "dueDate": "YYYY-MM-DD",
      "priority": "Medium", 
      "category": "Category name",
      "group": "Group name"
    }
  ]
}
If no tasks are found, return {"tasks": []}. DO NOT include any other text outside the JSON object.`;
    }
    
    // Add context about available technicians, groups, and categories
    // These are now included in a better format above
    
    // Create the messages array for the OpenAI API
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt }
    ];
    
    // Add user message based on content type
    if (fileData && fileName) {
      // This is an image file - use vision capabilities
      messages.push({
        role: "user", 
        content: [
          { type: "text", text: "Please analyze this document and extract tasks:" },
          { type: "image_url", image_url: { url: fileData } }
        ]
      } as ChatCompletionMessageParam);
    } else if (textContent) {
      // This is text content (either directly provided or extracted from PDF)
      const documentSource = file ? `from the file \"${fileName}\"` : "";
      messages.push({
        role: "user",
        content: `Here is the extracted text content ${documentSource}. Please analyze it and extract tasks:\n\n${textContent}`
      });
    }
    
    console.log("Sending request to OpenAI for task extraction...");
    
    // Before the API call, log the model name
    console.log(`Using model: ${modelName} (Thinking mode: ${useThinkingModel})`);

    // Call the OpenAI API to extract tasks, requesting JSON output
    const response = await openai.chat.completions.create({
      model: modelName,
      messages,
      temperature: 1,
      response_format: { type: "json_object" }
    });
    
    // Get the generated content
    const content = response.choices[0].message.content;
    console.log("Received response from OpenAI:", content);
    
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }
    
    // Parse the JSON response
    let extractedData;
    try {
      extractedData = JSON.parse(content);
      // Validate the structure
      if (!extractedData || !Array.isArray(extractedData.tasks)) {
        console.error('Invalid JSON structure received:', extractedData);
        throw new Error('AI response did not contain a valid \'tasks\' array.');
      }
      console.log(`Successfully parsed ${extractedData.tasks.length} tasks.`);
      
    } catch (parseError) {
      console.error("Failed to parse OpenAI JSON response:", parseError, content);
      throw new Error('Failed to parse AI response. The format might be incorrect.');
    }
    
    // Return the structured JSON data containing the tasks array
    return NextResponse.json(extractedData);
    
  } catch (error) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    // Try to parse OpenAI specific errors
    let status = 500;
    if (error && typeof error === 'object' && 'status' in error) {
      status = error.status as number;
    }
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
} 
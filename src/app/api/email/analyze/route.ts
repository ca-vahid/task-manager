import { NextResponse } from "next/server";
import { StreamingTextResponse } from 'ai';
import { GoogleGenAI } from "@google/genai";

// Configure for Edge Runtime
export const runtime = 'edge';

// Initialize the Gemini API with the key from environment variables
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

// Model constants
const STANDARD_MODEL = "gemini-2.0-flash";
const THINKING_MODEL = "gemini-2.5-pro-preview-03-25";

// Task extraction schema for structured output
const TASK_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          details: { type: "string" },
          assignee: { type: "string", nullable: true },
          group: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          dueDate: { type: "string", nullable: true },
          priority: { 
            type: "string", 
            enum: ["Low", "Medium", "High", "Critical"] 
          },
          ticketNumber: { type: "string", nullable: true },
          externalUrl: { type: "string", nullable: true }
        },
        required: ["title", "details", "priority"]
      }
    },
    metadata: {
      type: "object",
      properties: {
        sender: { type: "string" },
        subject: { type: "string" },
        date: { type: "string" },
        hasAttachments: { type: "boolean" }
      }
    }
  },
  required: ["tasks"]
};

// Helper function to extract text from HTML
function extractTextFromHTML(html: string): string {
  if (!html) return '';
  
  // Very basic HTML to text conversion
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Simple EML parser that works in Edge Runtime
async function parseEML(emailContent: string) {
  const lines = emailContent.split(/\r?\n/);
  let inHeader = true;
  let inBody = false;
  let inHtml = false;
  let currentHeader = '';
  let currentValue = '';
  
  const headers: Record<string, string> = {};
  let plainText = '';
  let htmlText = '';
  
  // Parse headers (everything before the first blank line)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (inHeader) {
      // Empty line indicates the end of headers and start of body
      if (line.trim() === '') {
        inHeader = false;
        inBody = true;
        
        // Save the last header if any
        if (currentHeader && currentValue) {
          headers[currentHeader.toLowerCase()] = currentValue.trim();
        }
        
        continue;
      }
      
      // If line starts with whitespace, it's a continuation of the previous header
      if (/^\s+/.test(line)) {
        currentValue += ' ' + line.trim();
      } else {
        // Save the previous header if any
        if (currentHeader && currentValue) {
          headers[currentHeader.toLowerCase()] = currentValue.trim();
        }
        
        // Parse new header
        const match = line.match(/^([^:]+):\s*(.*)/);
        if (match) {
          currentHeader = match[1];
          currentValue = match[2];
        }
      }
    } else if (inBody) {
      // Check for content type boundaries
      if (line.includes('Content-Type: text/plain')) {
        inHtml = false;
        continue;
      }
      if (line.includes('Content-Type: text/html')) {
        inHtml = true;
        continue;
      }
      
      // Skip content headers
      if (line.startsWith('Content-') || line === '') {
        continue;
      }
      
      // Collect text or HTML content
      if (inHtml) {
        htmlText += line + '\n';
      } else {
        plainText += line + '\n';
      }
    }
  }
  
  // Extract key email metadata
  const from = headers['from'] || '';
  const subject = headers['subject'] || '';
  const date = headers['date'] || '';
  
  // If we have HTML content but no plain text, extract text from HTML
  if (htmlText && !plainText) {
    plainText = extractTextFromHTML(htmlText);
  }
  
  // Check for attachments (simple check, won't handle all cases)
  const hasAttachments = emailContent.includes('Content-Disposition: attachment');
  
  return {
    subject,
    from,
    date,
    text: plainText,
    html: htmlText,
    hasAttachments,
    headers
  };
}

export async function POST(request: Request) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const emailFile = formData.get('emailFile') as File;
    const useThinkingModel = formData.get('useThinkingModel') === 'true';

    if (!emailFile) {
      return new Response(JSON.stringify({ error: 'Email file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Set up streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Initial message to client
          controller.enqueue(new TextEncoder().encode('[System: Starting email analysis...]\n'));

          // Select the appropriate model based on user preference
          const MODEL = useThinkingModel ? THINKING_MODEL : STANDARD_MODEL;
          
          // For the thinking model, set up the generation config with schema
          const generationConfig = useThinkingModel ? {
            responseStructure: { schema: TASK_EXTRACTION_SCHEMA }
          } : {};

          controller.enqueue(new TextEncoder().encode(`[System: Using ${useThinkingModel ? 'Gemini Thinking' : 'Standard Gemini'} model for analysis...]\n`));

          // Read the email file
          const emailBuffer = await emailFile.arrayBuffer();
          const emailContent = new TextDecoder().decode(Buffer.from(emailBuffer));
          
          // Parse the email content using our simple parser
          controller.enqueue(new TextEncoder().encode('[System: Parsing email content...]\n'));
          const parsedEmail = await parseEML(emailContent);
          
          // Extract text from email
          const emailText = parsedEmail.text || '';
          const emailHtml = extractTextFromHTML(parsedEmail.html || '');
          
          // Combine both formats, prioritizing text, but falling back to HTML if text is empty
          const combinedEmailContent = emailText || emailHtml;
          
          // Get email metadata
          const subject = parsedEmail.subject || '';
          const from = parsedEmail.from || '';
          const date = parsedEmail.date || '';
          const hasAttachments = parsedEmail.hasAttachments;
          
          // Extract attachment information (simplified since we can't fully parse attachments)
          let attachmentInfo = '';
          if (hasAttachments) {
            controller.enqueue(new TextEncoder().encode('[System: Email contains attachments (details limited in Edge Runtime)...]\n'));
            attachmentInfo = 'Email contains attachments, but detailed information is not available in this environment.';
          }

          // Generate a prompt for Gemini
          const prompt = `
          You are a task extraction assistant that analyzes emails and identifies tasks that need to be completed.

          I need you to carefully read the following email and extract any tasks, action items, or requests that need to be addressed. Look for explicit directives, implicit requests, important deadlines, and any other information that should be tracked as a task.

          ${useThinkingModel ? 
            'Be thorough in your analysis and provide detailed explanations in the task details field. Think about how to structure the task information clearly.' : 
            'Be concise in your task extraction.'}

          Important guidelines:
          1. Identify clear, actionable tasks with specific titles
          2. Assign appropriate priority levels (Low, Medium, High, Critical)
          3. Extract due dates when mentioned
          4. Identify the assignee when specified or implied
          5. Group related tasks when appropriate
          6. Include all relevant context in the task details
          7. IMPORTANT: Return a maximum of 3 tasks total
          8. If you identify more than 3 potential tasks, combine similar or related tasks into more comprehensive tasks

          Email Information:
          Subject: ${subject}
          From: ${from}
          Date: ${date}
          Has Attachments: ${hasAttachments ? 'Yes' : 'No'}

          ${hasAttachments ? `Attachment Information:\n${attachmentInfo}\n` : ''}

          Email Content:
          ${combinedEmailContent}

          CRITICAL INSTRUCTIONS:
          1. You MUST return valid task data with actual content, NOT just a schema definition
          2. Your response should contain actual task objects with real titles and details from the email
          3. DO NOT return a JSONSchema definition or a type definition
          4. Return the actual data with real task information extracted from the email
          5. Limit your response to a MAXIMUM of 3 tasks - combine tasks if necessary
          6. Prioritize the most important/urgent tasks if you need to choose which ones to include

          Format your response as a valid JSON object conforming to this structure:
          ${JSON.stringify(TASK_EXTRACTION_SCHEMA, null, 2)}
          `;

          controller.enqueue(new TextEncoder().encode('[System: Analyzing email content with Gemini...]\n'));
          
          // Call Gemini API with streaming
          const response = await genAI.models.generateContentStream({
            model: MODEL,
            contents: [{role: "user", parts: [{text: prompt}]}],
            ...(useThinkingModel ? {
              generation_config: {
                response_structure: { schema: TASK_EXTRACTION_SCHEMA }
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
          console.error("Error in email analysis:", error);
          controller.enqueue(new TextEncoder().encode(`\n\n[System ERROR: ${error}]\n`));
          controller.close();
        }
      }
    });

    // Return streaming response
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("Error processing email:", error);
    return new Response(JSON.stringify({ error: "Failed to process email" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 
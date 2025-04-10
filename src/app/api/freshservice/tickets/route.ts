import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/firebase";
import { doc, getDoc } from "firebase/firestore";

// Define the structure of the ticket request
interface CreateTicketRequest {
  taskId: string;
  description: string;
  subject: string;
  responderId: string | null;
  dueDate: string | null;
  categoryName: string | null;
}

// Define the structure of the FreshService ticket data
interface FreshServiceTicketData {
  description: string;
  subject: string;
  email: string;
  priority: number;
  status: number;
  workspace_id: number;
  responder_id?: number;
  due_by?: string;
  fr_due_by?: string;
  source: number;
  custom_fields: {
    security: string | null;
  };
}

// Define the structure of the ticket response from FreshService
interface FreshServiceTicketResponse {
  ticket: {
    id: number;
    subject: string;
    description: string;
    email: string;
    priority: number;
    status: number;
    requester_id: number;
    responder_id: number | null;
    source: number;
    due_by: string | null;
    fr_due_by: string | null;
    created_at: string;
    updated_at: string;
    custom_fields: {
      security: string | null;
    };
  };
}

/**
 * Creates a new ticket in FreshService
 */
export async function POST(request: NextRequest) {
  try {
    // Get the API credentials from environment variables
    const domain = process.env.FRESHSERVICE_DOMAIN;
    const apiToken = process.env.FRESHSERVICE_API_TOKEN;

    if (!domain || !apiToken) {
      return NextResponse.json(
        { error: "FreshService configuration is missing" },
        { status: 500 }
      );
    }

    // Parse the request body
    const data: CreateTicketRequest = await request.json();
    const { description, subject, responderId, dueDate, categoryName } = data;

    if (!description || !subject) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build the FreshService API request body
    const ticketData: FreshServiceTicketData = {
      description: description,
      subject: subject,
      email: "vhaeri@bgcengineering.ca", // Default email as specified
      priority: 2,
      status: 2,
      workspace_id: 2,
      source: 1001, // Set the source as requested
      custom_fields: {
        security: categoryName,
      },
    };

    // Get the technician's FreshService agent ID from our database
    if (responderId) {
      try {
        // Get the technician document from Firestore
        const technicianDoc = await getDoc(doc(db, "technicians", responderId));
        
        if (technicianDoc.exists()) {
          const technician = technicianDoc.data();
          
          // Use the agentId from the technician document
          if (technician.agentId) {
            // Convert the agentId to a number for FreshService
            const agentIdNum = parseInt(technician.agentId, 10);
            
            if (!isNaN(agentIdNum) && agentIdNum > 0) {
              ticketData.responder_id = agentIdNum;
              console.log(`Using agent ID ${agentIdNum} for technician ${responderId}`);
            } else {
              console.warn(`Invalid agent ID format for technician ${responderId}: ${technician.agentId}`);
            }
          } else {
            console.warn(`No agent ID found for technician ${responderId}`);
          }
        } else {
          console.warn(`Technician not found with ID: ${responderId}`);
        }
      } catch (error) {
        console.error(`Error fetching technician ${responderId}:`, error);
      }
    }

    // Add due date if provided and not in the past
    if (dueDate) {
      const dueByDate = new Date(dueDate);
      const now = new Date();
      
      // Only set due date if it's in the future
      if (dueByDate > now) {
        const dueDateIsoString = dueByDate.toISOString();
        ticketData.due_by = dueDateIsoString;
        // Also set fr_due_by (first response due date) to the same value
        ticketData.fr_due_by = dueDateIsoString;
      }
    }

    // Set up authentication - using API token with base64 encoding
    const auth = Buffer.from(`${apiToken}:X`).toString('base64');

    // Log the request for debugging
    console.log("Sending ticket data to FreshService:", JSON.stringify(ticketData, null, 2));

    // Make the API call to FreshService
    const response = await fetch(`https://${domain}/api/v2/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(ticketData)
    });

    // Handle the response
    if (!response.ok) {
      const errorText = await response.text();
      console.error("FreshService API error:", errorText);
      
      return NextResponse.json(
        { 
          error: "Failed to create ticket in FreshService",
          details: errorText
        },
        { status: response.status }
      );
    }

    // Parse the successful response
    const ticketResponse: FreshServiceTicketResponse = await response.json();
    
    // Extract the ticket ID and create a ticket URL
    const ticketId = ticketResponse.ticket.id;
    const ticketUrl = `https://it.bgcengineering.ca/a/tickets/${ticketId}`;

    return NextResponse.json({
      success: true,
      ticketId,
      ticketUrl
    });

  } catch (error) {
    console.error("Error creating FreshService ticket:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 
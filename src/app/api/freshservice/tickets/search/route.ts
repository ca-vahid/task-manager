import { NextRequest, NextResponse } from "next/server";

interface SearchTicketsRequest {
  subject: string;
}

interface FreshServiceTicket {
  id: number;
  subject: string;
  status: number;
  priority: number;
  created_at: string;
  updated_at: string;
  responder_id: number | null;
  custom_fields: {
    security: string | null;
  };
}

interface FreshServiceTicketsResponse {
  tickets: FreshServiceTicket[];
  total: number;
}

/**
 * Search for tickets in FreshService based on subject
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
    const data: SearchTicketsRequest = await request.json();
    const { subject } = data;

    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required for searching tickets" },
        { status: 400 }
      );
    }

    // Set up authentication - using API token with base64 encoding
    const auth = Buffer.from(`${apiToken}:X`).toString('base64');

    // Make the API call to FreshService to list all tickets - default API doesn't support complex queries
    // We'll filter them on our side
    const response = await fetch(`https://${domain}/api/v2/tickets`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });

    // Handle the response
    if (!response.ok) {
      const errorText = await response.text();
      console.error("FreshService API error:", errorText);
      
      return NextResponse.json(
        { 
          error: "Failed to search tickets in FreshService",
          details: errorText
        },
        { status: response.status }
      );
    }

    // Parse the successful response
    const ticketsResponse: FreshServiceTicketsResponse = await response.json();
    
    // Filter tickets with matching subject (case-insensitive)
    const matchingTickets = ticketsResponse.tickets.filter(ticket => 
      ticket.subject.toLowerCase() === subject.toLowerCase()
    );
    
    // Process the matching tickets to include the URL
    const processedTickets = matchingTickets.map(ticket => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      category: ticket.custom_fields?.security || 'None',
      url: `https://it.bgcengineering.ca/a/tickets/${ticket.id}`
    }));

    return NextResponse.json({
      success: true,
      tickets: processedTickets,
      total: processedTickets.length
    });

  } catch (error) {
    console.error("Error searching FreshService tickets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 
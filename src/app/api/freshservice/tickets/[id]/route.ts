import { NextRequest, NextResponse } from "next/server";

/**
 * Deletes a ticket in FreshService
 */
export async function DELETE(
  request: NextRequest
) {
  try {
    const ticketId = request.url.split('/').pop();
    
    if (!ticketId) {
      return NextResponse.json(
        { error: "Ticket ID is required" },
        { status: 400 }
      );
    }

    // Get the API credentials from environment variables
    const domain = process.env.FRESHSERVICE_DOMAIN;
    const apiToken = process.env.FRESHSERVICE_API_TOKEN;

    if (!domain || !apiToken) {
      return NextResponse.json(
        { error: "FreshService configuration is missing" },
        { status: 500 }
      );
    }

    // Set up authentication - using API token with base64 encoding
    const auth = Buffer.from(`${apiToken}:X`).toString('base64');

    // Make the API call to FreshService to delete the ticket
    const response = await fetch(`https://${domain}/api/v2/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });

    // Check response status
    if (!response.ok) {
      // For DELETE operations, a 204 No Content is usually returned on success
      // Any other status is an error
      const errorText = await response.text();
      console.error(`FreshService API error deleting ticket ${ticketId}:`, errorText);
      
      return NextResponse.json(
        { 
          error: "Failed to delete ticket in FreshService",
          details: errorText
        },
        { status: response.status }
      );
    }

    // Successful deletion
    return NextResponse.json({
      success: true,
      message: `Ticket ${ticketId} deleted successfully`
    });

  } catch (error) {
    console.error("Error deleting FreshService ticket:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 
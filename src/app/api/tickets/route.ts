import { NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';
import { Control, Technician } from '@/lib/types';

const CONTROLS_COLLECTION = 'controls';
const TECHNICIANS_COLLECTION = 'technicians';

// GET /api/tickets/:controlId - Get ticket information for a control
export async function GET(
  request: Request
) {
  try {
    const { searchParams } = new URL(request.url);
    const controlId = searchParams.get('controlId');
    
    if (!controlId) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    // Get all controls and find the one with the matching ID
    const controls = await getDocuments(CONTROLS_COLLECTION) as Control[];
    const control = controls.find(c => c.id === controlId);
    
    if (!control) {
      return NextResponse.json({ message: 'Control not found' }, { status: 404 });
    }

    return NextResponse.json({
      ticketNumber: control.ticketNumber,
      ticketUrl: control.ticketUrl
    });
  } catch (error) {
    console.error("Error fetching ticket information:", error);
    return NextResponse.json({ message: 'Failed to fetch ticket information' }, { status: 500 });
  }
}

// POST /api/tickets - Create a new ticket
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { controlId } = body;

    if (!controlId) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    // Get all controls and find the one with the matching ID
    const controls = await getDocuments(CONTROLS_COLLECTION) as Control[];
    const control = controls.find(c => c.id === controlId);
    
    if (!control) {
      return NextResponse.json({ message: 'Control not found' }, { status: 404 });
    }

    // Get all technicians and find the one assigned to this control
    let responder: Technician | null = null;
    if (control.assigneeId) {
      const technicians = await getDocuments(TECHNICIANS_COLLECTION) as Technician[];
      responder = technicians.find(t => t.id === control.assigneeId) || null;
    }

    // Format the due date if it exists
    let dueBy = null;
    if (control.estimatedCompletionDate) {
      try {
        // Handle different possible formats of the date
        let dueDate: Date | null = null;
        
        // Check if it's a Firestore Timestamp with toDate method
        if (typeof (control.estimatedCompletionDate as any).toDate === 'function') {
          dueDate = (control.estimatedCompletionDate as any).toDate();
        } 
        // Check if it's a serialized Timestamp with seconds property
        else if (typeof control.estimatedCompletionDate === 'object' && 'seconds' in (control.estimatedCompletionDate as any)) {
          dueDate = new Date((control.estimatedCompletionDate as any).seconds * 1000);
        }
        // Check if it's a string date
        else if (typeof control.estimatedCompletionDate === 'string') {
          dueDate = new Date(control.estimatedCompletionDate);
        }
        // Otherwise, try to use it directly
        else {
          dueDate = new Date(control.estimatedCompletionDate as any);
        }
        
        // Make sure the date is valid before converting to ISO string
        if (dueDate && !isNaN(dueDate.getTime())) {
          dueBy = dueDate.toISOString();
        }
      } catch (error) {
        console.error("Error formatting date:", error);
        // Continue without the due date if there's an error
      }
    }

    // Create the ticket payload
    const ticketPayload = {
      description: control.explanation || 'No details provided',
      subject: `DCF-${control.dcfId} ${control.title}`,
      email: 'vhaeri@bgcengineering.ca',
      priority: 2,
      status: 2,
      workspace_id: 2,
      tags: ['ISO-2025'],
      responder_id: responder?.agentId ? parseInt(responder.agentId, 10) : null,
      due_by: dueBy,
      fr_due_by: dueBy
    };

    // Call the FreshService API to create a ticket
    const freshserviceDomain = process.env.FRESHSERVICE_DOMAIN;
    const apiToken = process.env.FRESHSERVICE_API_TOKEN;

    if (!freshserviceDomain || !apiToken) {
      return NextResponse.json({ message: 'FreshService API configuration is missing' }, { status: 500 });
    }

    // Ensure the domain has https:// prefix
    const domainWithProtocol = freshserviceDomain.startsWith('http://') || freshserviceDomain.startsWith('https://')
      ? freshserviceDomain
      : `https://${freshserviceDomain}`;

    const authString = Buffer.from(`${apiToken}:X`).toString('base64');
    
    // Log request details for debugging
    console.log(`[DEBUG] Making API request to: ${domainWithProtocol}/api/v2/tickets`);
    console.log(`[DEBUG] Payload:`, JSON.stringify(ticketPayload, null, 2));

    try {
      const response = await fetch(`${domainWithProtocol}/api/v2/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        },
        body: JSON.stringify(ticketPayload)
      });

      console.log(`[DEBUG] Response status:`, response.status, response.statusText);
      
      const responseText = await response.text();
      console.log(`[DEBUG] Response body:`, responseText);
      
      let data;
      try {
        // Try to parse response as JSON
        data = JSON.parse(responseText);
        console.log(`[DEBUG] Parsed response:`, JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error("[DEBUG] Failed to parse response as JSON:", parseError);
        return NextResponse.json({ 
          message: 'Failed to parse API response', 
          error: responseText,
          status: response.status
        }, { status: response.status });
      }

      if (!response.ok) {
        console.error("[DEBUG] API returned error:", data);
        return NextResponse.json({ 
          message: 'Failed to create ticket in FreshService', 
          error: data,
          status: response.status,
          statusText: response.statusText
        }, { status: response.status });
      }

      const ticketNumber = data.ticket?.id?.toString();
      console.log(`[DEBUG] Ticket created with number:`, ticketNumber);
      
      const ticketUrl = `https://it.bgcengineering.ca/a/tickets/${ticketNumber}`;

      // Update the control with the ticket information
      await updateDocument(CONTROLS_COLLECTION, controlId, {
        ticketNumber,
        ticketUrl
      });

      return NextResponse.json({
        message: 'Ticket created successfully',
        ticketNumber,
        ticketUrl,
        responseData: data // Include full response for debugging
      });
    } catch (fetchError) {
      console.error("[DEBUG] Fetch error:", fetchError);
      return NextResponse.json({ 
        message: `Failed to create ticket: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        error: fetchError instanceof Error ? { message: fetchError.message } : { message: String(fetchError) }
      }, { status: 500 });
    }
  } catch (error) {
    console.error("[DEBUG] General error in ticket creation:", error);
    return NextResponse.json({ 
      message: `Failed to create ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? { message: error.message } : { message: String(error) }
    }, { status: 500 });
  }
}

// DELETE /api/tickets - Delete a ticket and/or remove ticket information from a control
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const controlId = searchParams.get('controlId');
    const deleteRemoteTicket = searchParams.get('deleteRemoteTicket') === 'true';

    if (!controlId) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    // Get all controls and find the one with the matching ID
    const controls = await getDocuments(CONTROLS_COLLECTION) as Control[];
    const control = controls.find(c => c.id === controlId);
    
    if (!control) {
      return NextResponse.json({ message: 'Control not found' }, { status: 404 });
    }

    const ticketNumber = control.ticketNumber;
    
    if (!ticketNumber) {
      return NextResponse.json({ message: 'No ticket associated with this control' }, { status: 404 });
    }

    let ticketDeleted = false;

    // Delete the ticket from FreshService if requested
    if (deleteRemoteTicket) {
      const freshserviceDomain = process.env.FRESHSERVICE_DOMAIN;
      const apiToken = process.env.FRESHSERVICE_API_TOKEN;

      if (!freshserviceDomain || !apiToken) {
        return NextResponse.json({ message: 'FreshService API configuration is missing' }, { status: 500 });
      }

      // Ensure the domain has https:// prefix
      const domainWithProtocol = freshserviceDomain.startsWith('http://') || freshserviceDomain.startsWith('https://')
        ? freshserviceDomain
        : `https://${freshserviceDomain}`;

      const authString = Buffer.from(`${apiToken}:X`).toString('base64');
      
      try {
        console.log(`[DEBUG] Deleting ticket ${ticketNumber} from FreshService`);
        
        const response = await fetch(`${domainWithProtocol}/api/v2/tickets/${ticketNumber}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${authString}`
          }
        });

        console.log(`[DEBUG] Delete response status:`, response.status, response.statusText);
        
        // Check if response has content
        const contentType = response.headers.get('content-type');
        let responseData = null;
        
        if (contentType && contentType.includes('application/json')) {
          const responseText = await response.text();
          if (responseText) {
            responseData = JSON.parse(responseText);
            console.log(`[DEBUG] Delete response:`, responseData);
          }
        }

        // Successful deletion typically returns 204 No Content
        if (response.ok) {
          ticketDeleted = true;
        } else {
          console.error('[DEBUG] Failed to delete remote ticket:', responseData);
          // Continue with local deletion even if remote deletion fails
        }
      } catch (error) {
        console.error('[DEBUG] Error deleting remote ticket:', error);
        // Continue with local deletion even if remote deletion fails
      }
    }

    // Remove ticket information from the control
    await updateDocument(CONTROLS_COLLECTION, controlId, {
      ticketNumber: null,
      ticketUrl: null
    });

    return NextResponse.json({
      message: ticketDeleted 
        ? 'Ticket deleted successfully from both local system and FreshService' 
        : 'Ticket reference removed from control',
      ticketDeleted,
      controlId
    });
  } catch (error) {
    console.error("[DEBUG] Error in ticket deletion:", error);
    return NextResponse.json({ 
      message: `Failed to delete ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? { message: error.message } : { message: String(error) }
    }, { status: 500 });
  }
} 
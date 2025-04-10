import { NextResponse } from 'next/server';
import { Technician } from '@/lib/types';

const FRESHSERVICE_DOMAIN = process.env.FRESHSERVICE_DOMAIN;
const FRESHSERVICE_API_TOKEN = process.env.FRESHSERVICE_API_TOKEN;

// Interface to represent Freshservice agents
interface FreshserviceAgent {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  active: boolean;
  department_ids: number[];
  location_id: number | null;
  location_name: string | null;
  workspace_ids: number[];
}

// Interface for our response
interface FilteredAgent {
  id: number;
  agentId: string; // String representation of ID
  name: string; // Combined first+last name
  email: string;
  department_ids: number[];
  location_id: number | null;
  location_name: string | null;
  exists?: boolean; // Flag for whether agent already exists in local DB
}

// GET /api/technicians/freshservice - Fetch agents from Freshservice
export async function GET() {
  try {
    // Debug info
    console.log('Fetching agents from Freshservice');
    console.log(`FRESHSERVICE_DOMAIN: ${FRESHSERVICE_DOMAIN ? 'configured' : 'missing'}`);
    console.log(`FRESHSERVICE_API_TOKEN: ${FRESHSERVICE_API_TOKEN ? 'configured' : 'missing'}`);

    if (!FRESHSERVICE_DOMAIN || !FRESHSERVICE_API_TOKEN) {
      console.error("Freshservice configuration missing");
      return NextResponse.json({ message: 'Freshservice configuration missing' }, { status: 500 });
    }

    // Encode API token for Basic Auth (Base64 of 'api_key:X')
    const encodedToken = Buffer.from(`${FRESHSERVICE_API_TOKEN}:X`).toString('base64');

    // Make API call to Freshservice
    const response = await fetch(`https://${FRESHSERVICE_DOMAIN}/api/v2/agents?active=true&state=fulltime`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Freshservice API error: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      return NextResponse.json(
        { message: `Failed to fetch agents: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`Freshservice API response received with ${data.agents?.length || 0} agents`);

    // Filter active agents in workspace id 2
    const filteredAgents: FilteredAgent[] = (data.agents || [])
      .filter((agent: FreshserviceAgent) => 
        agent.active && agent.workspace_ids && agent.workspace_ids.includes(2)
      )
      .map((agent: FreshserviceAgent) => ({
        id: agent.id,
        agentId: agent.id.toString(), // Convert to string format stored in our DB
        name: `${agent.first_name} ${agent.last_name}`.trim(),
        email: agent.email,
        department_ids: agent.department_ids || [],
        location_id: agent.location_id,
        location_name: agent.location_name,
      }));

    console.log(`Filtered to ${filteredAgents.length} active agents in workspace 2`);

    return NextResponse.json({ agents: filteredAgents });
  } catch (error) {
    console.error("Error fetching Freshservice agents:", error);
    return NextResponse.json(
      { message: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

// POST /api/technicians/freshservice - Add or update technicians from Freshservice
export async function POST(request: Request) {
  try {
    const { agents } = await request.json();
    
    if (!Array.isArray(agents) || agents.length === 0) {
      return NextResponse.json(
        { message: 'No agents provided for sync' },
        { status: 400 }
      );
    }

    console.log(`Received ${agents.length} agents to sync with local technicians`);
    
    // Import the required Firestore utilities
    const { getDocuments, addDocument, updateDocument } = await import('@/lib/firebase/firebaseUtils');
    
    // First, get all existing technicians to check for duplicates by agentId
    const existingTechnicians = await getDocuments('technicians') as Technician[];
    
    // Results tracking
    const results = {
      added: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each agent
    for (const agent of agents) {
      try {
        // Check if technician exactly matches by agentId
        const exactIdMatch = existingTechnicians.find(tech => 
          tech.agentId === agent.agentId
        );
        
        // Check if technician exists by email but has different ID (out of sync)
        const emailMatch = existingTechnicians.find(tech => 
          tech.email && 
          agent.email && 
          tech.email.toLowerCase() === agent.email.toLowerCase() && 
          tech.agentId !== agent.agentId
        );
        
        if (exactIdMatch) {
          // Update existing technician with exact ID match
          await updateDocument('technicians', exactIdMatch.id, {
            name: agent.name,
            email: agent.email,
            agentId: agent.agentId,
            // Add additional fields if needed
            location: agent.location_name,
            department_ids: agent.department_ids,
            // Add timestamp for last update
            lastUpdated: new Date().toISOString()
          });
          results.updated++;
        } else if (emailMatch) {
          // Update existing technician with email match but different ID
          // This is an out-of-sync agent - we'll update the ID to match FreshService
          await updateDocument('technicians', emailMatch.id, {
            name: agent.name,
            email: agent.email,
            agentId: agent.agentId, // Update to the correct FreshService ID
            // Add additional fields if needed
            location: agent.location_name,
            department_ids: agent.department_ids,
            // Add timestamp for last update
            lastUpdated: new Date().toISOString()
          });
          results.updated++;
        } else {
          // Add new technician
          await addDocument('technicians', {
            name: agent.name,
            email: agent.email,
            agentId: agent.agentId,
            // Add additional fields if needed
            location: agent.location_name,
            department_ids: agent.department_ids,
            // Add timestamp for creation
            createdAt: new Date().toISOString()
          });
          results.added++;
        }
      } catch (error) {
        console.error(`Error processing agent ${agent.name}:`, error);
        results.failed++;
        results.errors.push(`Error with ${agent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`Sync complete: ${results.added} added, ${results.updated} updated, ${results.failed} failed`);
    
    return NextResponse.json({ 
      message: 'Agents synced successfully',
      syncedAgents: agents.length,
      results
    });
  } catch (error) {
    console.error("Error syncing agents:", error);
    return NextResponse.json(
      { message: 'Failed to sync agents with local technicians' },
      { status: 500 }
    );
  }
} 
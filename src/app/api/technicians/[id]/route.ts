import { NextResponse, NextRequest } from 'next/server';
import { 
    updateDocument, 
    deleteDocument 
} from '@/lib/firebase/firebaseUtils'; // Assuming alias @

const TECHNICIANS_COLLECTION = 'technicians';

// PUT /api/technicians/[id] - Update a technician
export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;
  try {
    const body = await request.json();
    const { name, email, agentId } = body;

    if (!id) {
      return NextResponse.json({ message: 'Technician ID is required' }, { status: 400 });
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ message: 'Invalid technician name provided' }, { status: 400 });
    }
    
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ message: 'Valid email address is required' }, { status: 400 });
    }

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ message: 'Valid agent ID is required' }, { status: 400 });
    }

    const updatedData = { name, email, agentId };
    await updateDocument(TECHNICIANS_COLLECTION, id, updatedData);

    return NextResponse.json({ id, ...updatedData }); // Return updated technician

  } catch (error) {
    console.error(`Error updating technician ${id}:`, error);
    return NextResponse.json({ message: `Failed to update technician ${id}` }, { status: 500 });
  }
}

// DELETE /api/technicians/[id] - Delete a technician
export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const { id } = context.params;
  try {
    if (!id) {
      return NextResponse.json({ message: 'Technician ID is required' }, { status: 400 });
    }

    await deleteDocument(TECHNICIANS_COLLECTION, id);

    // TODO: Consider implications - should controls assigned to this technician be updated?
    // For now, we just delete the technician record.

    return NextResponse.json({ message: `Technician ${id} deleted successfully` }, { status: 200 }); 

  } catch (error) {
    console.error(`Error deleting technician ${id}:`, error);
    return NextResponse.json({ message: `Failed to delete technician ${id}` }, { status: 500 });
  }
} 
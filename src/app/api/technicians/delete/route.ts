import { NextResponse } from 'next/server';
import { deleteDocument } from '@/lib/firebase/firebaseUtils';

const TECHNICIANS_COLLECTION = 'technicians';

// POST /api/technicians/delete - Delete a technician using POST method
// Body should contain { id: "technician_id_to_delete" }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: 'Technician ID is required' }, { status: 400 });
    }

    await deleteDocument(TECHNICIANS_COLLECTION, id);

    // TODO: Consider implications - should controls assigned to this technician be updated?
    // For now, we just delete the technician record.

    return NextResponse.json({ message: `Technician ${id} deleted successfully` }, { status: 200 }); 

  } catch (error) {
    console.error(`Error deleting technician:`, error);
    return NextResponse.json({ message: `Failed to delete technician: ${error}` }, { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase'; // Import db instance

const CONTROLS_COLLECTION = 'controls';

// POST /api/controls/delete - Delete a control using POST method
// Body should contain { id: "control_id_to_delete" }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    const controlRef = doc(db, CONTROLS_COLLECTION, id);
    await deleteDoc(controlRef);

    // Note: Deleting doesn't automatically re-order other items.
    // Re-ordering might need to be handled client-side or via a separate API call.

    return NextResponse.json({ message: `Control ${id} deleted successfully` }, { status: 200 }); 

  } catch (error) {
    console.error(`Error deleting control:`, error);
    return NextResponse.json({ message: `Failed to delete control: ${error}` }, { status: 500 });
  }
} 
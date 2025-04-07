import { NextResponse } from 'next/server';
import {
  writeBatch,
  doc,
  Timestamp // Import Timestamp if needed for other fields, though not for order
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase'; // Import db instance

const CONTROLS_COLLECTION = 'controls';

interface UpdatePayload {
  id: string;
  order: number;
}

// POST /api/controls/update-order - Batch update control order
export async function POST(request: Request) {
  console.log('--- Received POST request to /api/controls/update-order ---');
  try {
    console.log('Attempting to parse request body...');
    const body = await request.json();
    const { updates } = body as { updates: UpdatePayload[] };

    // Validate input
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ message: 'Invalid or empty updates array provided' }, { status: 400 });
    }

    // Validate each item in the array
    for (const update of updates) {
      if (typeof update.id !== 'string' || typeof update.order !== 'number') {
        return NextResponse.json({ message: 'Invalid update item format. Each item must have id (string) and order (number).' }, { status: 400 });
      }
    }

    // Create a new batch instance
    const batch = writeBatch(db);

    // Add updates to the batch
    updates.forEach(update => {
      const controlRef = doc(db, CONTROLS_COLLECTION, update.id);
      // Only update the order field
      batch.update(controlRef, { order: update.order }); 
    });

    // Commit the batch
    await batch.commit();

    return NextResponse.json({ message: `Successfully updated order for ${updates.length} controls.` }, { status: 200 });

  } catch (error: any) {
    console.error("Error batch updating control order:", error);
    // Log the received body for debugging if possible
    try {
      const clonedRequest = request.clone(); 
      const bodyText = await clonedRequest.text(); 
      console.error("Received body for batch update:", bodyText);
    } catch (readError) {
       console.error("Could not read request body for logging.");
    }
    return NextResponse.json({ message: `Failed to batch update control order: ${error.message}` }, { status: 500 });
  }
} 
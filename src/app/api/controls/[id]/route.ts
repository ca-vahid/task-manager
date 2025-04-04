import { NextResponse } from 'next/server';
import { 
    doc, // Import doc
    updateDoc, // Import updateDoc
    deleteDoc // Import deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase'; // Import db instance
import { Control, ControlStatus } from '@/lib/types';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp

const CONTROLS_COLLECTION = 'controls';

interface Params {
  id: string;
}

// PUT /api/controls/[id] - Update a control
export async function PUT(request: Request, { params }: { params: Params }) {
  const { id } = params;
  try {
    const body = await request.json();
    // Destructure all possible fields from Control, allowing partial updates
    const {
      dcfId,
      title,
      explanation,
      status,
      estimatedCompletionDate,
      assigneeId,
      order,
      priorityLevel,
      tags,
      progress,
      externalUrl
    } = body;

    if (!id) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    // Construct the update data object with only the provided fields
    const updateData: Partial<Omit<Control, 'id'>> = {};

    if (dcfId !== undefined) updateData.dcfId = dcfId;
    if (title !== undefined) updateData.title = title;
    if (explanation !== undefined) updateData.explanation = explanation;
    if (status !== undefined) {
      // Validate status if provided
      if (!Object.values(ControlStatus).includes(status)) {
        return NextResponse.json({ message: 'Invalid status value' }, { status: 400 });
      }
      updateData.status = status;
    }
    if (estimatedCompletionDate !== undefined) {
      // Handle date conversion or null
      if (estimatedCompletionDate === null) {
        updateData.estimatedCompletionDate = null;
      } else {
         try {
            updateData.estimatedCompletionDate = Timestamp.fromDate(new Date(estimatedCompletionDate));
         } catch (dateError) {
            console.warn("Invalid date format received for update:", estimatedCompletionDate);
            return NextResponse.json({ message: 'Invalid date format for estimatedCompletionDate' }, { status: 400 });
         }
      }
    }
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId; // Allow null
    if (order !== undefined) updateData.order = order;
    if (priorityLevel !== undefined) updateData.priorityLevel = priorityLevel;
    if (tags !== undefined) updateData.tags = tags;
    if (progress !== undefined) updateData.progress = progress;
    if (externalUrl !== undefined) updateData.externalUrl = externalUrl; // Allow null

    if (Object.keys(updateData).length === 0) {
       return NextResponse.json({ message: 'No update data provided' }, { status: 400 });
    }

    const controlRef = doc(db, CONTROLS_COLLECTION, id);
    await updateDoc(controlRef, updateData);

    // Return the updated fields (or refetch the whole doc if preferred)
    return NextResponse.json({ id, ...updateData }); 

  } catch (error) {
    console.error(`Error updating control ${id}:`, error);
    return NextResponse.json({ message: `Failed to update control ${id}` }, { status: 500 });
  }
}

// DELETE /api/controls/[id] - Delete a control
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id } = params;
  try {
    if (!id) {
      return NextResponse.json({ message: 'Control ID is required' }, { status: 400 });
    }

    const controlRef = doc(db, CONTROLS_COLLECTION, id);
    await deleteDoc(controlRef);

    // Note: Deleting doesn't automatically re-order other items.
    // Re-ordering might need to be handled client-side or via a separate API call.

    return NextResponse.json({ message: `Control ${id} deleted successfully` }, { status: 200 }); 

  } catch (error) {
    console.error(`Error deleting control ${id}:`, error);
    return NextResponse.json({ message: `Failed to delete control ${id}` }, { status: 500 });
  }
} 
import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { deleteCalendarEvent } from "@/lib/google";
import { update } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isExecutive())) return unauthorized();
  const { id } = await params;
  const removed = await update("bookings", (bookings) => ({
    next: bookings.filter((b) => b.id !== id),
    result: bookings.find((b) => b.id === id) ?? null,
  }));
  if (!removed) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  let calendarWarning: string | undefined;
  if (removed.googleEventId) {
    try {
      await deleteCalendarEvent(removed.googleEventId);
    } catch (error) {
      console.error("[bookings] Google Calendar delete failed", error);
      calendarWarning = "Removed here, but the Google Calendar event couldn't be cancelled.";
    }
  }
  return NextResponse.json({ removed: id, calendarWarning });
}

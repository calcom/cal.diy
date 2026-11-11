import { NextResponse } from "next/server";
import { DAY } from "@/lib/dates";
import { read } from "@/lib/store";
import type { PublicAvailability } from "@/lib/types";

const HORIZON_DAYS = 120;

/** Public: only free-time windows and anonymous booked ranges ever leave the server. */
export async function GET() {
  const [blocks, bookings] = await Promise.all([read("blocks"), read("bookings")]);
  const from = Date.now() - 7 * DAY;
  const to = Date.now() + HORIZON_DAYS * DAY;
  const inRange = (b: { start: string; end: string }) => Date.parse(b.end) > from && Date.parse(b.start) < to;

  const body: PublicAvailability = {
    free: blocks
      .filter((b) => b.category === "free" && inRange(b))
      .map((b) => ({ id: b.id, start: b.start, end: b.end })),
    booked: bookings.filter(inRange).map((b) => ({ start: b.start, end: b.end })),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

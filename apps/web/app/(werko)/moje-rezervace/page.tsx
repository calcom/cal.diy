import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import prisma from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { copy } from "../_lib/copy";
import MyBookings, { type MyBooking } from "./_components/MyBookings";

const ACTIVE = new Set<BookingStatus>([
  BookingStatus.ACCEPTED,
  BookingStatus.PENDING,
  BookingStatus.AWAITING_HOST,
]);

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect(`/auth/login?callbackUrl=${encodeURIComponent("/moje-rezervace")}`);

  // Same rule as Cal.diy's own booking access: the client is an attendee with their verified e-mail
  const email = session.user.emailVerified ? session.user.email?.toLowerCase() : undefined;
  const rows = email
    ? await prisma.booking.findMany({
        where: { attendees: { some: { email: { equals: email, mode: "insensitive" } } } },
        select: {
          uid: true,
          title: true,
          startTime: true,
          endTime: true,
          status: true,
          user: { select: { name: true, username: true } },
          eventType: { select: { title: true } },
        },
        orderBy: { startTime: "asc" },
      })
    : [];

  const now = new Date();
  const bookings: MyBooking[] = rows.map((row) => ({
    uid: row.uid,
    room: row.user?.name ?? row.user?.username ?? "",
    title: row.eventType?.title ?? row.title,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    status: row.status,
    upcoming: ACTIVE.has(row.status) && row.endTime >= now,
  }));

  return <MyBookings bookings={bookings} />;
};

export const metadata: Metadata = { title: `${copy.myBookings.title} | Werk|0` };

export default Page;

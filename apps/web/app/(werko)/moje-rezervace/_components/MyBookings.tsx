import Breadcrumbs from "@devx-agency/werko-ui/components/Breadcrumbs";
import Button from "@devx-agency/werko-ui/components/Button";
import SecondaryButton from "@devx-agency/werko-ui/components/SecondaryButton";
import Tag from "@devx-agency/werko-ui/components/Tag";
import TextLink from "@devx-agency/werko-ui/components/TextLink";
import { copy } from "../../_lib/copy";
import { WERKO_WEB_URL } from "../../_lib/werko";

export type MyBooking = {
  uid: string;
  room: string;
  title: string;
  startTime: string;
  endTime: string;
  status: keyof typeof copy.myBookings.status;
  upcoming: boolean;
};

const TIME_ZONE = "Europe/Prague";
const dateFormat = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const timeFormat = new Intl.DateTimeFormat("cs-CZ", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const STATUS_STYLE: Record<MyBooking["status"], string> = {
  ACCEPTED: "",
  PENDING: "bg-white text-deep-blue",
  AWAITING_HOST: "bg-white text-deep-blue",
  CANCELLED: "bg-white/30 text-white",
  REJECTED: "bg-werko-error text-white",
};

const BookingCard = ({ booking }: { booking: MyBooking }) => {
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);

  return (
    <li className="flex flex-col gap-5 bg-deep-blue-green p-5 md:flex-row md:items-center md:justify-between lg:p-6">
      <div className="flex flex-col gap-2">
        <Tag className={`self-start ${STATUS_STYLE[booking.status]}`}>
          {copy.myBookings.status[booking.status]}
        </Tag>
        <p className="headline-4">{booking.room}</p>
        <p className="text-s">
          <span className="first-letter:uppercase">{dateFormat.format(start)}</span>
          {" · "}
          {timeFormat.format(start)}–{timeFormat.format(end)}
        </p>
        <p className="text-werko-xs text-white/70">{booking.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <TextLink href={`/booking/${booking.uid}`}>{copy.myBookings.detail}</TextLink>
        {booking.upcoming && (
          <>
            <TextLink href={`/booking/${booking.uid}?cancel=true`}>{copy.myBookings.cancel}</TextLink>
            <SecondaryButton href={`/reschedule/${booking.uid}`}>
              {copy.myBookings.reschedule}
            </SecondaryButton>
          </>
        )}
      </div>
    </li>
  );
};

const BookingList = ({ bookings, empty }: { bookings: MyBooking[]; empty: string }) =>
  bookings.length === 0 ? (
    <p className="text-s text-white/70">{empty}</p>
  ) : (
    <ul className="flex flex-col gap-4">
      {bookings.map((booking) => (
        <BookingCard key={booking.uid} booking={booking} />
      ))}
    </ul>
  );

/** Client's own bookings in the Werk|0 look; detail, reschedule and cancel are Cal.diy's own pages */
export default function MyBookings({ bookings }: { bookings: MyBooking[] }) {
  const upcoming = bookings.filter((booking) => booking.upcoming);
  const past = bookings.filter((booking) => !booking.upcoming).reverse();

  return (
    <main className="flex-1 px-6 pt-8 pb-16 md:px-8 lg:px-28 lg:pt-12 lg:pb-24">
      <div className="container-page flex flex-col gap-10 lg:gap-14">
        <div className="flex flex-col gap-6">
          <Breadcrumbs
            items={[{ label: copy.nav.home, href: `${WERKO_WEB_URL}/cs` }, { label: copy.myBookings.title }]}
          />
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-6">
              <h1 className="headline-hero">{copy.myBookings.title}</h1>
              <p className="text-s">{copy.myBookings.text}</p>
            </div>
            <Button href="/rezervace">{copy.myBookings.newBooking}</Button>
          </div>
        </div>

        <section className="flex flex-col gap-6">
          <h2 className="headline-3">{copy.myBookings.upcoming}</h2>
          <BookingList bookings={upcoming} empty={copy.myBookings.empty} />
        </section>

        {past.length > 0 && (
          <section className="flex flex-col gap-6">
            <h2 className="headline-3">{copy.myBookings.past}</h2>
            <BookingList bookings={past} empty={copy.myBookings.emptyPast} />
          </section>
        )}
      </div>
    </main>
  );
}

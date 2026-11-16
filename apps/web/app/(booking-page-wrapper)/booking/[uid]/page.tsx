import process from "node:process";
import { loadTranslations } from "@calcom/i18n/server";
import { BookingStatus } from "@calcom/prisma/enums";
import EventReservationSchema from "@calcom/web/components/schemas/EventReservationSchema";
import { buildLegacyCtxFromNextRequest } from "@lib/buildLegacyCtx";
import { createLocalPath, requireAuthenticatedPage, requireBookingAccess } from "app/_lib/pageAuthorization";
import type { PageProps as _PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { CustomI18nProvider } from "app/CustomI18nProvider";
import { withAppDirSsr } from "app/WithAppDirSsr";
import OldPage from "~/bookings/views/bookings-single-view";
import {
  type PageProps as ClientPageProps,
  getServerSideProps,
} from "~/bookings/views/bookings-single-view.getServerSideProps";

const getData = withAppDirSsr<ClientPageProps>(getServerSideProps);

export const generateMetadata = async ({ params, searchParams }: _PageProps) => {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const callbackPath = createLocalPath(
    `/booking/${encodeURIComponent(`${resolvedParams.uid}`)}`,
    resolvedSearchParams
  );
  const session = await requireAuthenticatedPage(callbackPath);
  await requireBookingAccess(`${resolvedParams.uid}`, session.user);
  const { bookingInfo, eventType, recurringBookings, orgSlug } = await getData(
    await buildLegacyCtxFromNextRequest(resolvedParams, resolvedSearchParams)
  );
  const needsConfirmation = bookingInfo.status === BookingStatus.PENDING && eventType.requiresConfirmation;

  const metadata = await _generateMetadata(
    (t) =>
      t(`booking_${needsConfirmation ? "submitted" : "confirmed"}${recurringBookings ? "_recurring" : ""}`),
    (t) =>
      t(`booking_${needsConfirmation ? "submitted" : "confirmed"}${recurringBookings ? "_recurring" : ""}`),
    false,
    process.env.NEXT_PUBLIC_WEBAPP_URL ?? "",
    `/booking/${resolvedParams.uid}`
  );

  return {
    ...metadata,
    robots: {
      index: false,
      follow: false,
    },
  };
};

const ServerPage = async ({ params, searchParams }: _PageProps) => {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const session = await requireAuthenticatedPage(
    createLocalPath(`/booking/${encodeURIComponent(`${resolvedParams.uid}`)}`, resolvedSearchParams)
  );
  await requireBookingAccess(`${resolvedParams.uid}`, session.user);
  const context = await buildLegacyCtxFromNextRequest(resolvedParams, resolvedSearchParams);
  const props = await getData(context);
  const eventName = props.dynamicEventName || props.eventType.title;
  const reservationSchema = (
    <EventReservationSchema
      reservationId={props.bookingInfo.uid}
      eventName={eventName}
      startTime={props.bookingInfo.startTime}
      endTime={props.bookingInfo.endTime}
      organizer={props.bookingInfo.user}
      attendees={props.bookingInfo.attendees}
      location={props.bookingInfo.location}
      description={props.bookingInfo.description}
      status={props.bookingInfo.status}
    />
  );

  const eventLocale = props.eventType?.interfaceLanguage;
  if (eventLocale) {
    const ns = "common";
    const translations = await loadTranslations(eventLocale, ns);
    return (
      <>
        {reservationSchema}
        <CustomI18nProvider translations={translations} locale={eventLocale} ns={ns}>
          <OldPage {...props} />
        </CustomI18nProvider>
      </>
    );
  }

  return (
    <>
      {reservationSchema}
      <OldPage {...props} />
    </>
  );
};
export default ServerPage;

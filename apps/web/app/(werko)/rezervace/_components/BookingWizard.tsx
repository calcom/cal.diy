"use client";

import { createBooking } from "@calcom/features/bookings/lib/create-booking";
import { trpc } from "@calcom/trpc/react";
import Breadcrumbs from "@devx-agency/werko-ui/components/Breadcrumbs";
import Button from "@devx-agency/werko-ui/components/Button";
import Field from "@devx-agency/werko-ui/components/Field";
import MonthCalendar from "@devx-agency/werko-ui/components/MonthCalendar";
import PriceTotal from "@devx-agency/werko-ui/components/PriceTotal";
import ReservationPanel from "@devx-agency/werko-ui/components/ReservationPanel";
import SecondaryButton from "@devx-agency/werko-ui/components/SecondaryButton";
import SpaceCard from "@devx-agency/werko-ui/components/SpaceCard";
import StepFooter from "@devx-agency/werko-ui/components/StepFooter";
import StepIndicator from "@devx-agency/werko-ui/components/StepIndicator";
import SummaryCard from "@devx-agency/werko-ui/components/SummaryCard";
import SummaryItem from "@devx-agency/werko-ui/components/SummaryItem";
import TextArea from "@devx-agency/werko-ui/components/TextArea";
import TextInput from "@devx-agency/werko-ui/components/TextInput";
import TimeSlotGrid from "@devx-agency/werko-ui/components/TimeSlotGrid";
import Image from "next/image";
import { useRef, useState } from "react";
import { copy } from "../../_lib/copy";
import {
  formatPrice,
  LOCALE,
  OPENING_HOURS,
  type SpaceSlug,
  TIME_ZONE,
  WERKO_WEB_URL,
  werkoWebPath,
} from "../../_lib/werko";

type BookingWizardProps = {
  spaces: WizardSpace[];
  initialSpace?: SpaceSlug;
  /** Logged-in user; name is editable, e-mail comes from the account */
  user: { name: string; email: string };
};

const STEPS = copy.steps.length;
const PHONE_PATTERN = /^\+?[0-9 ]{9,}$/;

const pad = (value: number) => String(value).padStart(2, "0");
// Calendar days are wall dates; the slots API keys them as YYYY-MM-DD in TIME_ZONE
const dayKey = (day: Date) => `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
const hourInZone = (iso: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(
      new Date(iso)
    )
  );
const blockLabel = (hour: number, length = 1) => `${pad(hour)}:00–${pad(hour + length)}:00`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const formatDay = (day: Date, options: Intl.DateTimeFormatOptions) =>
  capitalize(new Intl.DateTimeFormat(LOCALE, options).format(day));

/** Adds a block next to the current run, removes an end block, otherwise starts a new run */
const toggleHour = (hours: number[], hour: number) => {
  if (!hours.length) return [hour];
  const first = hours[0];
  const last = hours[hours.length - 1];
  if (hour === first) return hours.slice(1);
  if (hour === last) return hours.slice(0, -1);
  if (hour === last + 1) return [...hours, hour];
  if (hour === first - 1) return [hour, ...hours];
  return [hour];
};

export default function BookingWizard({ spaces, initialSpace, user }: BookingWizardProps) {
  const [step, setStep] = useState(initialSpace ? 1 : 0);
  const [spaceSlug, setSpaceSlug] = useState<SpaceSlug | undefined>(initialSpace);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [day, setDay] = useState<Date>();
  const [hours, setHours] = useState<number[]>([]);
  const [contact, setContact] = useState({ name: user.name, phone: "", note: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const space = spaces.find(({ slug }) => slug === spaceSlug);

  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  const rangeStart = new Date(Math.max(month.getTime(), Date.now()));
  const schedule = trpc.viewer.slots.getSchedule.useQuery(
    {
      eventTypeId: space?.eventTypeId ?? 0,
      startTime: rangeStart.toISOString(),
      endTime: monthEnd.toISOString(),
      timeZone: TIME_ZONE,
      duration: "60",
      isTeamEvent: false,
    },
    { enabled: step === 1 && !!space && monthEnd > rangeStart, trpc: { context: { skipBatch: true } } }
  );
  const slotsByDay = schedule.data?.slots ?? {};

  // Start time (ISO) of every free hourly block on the chosen day
  const freeHours = new Map(
    (day ? (slotsByDay[dayKey(day)] ?? []) : []).map(({ time }) => [hourInZone(time), time] as const)
  );
  const dayHours = Array.from(
    { length: OPENING_HOURS.to - OPENING_HOURS.from },
    (_, index) => OPENING_HOURS.from + index
  );

  const price = space ? formatPrice(hours.length * space.pricePerHour) : "";
  const timeLine = hours.length ? `${blockLabel(hours[0], hours.length)} · ${copy.hours(hours.length)}` : "";
  const dateLine = day
    ? formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const nameError = !contact.name.trim() ? copy.contact.requiredError : undefined;
  const phoneError = (() => {
    const phone = contact.phone.trim();
    if (!phone) return copy.contact.requiredError;
    if (!PHONE_PATTERN.test(phone)) return copy.contact.phoneError;
    return undefined;
  })();

  const goTo = (target: number) => {
    setStep(target);
    setSubmitError(undefined);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectSpace = (slug: SpaceSlug) => {
    setSpaceSlug(slug);
    setDay(undefined);
    setHours([]);
  };

  const submit = async () => {
    const start = space && day ? freeHours.get(hours[0]) : undefined;
    if (!space || !start) return goTo(1);

    setSubmitting(true);
    setSubmitError(undefined);
    const booking = {
      eventTypeId: space.eventTypeId,
      user: space.slug,
      start,
      end: new Date(new Date(start).getTime() + hours.length * 60 * 60 * 1000).toISOString(),
      timeZone: TIME_ZONE,
      language: LOCALE,
      metadata: {},
      responses: {
        name: contact.name.trim(),
        email: user.email,
        attendeePhoneNumber: contact.phone.replace(/\s/g, ""),
        notes: contact.note.trim(),
      },
    };
    try {
      await createBooking(booking);
      setSubmitted(true);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setSubmitError(copy.summary.error);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="px-6 pt-8 pb-16 md:px-8 lg:px-28 lg:pt-12 lg:pb-24" ref={topRef}>
        <div className="container-page flex max-w-200 flex-col gap-6">
          <h1 className="headline-1">{copy.success.title}</h1>
          <p className="text-m">{copy.success.text}</p>
          <div className="flex flex-wrap items-center gap-6">
            <Button
              onClick={() => {
                setSubmitted(false);
                setHours([]);
                setDay(undefined);
                goTo(0);
              }}>
              {copy.success.another}
            </Button>
            <SecondaryButton href={`${WERKO_WEB_URL}/cs`}>{copy.success.web}</SecondaryButton>
          </div>
        </div>
      </main>
    );
  }

  const stepHeading = (title: string, text: string) => (
    <div className="flex flex-col gap-3">
      <h2 className="headline-2">{title}</h2>
      <p className="text-s">{text}</p>
    </div>
  );

  return (
    <main className="px-6 pt-8 pb-16 md:px-8 lg:px-28 lg:pt-12 lg:pb-24">
      <div className="container-page flex flex-col gap-10 lg:gap-14">
        <div ref={topRef} className="flex scroll-mt-6 flex-col gap-6">
          <Breadcrumbs
            items={[{ label: copy.nav.home, href: `${WERKO_WEB_URL}/cs` }, { label: copy.page.title }]}
          />
          <h1 className="headline-1">{copy.page.title}</h1>
          <p className="text-s">{copy.page.text}</p>
        </div>

        <StepIndicator steps={copy.steps} current={step} doneLabel={copy.done} />

        {step === 0 && (
          <section className="flex flex-col gap-8">
            {stepHeading(copy.space.title, copy.space.text)}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {spaces.map(({ slug, name, description, image }) => (
                <SpaceCard
                  key={slug}
                  name="space"
                  value={slug}
                  checked={slug === spaceSlug}
                  onChange={() => selectSpace(slug)}
                  title={name}
                  description={description}
                  selectLabel={copy.space.select}
                  selectedLabel={copy.space.selected}
                  image={
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, 100vw"
                      className="object-cover"
                    />
                  }
                />
              ))}
            </div>
            <StepFooter
              stepLabel={copy.stepOf(1, STEPS)}
              next={{ label: copy.continue, onClick: () => goTo(1), disabled: !space }}
              note={copy.sendNote}
            />
          </section>
        )}

        {step === 1 && space && (
          <section className="flex flex-col gap-8">
            {stepHeading(copy.time.title, copy.time.text)}
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12">
              <MonthCalendar
                month={month}
                selected={day}
                locale={LOCALE}
                isDisabled={(date) => schedule.isLoading || !slotsByDay[dayKey(date)]?.length}
                onSelect={(date) => {
                  setDay(date);
                  setHours([]);
                }}
                onPrevMonth={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                onNextMonth={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                previousLabel={copy.time.previousMonth}
                nextLabel={copy.time.nextMonth}
                className="self-start"
              />
              <div className="flex flex-col gap-5">
                {day ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <h3 className="headline-4">
                        {formatDay(day, { weekday: "long", day: "numeric", month: "long" })}
                      </h3>
                      <p className="text-s">
                        {space.name} · {copy.time.pickBlocks}
                      </p>
                    </div>
                    {freeHours.size ? (
                      <TimeSlotGrid
                        slots={dayHours.map((hour) => ({
                          id: String(hour),
                          label: blockLabel(hour),
                          available: freeHours.has(hour),
                          selected: hours.includes(hour),
                        }))}
                        onToggle={(id) => setHours(toggleHour(hours, Number(id)))}
                      />
                    ) : (
                      <p className="text-s">{copy.time.noSlots}</p>
                    )}
                    {hours.length > 0 && (
                      <p className="text-neon-green text-s">
                        {copy.time.selected}: {timeLine}
                      </p>
                    )}
                    <PriceTotal label={copy.time.total} price={price} />
                  </>
                ) : (
                  <p className="text-s">{schedule.isLoading ? copy.time.loading : copy.time.pickDay}</p>
                )}
              </div>
            </div>
            <StepFooter
              back={{ label: copy.back, onClick: () => goTo(0) }}
              next={{ label: copy.continue, onClick: () => goTo(2), disabled: !day || !hours.length }}
              note={copy.sendNote}
            />
          </section>
        )}

        {step === 2 && space && day && (
          <form
            className="flex flex-col gap-8"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (nameError || phoneError) return setShowErrors(true);
              goTo(3);
            }}>
            {stepHeading(copy.contact.title, copy.contact.text)}
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-12">
              <div className="flex flex-col gap-6">
                <Field htmlFor="name" label={copy.contact.name} required>
                  <TextInput
                    id="name"
                    autoComplete="name"
                    value={contact.name}
                    onChange={(event) => setContact({ ...contact, name: event.target.value })}
                    error={showErrors ? nameError : undefined}
                  />
                </Field>
                <div className="grid gap-6 md:grid-cols-2">
                  <Field htmlFor="email" label={copy.contact.email} required>
                    <TextInput id="email" type="email" value={user.email} readOnly />
                  </Field>
                  <Field htmlFor="phone" label={copy.contact.phone} required>
                    <TextInput
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+420 777 123 456"
                      value={contact.phone}
                      onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                      error={showErrors ? phoneError : undefined}
                    />
                  </Field>
                </div>
                <Field htmlFor="note" label={copy.contact.note}>
                  <TextArea
                    id="note"
                    value={contact.note}
                    onChange={(event) => setContact({ ...contact, note: event.target.value })}
                  />
                </Field>
                <p className="text-s">{copy.contact.required}</p>
              </div>
              <ReservationPanel
                title={copy.contact.panelTitle}
                image={
                  <Image
                    src={space.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 30vw, 100vw"
                    className="object-cover"
                  />
                }
                space={space.name}
                details={[dateLine, timeLine]}
                price={{ label: copy.time.total, value: price }}
                note={copy.contact.panelNote}
                className="self-start"
              />
            </div>
            <StepFooter
              back={{ label: copy.back, onClick: () => goTo(1) }}
              next={{ label: copy.continue, type: "submit" }}
              note={copy.sendNote}
            />
          </form>
        )}

        {step === 3 && space && day && (
          <section className="flex flex-col gap-8">
            {stepHeading(copy.summary.title, copy.summary.text)}
            <div className="grid gap-6 md:grid-cols-2">
              <SummaryCard
                title={copy.summary.spaceAndTime}
                edit={{ label: copy.summary.edit, onClick: () => goTo(0) }}>
                <SummaryItem label={copy.summary.space}>
                  <p className="headline-3">{space.name}</p>
                </SummaryItem>
                <div className="grid grid-cols-2 gap-6">
                  <SummaryItem label={copy.summary.date}>
                    <p>{formatDay(day, { day: "numeric", month: "long", year: "numeric" })}</p>
                    <p>{formatDay(day, { weekday: "long" })}</p>
                  </SummaryItem>
                  <SummaryItem label={copy.summary.time}>
                    <p>{blockLabel(hours[0], hours.length)}</p>
                    <p>{copy.hours(hours.length)}</p>
                  </SummaryItem>
                </div>
                <PriceTotal label={copy.time.total} price={price} />
              </SummaryCard>
              <SummaryCard
                title={copy.summary.contact}
                edit={{ label: copy.summary.edit, onClick: () => goTo(2) }}>
                <div className="flex flex-col gap-3">
                  <p className="headline-3">{contact.name}</p>
                  <p className="text-s">{user.email}</p>
                  <p className="text-s">{contact.phone}</p>
                </div>
                {contact.note.trim() && (
                  <SummaryItem label={copy.summary.note}>
                    <p>{contact.note}</p>
                  </SummaryItem>
                )}
              </SummaryCard>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-s">
                <a href={werkoWebPath("/ochrana-osobnich-udaju")} className="hover:text-neon-green-bold">
                  {copy.summary.privacy}
                </a>
              </p>
              <p className="text-neon-green text-s">{copy.summary.confirmation}</p>
              {submitError && (
                <p role="alert" className="text-s text-werko-error">
                  {submitError}
                </p>
              )}
            </div>
            <StepFooter
              back={{ label: copy.back, onClick: () => goTo(2) }}
              next={{
                label: submitting ? copy.summary.submitting : copy.summary.submit,
                onClick: submit,
                disabled: submitting,
              }}
              note={copy.summary.submitNote}
            />
          </section>
        )}
      </div>
    </main>
  );
}

export type WizardSpace = {
  slug: SpaceSlug;
  name: string;
  description: string;
  image: string;
  pricePerHour: number;
  eventTypeId: number;
};

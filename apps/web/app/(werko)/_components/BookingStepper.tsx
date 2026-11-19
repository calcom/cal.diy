"use client";

import StepIndicator from "@devx-agency/werko-ui/components/StepIndicator";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { copy } from "../_lib/copy";

const NOT_A_ROOM = new Set([
  "booking",
  "booking-successful",
  "d",
  "rezervace",
  "moje-rezervace",
  "reschedule",
]);

type Step = { current: number; links: (string | undefined)[] };

/**
 * Where the visitor is in the booking, read from Cal.diy's own URLs:
 * /rezervace → /<room> → /<room>/<event> → …?slot=… (form) → /booking/<uid>?isSuccessBookingPage=true.
 * Finished steps link back; a reschedule or any other page shows no stepper.
 */
const resolveStep = (pathname: string, searchParams: URLSearchParams): Step | null => {
  if (searchParams.has("rescheduleUid") || pathname.endsWith("/embed")) return null;
  const [first, second, ...rest] = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (first === "rezervace" && !second) return { current: 0, links: [] };
  if (first === "booking" && searchParams.get("isSuccessBookingPage") === "true")
    return { current: 4, links: [] };
  if (!first || NOT_A_ROOM.has(first) || rest.length > 0) return null;

  const roomPath = `/${encodeURIComponent(first)}`;
  if (!second) return { current: 1, links: ["/rezervace"] };

  const calendarParams = new URLSearchParams(searchParams);
  calendarParams.delete("slot");
  const calendarQuery = calendarParams.toString();
  const calendarPath = `${roomPath}/${encodeURIComponent(second)}${calendarQuery ? `?${calendarQuery}` : ""}`;

  return { current: searchParams.has("slot") ? 3 : 2, links: ["/rezervace", roomPath, calendarPath] };
};

/*
  The Booker writes its state (e.g. ?slot=) with history.pushState/replaceState outside the Next router,
  so the router's search params go stale. Watch the real location instead (back/forward + a light poll).
*/
const subscribeToLocation = (onChange: () => void) => {
  const interval = window.setInterval(onChange, 300);
  window.addEventListener("popstate", onChange);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("popstate", onChange);
  };
};

const useLiveSearch = (serverSearch: string) =>
  useSyncExternalStore(
    subscribeToLocation,
    () => window.location.search,
    () => serverSearch
  );

export default function BookingStepper({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = useLiveSearch(searchParams?.toString() ? `?${searchParams.toString()}` : "");
  const step = resolveStep(pathname, new URLSearchParams(search));
  if (!step) return null;

  return (
    <nav aria-label={copy.steps.label} className={className}>
      <StepIndicator
        steps={copy.steps.labels}
        current={step.current}
        doneLabel={copy.steps.done}
        links={step.links}
      />
    </nav>
  );
}

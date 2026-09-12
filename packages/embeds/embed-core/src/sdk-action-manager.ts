type Namespace = string;
type CustomEventDetail = Record<string, unknown>;

function _fireEvent(fullName: string, detail: CustomEventDetail, source: MessageEventSource | null) {
  const event = new window.CustomEvent(fullName, {
    detail: detail,
  });
  Object.defineProperty(event, "source", { value: source });

  window.dispatchEvent(event);
}

type BaseBookingEventPayload = {
  title: string | undefined;
  startTime: string | undefined;
  endTime: string | undefined;
  eventTypeId: number | null | undefined;
  status: string | undefined;
  paymentRequired: boolean;
  isRecurring: boolean;
  /**
   * This is only used for recurring bookings
   */
  allBookings?: { startTime: string; endTime: string }[];
  videoCallUrl?: string;
};

export type EventDataMap = {
  /**
   * Fired when an event type is selected in the booker.
   * Purpose: Track user selection of event types.
   */
  eventTypeSelected: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventType: any;
  };
  /**
   * Fired when the embed page fails to load.
   * Purpose: Signal page load errors to parent.
   * Triggers: On non-200 HTTP status from iframe.
   * Includes: Error code, message, and URL information.
   */
  linkFailed: {
    code: string;
    msg: string;
    data: {
      url: string;
    };
  };
  /**
   * Fired when iframe content is fully ready for user interaction.
   * Purpose: Signal that embed is ready and loader should be removed.
   * Triggers: After content height is known and slots are loaded (if skeleton loader is used).
   * Actions: Parent removes loader and makes iframe visible.
   */
  linkReady: Record<string, never>;
  /**
   * Fired when prerendered embed is ready in the background.
   * Purpose: Signal that prerender phase is complete.
   * Triggers: When parentKnowsIframeReady is called during prerendering.
   * Note: Embed stays hidden until connect() is called.
   */
  linkPrerendered: Record<string, never>;
  /**
   * Fired when booker view is loaded and slots are fully ready for user interaction.
   * Purpose: Signal that booker is ready with slots loaded, allowing users to select a slot.
   * Triggers: When booker view is loaded and slots are successfully loaded.
   * Note: Only fires for booker pages (not booking success view or other non-booker pages).
   * This is different from linkReady which fires for any embed page.
   */
  bookerReady: {
    eventId: number;
    eventSlug: string;
  };
  /**
   * @deprecated Use `bookerReady` instead. This event is kept for backward compatibility.
   * Fired when availability/slots data has been loaded for the first time.
   * Purpose: Track first successful slots load.
   * Triggers: On first successful slots load.
   * Note: Only fires when slots are successfully loaded.
   */
  availabilityLoaded: {
    eventId: number;
    eventSlug: string;
  };
  /**
   * Fired when booker has been viewed for the first time on first modal open.
   * Purpose: Track first view of booker in current session.
   * Triggers: On first linkReady event for a page view.
   * Note: Not fired during prerendering. Includes event information and slots loading status.
   */
  bookerViewed:
  | {
    eventId: number;
    eventSlug: string;
    slotsLoaded: true;
  }
  | {
    eventId: null;
    eventSlug: null;
    slotsLoaded: false;
  };
  /**
   * Fired when booker has been reopened after being closed.
   * Purpose: Track when booker is reopened, distinguishing from first view.
   * Triggers: When modal is reopened after being closed (no reload).
   * Note: Distinguishes between first view (bookerViewed) and reopen (bookerReopened).
   */
  bookerReopened:
  | {
    eventId: number;
    eventSlug: string;
    slotsLoaded: true;
  }
  | {
    eventId: null;
    eventSlug: null;
    slotsLoaded: false;
  };
  /**
   * Fired when booker has been reloaded (full page reload within modal).
   * Purpose: Track when booker is reloaded, distinguishing from first view and reopen.
   * Triggers: When fullReload action is taken (modal stays but iframe content is reloaded).
   * Note: Distinguishes between first view (bookerViewed), reopen (bookerReopened), and reload (bookerReloaded).
   */
  bookerReloaded:
  | {
    eventId: number;
    eventSlug: string;
    slotsLoaded: true;
  }
  | {
    eventId: null;
    eventSlug: null;
    slotsLoaded: false;
  };
  /**
   * Fired when connect() method has been called to update prerendered embed.
   * Purpose: Signal that prerendered embed is being connected with new configuration.
   * Triggers: When connect() is invoked on a prerendered embed.
   * Note: Only fires during prerender -> non-prerender transition.
   */
  __connectInitiated: Record<string, never>;
  /**
   * Fired when connect flow has completed successfully.
   * Purpose: Signal that connect flow has finished updating the embed.
   * Triggers: After connect() finishes updating URL params and slots are ready.
   * Actions: Fires linkReady event with isPrerendered: true.
   */
  __connectCompleted: Record<string, never>;
  /**
   * Fired when a booking is successfully created.
   * Purpose: Notify parent of successful booking creation.
   * Triggers: After booking is confirmed and saved.
   * Note: Lightweight version with restricted data fields.
   */
  bookingSuccessfulV2: BaseBookingEventPayload & {
    uid: string | undefined;
  };

  /**
   * @deprecated Use `bookingSuccessfulV2` instead. We restrict the data heavily there, only sending what is absolutely needed and keeping it light as well. Plus, more importantly that can be documented well.
   * Fired when a booking is successfully created.
   * Purpose: Notify parent of successful booking creation.
   */
  bookingSuccessful: {
    // TODO: Shouldn't send the entire booking and eventType objects, we should send specific fields from them.
    booking: unknown;
    eventType: unknown;
    date: string;
    duration: number | undefined;
    organizer: {
      name: string;
      email: string;
      timeZone: string;
    };
    confirmed: boolean;
  };
  /**
   * Fired when a booking is successfully rescheduled.
   * Purpose: Notify parent of successful booking reschedule.
   * Triggers: After reschedule is confirmed and saved.
   * Note: Lightweight version with restricted data fields.
   */
  rescheduleBookingSuccessfulV2: BaseBookingEventPayload & {
    uid: string | undefined;
  };
  /**
   * Fired when a dry-run booking validation is successful.
   * Purpose: Notify parent of successful booking validation without creating the booking.
   * Triggers: After booking validation passes in dry-run mode.
   */
  dryRunBookingSuccessfulV2: BaseBookingEventPayload;
  /**
   * Fired when a dry-run reschedule validation is successful.
   * Purpose: Notify parent of successful reschedule validation without updating the booking.
   * Triggers: After reschedule validation passes in dry-run mode.
   */
  dryRunRescheduleBookingSuccessfulV2: BaseBookingEventPayload;
  /**
   * @deprecated Use `rescheduleBookingSuccessfulV2` instead. We restrict the data heavily there, only sending what is absolutely needed and keeping it light as well. Plus, more importantly that can be documented well.
   * Fired when a booking is successfully rescheduled.
   * Purpose: Notify parent of successful booking reschedule.
   */
  rescheduleBookingSuccessful: {
    booking: unknown;
    eventType: unknown;
    date: string;
    duration: number | undefined;
    organizer: {
      name: string;
      email: string;
      timeZone: string;
    };
    confirmed: boolean;
  };
  /**
   * Fired when a booking is cancelled.
   * Purpose: Notify parent of booking cancellation.
   */
  bookingCancelled: {
    booking: unknown;
    organizer: {
      name: string;
      email: string;
      timeZone?: string | undefined;
    };
    eventType: unknown;
  };
  /**
   * Fired when routing rules redirect to a custom action.
   * Purpose: Notify parent of routing action taken.
   */
  routed: {
    actionType: "customPageMessage" | "externalRedirectUrl" | "eventTypeRedirectUrl";
    actionValue: string;
  };
  /**
   * Fired when navigation to booker page occurs.
   * Purpose: Track navigation to booker.
   */
  navigatedToBooker: Record<string, never>;
  /**
   * Wildcard event that fires for all events.
   * Purpose: Allow listening to all events with a single handler.
   */
  "*": Record<string, unknown>;
  /**
   * Fired when route changes within the embed.
   * Purpose: Notify parent of navigation within embed.
   * Triggers: When URL changes via history API or navigation.
   * Actions: Parent can handle navigation (e.g., scroll into view for inline embeds).
   */
  __routeChanged: Record<string, never>;
  /**
   * Fired when window load event has completed.
   * Purpose: Signal that dimension calculations are now reliable.
   * Triggers: After document.readyState is "complete" and Safari rendering delay has passed.
   * Note: Used internally to ensure accurate dimension calculations.
   */
  __windowLoadComplete: Record<string, never>;
  /**
   * Fired when iframe requests to be closed.
   * Purpose: Request to close modal from within iframe.
   * Actions: Parent sets modal state to "closed".
   */
  __closeIframe: Record<string, never>;
  /**
   * Fired when iframe is ready to receive messages from parent.
   * Purpose: Signal that embed is ready to receive messages.
   * Triggers: When embed SDK initializes and is ready for communication.
   * Actions: Makes iframe visible (unless prerendering) and processes queued commands.
   */
  __iframeReady: {
    isPrerendering: boolean;
  };
  /**
   * Fired when iframe content dimensions change.
   * Purpose: Keep iframe size matched to content to prevent scrollbars.
   * Triggers: On initial load, when content size changes, or after window load completes.
   * Actions: Parent adjusts iframe dimensions.
   */
  __dimensionChanged: {
    iframeHeight: number;
    iframeWidth: number;
    isFirstTime: boolean;
  };
  /**
   * Fired to request scrolling by a specific distance.
   * Purpose: Allow iframe to request parent to scroll.
   * Actions: Parent scrolls the scrollable ancestor by the specified distance.
   */
  __scrollByDistance: {
    /**
     * Distance in pixels to scroll by.
     */
    distance: number;
  };
};

export type EventData<T extends keyof EventDataMap> = {
  [K in T]: {
    type: string;
    namespace: string;
    fullType: string;
    data: EventDataMap[K];
  };
}[T];

export type EmbedEvent<T extends keyof EventDataMap> = CustomEvent<EventData<T>> & {
  source: MessageEventSource | null;
};

export class SdkActionManager {
  namespace: Namespace;

  static parseAction(fullType: string) {
    if (!fullType) {
      return null;
    }
    //FIXME: Ensure that any action if it has :, it is properly encoded.
    const [cal, calNamespace, type] = fullType.split(":");
    if (cal !== "CAL") {
      return null;
    }
    return {
      ns: calNamespace,
      type,
    };
  }

  getFullActionName(name: string) {
    return this.namespace ? `CAL:${this.namespace}:${name}` : `CAL::${name}`;
  }

  fire<T extends keyof EventDataMap>(name: T, data: EventDataMap[T], source: MessageEventSource | null = null) {
    const fullName = this.getFullActionName(name);
    const detail = {
      type: name,
      namespace: this.namespace,
      fullType: fullName,
      data,
    };

    _fireEvent(fullName, detail, source);

    // Wildcard Event
    _fireEvent(this.getFullActionName("*"), detail, source);
  }

  on<T extends keyof EventDataMap>(name: T, callback: (arg0: EmbedEvent<T>) => void) {
    const fullName = this.getFullActionName(name);
    window.addEventListener(fullName, callback as EventListener);
  }

  off<T extends keyof EventDataMap>(name: T, callback: (arg0: EmbedEvent<T>) => void) {
    const fullName = this.getFullActionName(name);
    window.removeEventListener(fullName, callback as EventListener);
  }

  constructor(ns: string | null) {
    ns = ns || "";
    this.namespace = ns;
  }
}

import { DailyLocationType } from "@calcom/app-store/constants";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import slugify from "@calcom/lib/slugify";
import { type Prisma, type SelectedCalendar } from "@calcom/prisma/client";
import { PeriodType, SchedulingType, DisableCancelling,} from "@calcom/prisma/enums";
import type { userSelect } from "@calcom/prisma/selects";
import type { CustomInputSchema } from "@calcom/prisma/zod-utils";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { CredentialPayload } from "@calcom/types/Credential";

type User = Omit<Prisma.UserGetPayload<{ select: typeof userSelect }>, "selectedCalendars"> & {
  allSelectedCalendars: SelectedCalendar[];
  userLevelSelectedCalendars: SelectedCalendar[];
};

type UsernameSlugLinkProps = {
  users: {
    id?: number;
    username: string | null;
    email?: string;
    name?: string | null;
    bio?: string | null;
    avatar?: string | null;
    theme?: string | null;
    away?: boolean;
    verified?: boolean | null;
    allowDynamicBooking?: boolean | null;
  }[];
  slug: string;
};

const user: User & { credentials: CredentialPayload[] } = {
  metadata: null,
  theme: null,
  credentials: [],
  username: "john.doe",
  timeZone: "",
  bufferTime: 0,
  availability: [],
  id: 0,
  uuid: "00000000-0000-0000-0000-000000000000",
  allSelectedCalendars: [],
  userLevelSelectedCalendars: [],
  schedules: [],
  defaultScheduleId: null,
  locale: "en",
  email: "john.doe@example.com",
  name: "John doe",
  destinationCalendar: null,
  hideBranding: true,
  brandColor: "#797979",
  darkBrandColor: "#efefef",
  allowDynamicBooking: true,
  timeFormat: 12,
  travelSchedules: [],
  locked: false,
  isPlatformManaged: false,
};

const customInputs: CustomInputSchema[] = [];

const commons = {
  isDynamic: true,
  periodCountCalendarDays: true,
  periodStartDate: null,
  periodEndDate: null,
  beforeEventBuffer: 0,
  afterEventBuffer: 0,
  periodType: PeriodType.UNLIMITED,
  periodDays: null,
  slotInterval: null,
  offsetStart: 0,
  locations: [{ type: DailyLocationType }],
  customInputs,
  disableGuests: true,
  minimumBookingNotice: 120,
  schedule: null,
  timeZone: null,
  successRedirectUrl: "",
  forwardParamsSuccessRedirect: true,
  teamId: null,
  scheduleId: null,
  availability: [],
  price: 0,
  currency: "usd",
  schedulingType: SchedulingType.COLLECTIVE,
  seatsPerTimeSlot: null,
  seatsShowAttendees: null,
  seatsShowAvailabilityCount: null,
  disableCancelling: DisableCancelling.NOBODY,
  disableRescheduling: false,
  requiresCancellationReason: null,
  minimumRescheduleNotice: null,
  onlyShowFirstAvailableSlot: false,
  allowReschedulingPastBookings: false,
  allowReschedulingCancelledBookings: false,
  hideOrganizerEmail: false,
  showOptimizedSlots: false,
  id: 0,
  hideCalendarNotes: false,
  hideCalendarEventDetails: false,
  recurringEvent: null,
  destinationCalendar: null,
  team: null,
  lockTimeZoneToggleOnBookingPage: false,
  lockedTimeZone: null,
  requiresConfirmation: false,
  requiresConfirmationForFreeEmail: false,
  requiresBookerEmailVerification: false,
  bookingLimits: null,
  maxActiveBookingsPerBooker: null,
  maxActiveBookingPerBookerOfferReschedule: false,
  durationLimits: null,
  hidden: false,
  userId: 0,
  parentId: null,
  parent: null,
  owner: null,
  users: [user],
  hosts: [],
  subsetOfHosts: [],
  metadata: EventTypeMetaDataSchema.parse({}),
  bookingFields: [],
  assignAllTeamMembers: false,
  assignRRMembersUsingSegment: false,
  rrSegmentQueryValue: null,
  isRRWeightsEnabled: false,
  rescheduleWithSameRoundRobinHost: false,
  useEventTypeDestinationCalendarEmail: false,
  secondaryEmailId: null,
  secondaryEmail: null,
  autoTranslateDescriptionEnabled: false,
  fieldTranslations: [],
  maxLeadThreshold: null,
  includeNoShowInRRCalculation: false,
  useEventLevelSelectedCalendars: false,
  rrResetInterval: null,
  rrTimestampBasis: null,
  interfaceLanguage: null,
  customReplyToEmail: null,
  restrictionScheduleId: null,
  useBookerTimezone: false,
  profileId: null,
  profile: null,
  requiresConfirmationWillBlockSlot: false,
  canSendCalVideoTranscriptionEmails: false,
  instantMeetingExpiryTimeOffsetInSeconds: 0,
  autoTranslateInstantMeetingTitleEnabled: true,
  instantMeetingScheduleId: null,
  instantMeetingParameters: [],
  eventTypeColor: null,
  hostGroups: [],
  bookingRequiresAuthentication: false,
  createdAt: null,
  updatedAt: null,
  rrHostSubsetEnabled: false,
  enablePerHostLocations: false,
};

export const dynamicEvent = {
  length: 30,
  slug: "dynamic",
  title: "Group Meeting",
  eventName: "Group Meeting",
  description: "Join us for a meeting with multiple people",
  descriptionAsSafeHTML: "",
  position: 0,
  ...commons,
  metadata: eventTypeMetaDataSchemaWithTypedApps.parse({ multipleDuration: [15, 30, 45, 60, 90] }),
};

export const defaultEvents = [dynamicEvent];

export const getDynamicEventDescription = (dynamicUsernames: string[], slug: string): string => {
  return `Book a ${slug} min event with ${dynamicUsernames.join(", ")}`;
};

export const getDynamicEventName = (dynamicNames: string[], slug: string): string => {
  const lastUser = dynamicNames.pop();
  return `Dynamic Collective ${slug} min event with ${dynamicNames.join(", ")} & ${lastUser}`;
};

export const getDefaultEvent = (slug: string) => {
  const event = defaultEvents.find((obj) => {
    return obj.slug === slug;
  });
  return event || dynamicEvent;
};

export const getGroupName = (usernameList: string[]): string => {
  return usernameList.join(", ");
};

export const getUsernameSlugLink = ({ users, slug }: UsernameSlugLinkProps): string => {
  let slugLink = ``;
  if (users.length > 1) {
    const combinedUsername = users.map((user) => user.username).join("+");
    slugLink = `/${combinedUsername}/${slug}`;
  } else {
    slugLink = `/${users[0].username}/${slug}`;
  }
  return slugLink;
};

const arrayCast = (value: unknown | unknown[]) => {
  return Array.isArray(value) ? value : value ? [value] : [];
};

export const getUsernameList = (users: string | string[] | undefined): string[] => {
  // Multiple users can come in case of a team round-robin booking and in that case dynamic link won't be a user.
  // So, even though this code handles even if individual user is dynamic link, that isn't a possibility right now.
  users = arrayCast(users);
  const allUsers = users
    .map((user) => user.replace(/( |%20|%2b)/gi, "+").split("+"))
    .flat()
    .filter(Boolean);
  return Array.prototype.concat(...allUsers.map((userSlug) => slugify(userSlug)));
};

export default defaultEvents;

export type DefaultEvent = Awaited<ReturnType<typeof getDefaultEvent>>;

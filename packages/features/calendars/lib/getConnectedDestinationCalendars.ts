import { enrichUserWithDelegationCredentialsIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import type { CredentialDataWithTeamName } from "@calcom/app-store/utils";
import {
  cleanIntegrationKeys,
  getCalendarCredentials,
  getConnectedCalendars,
} from "@calcom/features/calendars/lib/CalendarManager";
import { DestinationCalendarRepository } from "@calcom/features/calendars/repositories/DestinationCalendarRepository";
import { isDelegationCredential } from "@calcom/lib/delegationCredential";
import logger from "@calcom/lib/logger";
import { SelectedCalendarRepository } from "@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository";
import type { PrismaClient } from "@calcom/prisma";
import prisma from "@calcom/prisma";
import type { DestinationCalendar, SelectedCalendar, User } from "@calcom/prisma/client";
import { AppCategories } from "@calcom/prisma/enums";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import type { IntegrationCalendar } from "@calcom/types/Calendar";

const log = logger.getSubLogger({ prefix: ["getConnectedDestinationCalendarsAndEnsureDefaultsInDb"] });

type ReturnTypeGetConnectedCalendars = Awaited<ReturnType<typeof getConnectedCalendars>>;
type ConnectedCalendarsFromGetConnectedCalendars = ReturnTypeGetConnectedCalendars["connectedCalendars"];

/**
 * Ensures that when DelegationCredential is enabled and there is already a calendar connected for the corresponding domain, we only allow the DelegationCredential calendar to be returned
 * This is to ensure that duplicate calendar connections aren't shown in UI(apps/installed/calendars). We choose DelegationCredential connection to be shown because we don't want users to be able to work with individual calendars
 */
const _ensureNoConflictingNonDelegatedConnectedCalendar = <
  T extends {
    integration: { slug: string };
    primary?: { email?: string | null | undefined } | undefined;
    delegationCredentialId?: string | null | undefined;
  },
>({
  connectedCalendars,
  loggedInUser,
}: {
  connectedCalendars: T[];
  loggedInUser: { email: string };
}) => {
  return connectedCalendars.filter((connectedCalendar, _index, array) => {
    const allCalendarsWithSameAppSlug = array.filter(
      (cal) => cal.integration.slug === connectedCalendar.integration.slug
    );

    // If no other calendar with this slug, keep it
    if (allCalendarsWithSameAppSlug.length === 1) return true;

    const delegatedCalendarsWithSameAppSlug = allCalendarsWithSameAppSlug.filter(
      (cal) => cal.delegationCredentialId
    );
    if (!delegatedCalendarsWithSameAppSlug.length) {
      return true;
    }

    if (connectedCalendar.delegationCredentialId) {
      return true;
    }

    // DelegationCredential Credential is always of the loggedInUser
    if (!connectedCalendar.primary?.email || connectedCalendar.primary.email !== loggedInUser.email) {
      return true;
    }

    return false;
  });
};

async function handleNoConnectedCalendars(user: UserWithCalendars) {
  log.debug(`No connected calendars, deleting destination calendar if it exists for user ${user.id}`);

  if (!user.destinationCalendar) return user;
  // deleteMany so a stale session destinationCalendar (already cascade-deleted with the
  // credential) does not throw Prisma P2025 and break connectedCalendars.
  await DestinationCalendarRepository.deleteByUserId(user.id);

  return {
    ...user,
    destinationCalendar: null,
  };
}

type ToggledCalendarDetails = {
  externalId: string;
  integration: string;
};

async function handleNoDestinationCalendar({
  user,
  connectedCalendars,
  onboarding,
}: {
  user: UserWithCalendars;
  connectedCalendars: ConnectedCalendarsFromGetConnectedCalendars;
  onboarding: boolean;
}) {
  if (!connectedCalendars.length) {
    throw new Error("No connected calendars");
  }

  // This is the calendar that we will ensure is enabled for conflict check
  let calendarToEnsureIsEnabledForConflictCheck: ToggledCalendarDetails | null = null;

  log.debug(
    `There are connected calendars, but no destination calendar, so create a default destination calendar in DB for user ${user.id}`
  );
  /*
    So create a default destination calendar with the first primary connected calendar
    */
  const {
    integration = "",
    externalId = "",
    credentialId,
    delegationCredentialId,
    email: primaryEmail,
  } = connectedCalendars[0].primary ?? {};

  // Select the first calendar matching the primary by default since that will also be the destination calendar
  if (onboarding && externalId) {
    const calendarIndex = (connectedCalendars[0].calendars || []).findIndex(
      (item) => item.externalId === externalId && item.integration === integration
    );
    if (calendarIndex >= 0 && connectedCalendars[0].calendars) {
      connectedCalendars[0].calendars[calendarIndex].isSelected = true;
      calendarToEnsureIsEnabledForConflictCheck = {
        externalId,
        integration,
      };
    }
  }

  user.destinationCalendar = await DestinationCalendarRepository.createIfNotExistsForUser({
    userId: user.id,
    integration,
    externalId,
    primaryEmail,
    ...(!isDelegationCredential({ credentialId })
      ? {
          credentialId,
        }
      : {
          delegationCredentialId,
        }),
  });

  return {
    user,
    connectedCalendars,
    calendarToEnsureIsEnabledForConflictCheck,
  };
}

async function handleDestinationCalendarNotInConnectedCalendars({
  user,
  connectedCalendars,
  onboarding,
}: {
  user: UserWithCalendars;
  connectedCalendars: ConnectedCalendarsFromGetConnectedCalendars;
  onboarding: boolean;
}) {
  let calendarToEnsureIsEnabledForConflictCheck: ToggledCalendarDetails | null = null;
  log.debug(
    `Destination calendar isn't in connectedCalendars, update it to the first primary connected calendar for user ${user.id}`
  );
  const { integration = "", externalId = "", email: primaryEmail } = connectedCalendars[0].primary ?? {};
  // Select the first calendar matching the primary by default since that will also be the destination calendar
  if (onboarding && externalId) {
    const calendarIndex = (connectedCalendars[0].calendars || []).findIndex(
      (item) => item.externalId === externalId && item.integration === integration
    );
    if (calendarIndex >= 0 && connectedCalendars[0].calendars) {
      connectedCalendars[0].calendars[calendarIndex].isSelected = true;
      calendarToEnsureIsEnabledForConflictCheck = {
        externalId,
        integration,
      };
    }
  }

  // Upsert: the session may still reference a destination calendar that was already
  // cascade-deleted with a failed/removed credential (Prisma P2025 on plain update).
  user.destinationCalendar = await DestinationCalendarRepository.upsert({
    where: { userId: user.id },
    update: {
      integration,
      externalId,
      primaryEmail,
    },
    create: {
      userId: user.id,
      integration,
      externalId,
      primaryEmail,
      credentialId: null,
    },
  });

  return {
    user,
    connectedCalendars,
    calendarToEnsureIsEnabledForConflictCheck,
  };
}

function findMatchingCalendar({
  connectedCalendars,
  calendar,
}: {
  connectedCalendars: ConnectedCalendarsFromGetConnectedCalendars;
  calendar: DestinationCalendar;
}): Required<ConnectedCalendarsFromGetConnectedCalendars[number]>["calendars"][number] | undefined {
  // Check if destinationCalendar exists in connectedCalendars
  const allCals = connectedCalendars.flatMap((cal) => cal.calendars ?? []);
  const matchingCalendar = allCals.find(
    (cal) => cal.externalId === calendar.externalId && cal.integration === calendar.integration
  );
  if (!matchingCalendar) return;
  return matchingCalendar;
}

async function ensureSelectedCalendarIsInDb({
  user,
  selectedCalendar,
  eventTypeId,
}: {
  user: UserWithCalendars;
  selectedCalendar: {
    integration: string;
    externalId: string;
  };
  eventTypeId: number | null;
}) {
  console.log(
    `Upsert the selectedCalendar record to the DB for user ${user.id} with details ${JSON.stringify(
      selectedCalendar
    )}`
  );

  await SelectedCalendarRepository.createIfNotExists({
    userId: user.id,
    integration: selectedCalendar.integration,
    externalId: selectedCalendar.externalId,
    eventTypeId,
  });
}

function getSelectedCalendars({
  user,
  eventTypeId,
}: {
  user: UserWithCalendars;
  eventTypeId: number | null;
}): Pick<
  SelectedCalendar,
  "externalId" | "integration" | "eventTypeId" | "updatedAt" | "googleChannelId" | "id"
>[] {
  if (eventTypeId) {
    return user.allSelectedCalendars.filter((calendar) => calendar.eventTypeId === eventTypeId);
  }
  return user.userLevelSelectedCalendars;
}

export type UserWithCalendars = Pick<User, "id" | "email"> & {
  allSelectedCalendars: Pick<
    SelectedCalendar,
    "externalId" | "integration" | "eventTypeId" | "updatedAt" | "googleChannelId" | "id"
  >[];
  userLevelSelectedCalendars: Pick<
    SelectedCalendar,
    "externalId" | "integration" | "eventTypeId" | "updatedAt" | "googleChannelId" | "id"
  >[];
  destinationCalendar: DestinationCalendar | null;
};

export type ConnectedDestinationCalendars = Awaited<
  ReturnType<typeof getConnectedDestinationCalendarsAndEnsureDefaultsInDb>
>;

/**
 * Fetches the calendars for the authenticated user or the event-type if provided
 * It also takes care of updating the destination calendar in some edge cases
 */
export async function getConnectedDestinationCalendarsAndEnsureDefaultsInDb({
  user,
  onboarding,
  eventTypeId,
  prisma,
  skipSync,
}: {
  user: UserWithCalendars;
  onboarding: boolean;
  eventTypeId?: number | null;
  prisma: PrismaClient;
  skipSync?: boolean;
}): Promise<{
  destinationCalendar: DestinationCalendar & Omit<IntegrationCalendar, "id" | "userId">;
  connectedCalendars: Awaited<ReturnType<typeof getConnectedCalendars>>["connectedCalendars"];
}> {
  const userCredentials = await prisma.credential.findMany({
    where: {
      userId: user.id,
      app: {
        categories: { has: AppCategories.calendar },
        enabled: true,
      },
    },
    select: {
      selectedCalendars: {
        select: {
          id: true,
        },
      },
      ...credentialForCalendarServiceSelect,
    },
  });

  const selectedCalendars = getSelectedCalendars({ user, eventTypeId: eventTypeId ?? null });
  let connectedCalendars: Awaited<ReturnType<typeof getConnectedCalendars>>["connectedCalendars"] = [];
  let destinationCalendar: IntegrationCalendar | undefined;

  const { credentials: allCredentials } = await enrichUserWithDelegationCredentialsIncludeServiceAccountKey({
    user: { id: user.id, email: user.email, credentials: userCredentials },
  });
  // get user's credentials + their connected integrations
  const calendarCredentials = getCalendarCredentials(allCredentials);

  if (!skipSync) {
    // get all the connected integrations' calendars (from third party)
    const getConnectedCalendarsResult = await getConnectedCalendars(
      calendarCredentials,
      selectedCalendars,
      user.destinationCalendar?.externalId
    );

    connectedCalendars = getConnectedCalendarsResult.connectedCalendars;
    destinationCalendar = getConnectedCalendarsResult.destinationCalendar;

    let calendarToEnsureIsEnabledForConflictCheck: ToggledCalendarDetails | null = null;

    if (connectedCalendars.length === 0) {
      user = await handleNoConnectedCalendars(user);
    } else if (!user.destinationCalendar) {
      ({ user, calendarToEnsureIsEnabledForConflictCheck, connectedCalendars } =
        await handleNoDestinationCalendar({
          user,
          connectedCalendars,
          onboarding,
        }));
    } else {
      /* There are connected calendars and a destination calendar */
      log.debug(
        `There are connected calendars and a destination calendar, so check if destinationCalendar exists in connectedCalendars for user ${user.id}`
      );

      const destinationCal = findMatchingCalendar({ connectedCalendars, calendar: user.destinationCalendar });
      if (!destinationCal) {
        ({ user, calendarToEnsureIsEnabledForConflictCheck, connectedCalendars } =
          await handleDestinationCalendarNotInConnectedCalendars({
            user,
            connectedCalendars,
            onboarding,
          }));
      } else if (onboarding && !destinationCal.isSelected) {
        log.debug(
          `Onboarding:Destination calendar is not selected, but in connectedCalendars, so mark it as selected in the calendar list for user ${user.id}`
        );
        // Mark the destination calendar as selected in the calendar list
        // We use every so that we can exit early once we find the matching calendar
        connectedCalendars.every((cal) => {
          const index = (cal.calendars || []).findIndex(
            (calendar) =>
              calendar.externalId === destinationCal.externalId &&
              calendar.integration === destinationCal.integration
          );
          if (index >= 0 && cal.calendars) {
            cal.calendars[index].isSelected = true;
            calendarToEnsureIsEnabledForConflictCheck = {
              externalId: destinationCal.externalId,
              integration: destinationCal.integration || "",
            };
            return false;
          }

          return true;
        });
      }
    }

    // Insert the newly toggled record to the DB
    if (calendarToEnsureIsEnabledForConflictCheck) {
      await ensureSelectedCalendarIsInDb({
        user,
        selectedCalendar: calendarToEnsureIsEnabledForConflictCheck,
        eventTypeId: eventTypeId ?? null,
      });
    }
  }
  // very explicit about skipping sync.
  if (skipSync) {
    // TODO: Make calendar types more flexible so this isn't needed
    calendarCredentials.map(async (item) => {
      const { integration } = item;
      // TODO: Make calendar types more flexible somehow so this isn't needed
      const credential: typeof item.credential & { selectedCalendars: { id: string }[] } =
        item.credential as CredentialDataWithTeamName & { selectedCalendars: { id: string }[] };

      const safeToSendIntegration = cleanIntegrationKeys(integration);
      connectedCalendars.push({
        integration: safeToSendIntegration,
        credentialId: credential.id,
        delegationCredentialId: credential.delegationCredentialId,
        calendars: selectedCalendars
          .filter((cal) =>
            credential.selectedCalendars.some((appSelectedCal) => appSelectedCal.id === cal.id)
          )
          .map((cal) => ({
            ...cal,
            isSelected: true,
            readOnly: false,
            primary: null,
            credentialId: credential.id,
            delegationCredentialId: credential.delegationCredentialId,
          })),
      });
    });
  }

  const noConflictingNonDelegatedConnectedCalendars = _ensureNoConflictingNonDelegatedConnectedCalendar({
    connectedCalendars,
    loggedInUser: { email: user.email },
  });
  let destinationCalendarWithoutIdAndUserId: Omit<IntegrationCalendar, "id" | "userId"> | null = null;
  if (destinationCalendar) {
    // ID and userID will be provided by user.destinationCalendar
    const { id: _id, userId: _userId, ...partialDestCal } = destinationCalendar;
    destinationCalendarWithoutIdAndUserId = partialDestCal;
  }
  return {
    connectedCalendars: noConflictingNonDelegatedConnectedCalendars,
    destinationCalendar: {
      // biome-ignore lint/style/noNonNullAssertion: destinationCalendar is guaranteed to be non null here
      ...user.destinationCalendar!,
      ...destinationCalendarWithoutIdAndUserId,
    },
  };
}

// Legacy export for @calcom/platform-libraries
export const getConnectedDestinationCalendars = getConnectedDestinationCalendarsAndEnsureDefaultsInDb;

import type { ChildInput } from "@calcom/features/eventtypes/lib/types";
import logger from "@calcom/lib/logger";
import type { PrismaClient } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { SchedulingType } from "@calcom/prisma/enums";
import { EventTypeMetaDataSchema, allManagedEventTypePropsForZod } from "@calcom/prisma/zod-utils";

const log = logger.getSubLogger({ prefix: ["handleChildrenEventTypes"] });

// Managed scalar props whose values live on the parent but must never be copied
// verbatim onto children:
// - scheduleId: availability is per-assignee (unlocked by default)
// - assignAllTeamMembers: parent-only assignment concept
// - metadata: contains managedEventConfig which is parent-only (handled separately)
// - hidden: has dedicated lock semantics (handled separately)
// - position: children keep their own ordering
const NON_PROPAGATED_PROPS = new Set<string>([
  "scheduleId",
  "assignAllTeamMembers",
  "metadata",
  "hidden",
  "position",
]);

// Slug follows the parent on creation but is not re-propagated on updates to avoid
// unique-constraint collisions (userId, slug) once a child exists.
const UPDATE_EXCLUDED_PROPS = new Set<string>([...NON_PROPAGATED_PROPS, "slug"]);

// Scalar Json columns that require Prisma.DbNull instead of a literal `null`.
const JSON_PROPS = new Set<string>([
  "locations",
  "recurringEvent",
  "bookingLimits",
  "bookingFields",
  "durationLimits",
  "eventTypeColor",
  "metadata",
]);

const MANAGED_SCALAR_KEYS = Object.keys(allManagedEventTypePropsForZod) as Array<
  keyof typeof allManagedEventTypePropsForZod
>;

const coerceValue = (key: string, value: unknown) => {
  if (JSON_PROPS.has(key)) {
    return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
  }
  return value;
};

/**
 * Builds a plain data object of the managed scalar props copied from the parent,
 * skipping the excluded keys and any field the user has explicitly unlocked.
 */
const buildPropagatedData = (
  parent: Record<string, unknown>,
  excluded: Set<string>,
  unlockedFields: Record<string, boolean | undefined>
) => {
  const data: Record<string, unknown> = {};
  for (const key of MANAGED_SCALAR_KEYS) {
    if (excluded.has(key)) continue;
    // Unlocked fields are owned by the assignee and must not be overwritten.
    if (unlockedFields[key]) continue;
    data[key] = coerceValue(key, parent[key as keyof typeof parent]);
  }
  return data;
};

type HandleChildrenEventTypesArgs = {
  eventTypeId: number;
  updatedEventType: { slug: string; schedulingType: SchedulingType | null };
  oldEventType: { children?: { userId: number | null }[] | null };
  children?: ChildInput[];
  prisma: PrismaClient;
};

/**
 * Synchronises the child event types of a managed event type with the list of
 * assigned users, propagating the parent's locked managed props (including the
 * `hidden` / "Hide from profile" toggle) to each child.
 *
 * Lock semantics for `hidden`:
 * - locked (default, not in unlockedFields): every child inherits the parent's `hidden`.
 * - unlocked: each child keeps its own `hidden` value supplied in the payload.
 */
export default async function handleChildrenEventTypes({
  eventTypeId,
  updatedEventType,
  oldEventType,
  children,
  prisma,
}: HandleChildrenEventTypesArgs) {
  // Only managed event types have children to propagate to.
  if (updatedEventType.schedulingType !== SchedulingType.MANAGED) {
    return { message: "Not a managed event type" };
  }

  // Fetch the freshly-updated parent scalar values to copy onto children.
  const parent = await prisma.eventType.findUniqueOrThrow({
    where: { id: eventTypeId },
    select: { ...allManagedEventTypePropsForZod },
  });

  const metadata = EventTypeMetaDataSchema.safeParse(parent.metadata);
  const unlockedFields =
    (metadata.success && metadata.data?.managedEventConfig?.unlockedFields) || ({} as Record<string, boolean>);
  const isHiddenLocked = !unlockedFields.hidden;

  const previousUserIds = (oldEventType.children ?? [])
    .map((child) => child.userId)
    .filter((userId): userId is number => typeof userId === "number");

  // Quick-update path: the full assignment list isn't part of this request (e.g. the
  // "Hide from profile" toggle in the event type listing only sends `{ id, hidden }`).
  // Sync the locked managed props to the existing children without creating/deleting any.
  if (!children) {
    if (!previousUserIds.length) {
      return { message: "No children to sync" };
    }
    const updateData = buildPropagatedData(parent, UPDATE_EXCLUDED_PROPS, unlockedFields);
    await prisma.eventType.updateMany({
      where: { parentId: eventTypeId, userId: { in: previousUserIds } },
      data: {
        ...(updateData as Prisma.EventTypeUpdateManyMutationInput),
        // Only propagate hidden when it is a locked field; when unlocked, children own it.
        ...(isHiddenLocked ? { hidden: parent.hidden } : {}),
      },
    });
    return { syncedUserIds: previousUserIds };
  }

  const currentUserIds = children.map((child) => child.owner.id);

  const deletedUserIds = previousUserIds.filter((userId) => !currentUserIds.includes(userId));
  const newUserIds = currentUserIds.filter((userId) => !previousUserIds.includes(userId));
  const oldUserIds = currentUserIds.filter((userId) => previousUserIds.includes(userId));

  // Children carry the parent's metadata (including managedEventConfig.unlockedFields)
  // so the child editor knows which fields are locked. Copied verbatim on creation.
  const childMetadata = coerceValue("metadata", parent.metadata);

  // 1) Create children for newly assigned users.
  if (newUserIds.length) {
    const createBase = buildPropagatedData(parent, NON_PROPAGATED_PROPS, {});
    await Promise.all(
      newUserIds.map((userId) => {
        const childInput = children.find((child) => child.owner.id === userId);
        // Skip if the assignee already owns an event type with this slug to avoid collisions.
        if (childInput?.owner.eventTypeSlugs.includes(updatedEventType.slug)) {
          log.warn(
            `Skipping child creation for user ${userId}: slug "${updatedEventType.slug}" already in use`
          );
          return Promise.resolve();
        }
        const hidden = isHiddenLocked ? parent.hidden : childInput?.hidden ?? false;
        return prisma.eventType.create({
          data: {
            ...(createBase as Prisma.EventTypeCreateInput),
            slug: parent.slug,
            hidden,
            metadata: childMetadata,
            parent: { connect: { id: eventTypeId } },
            owner: { connect: { id: userId } },
            users: { connect: { id: userId } },
          },
        });
      })
    );
  }

  // 2) Update existing children with the parent's locked managed props.
  if (oldUserIds.length) {
    const updateData = buildPropagatedData(parent, UPDATE_EXCLUDED_PROPS, unlockedFields);
    await Promise.all(
      oldUserIds.map((userId) => {
        const childInput = children.find((child) => child.owner.id === userId);
        const hidden = isHiddenLocked ? parent.hidden : childInput?.hidden ?? false;
        return prisma.eventType.updateMany({
          where: { parentId: eventTypeId, userId },
          data: {
            ...(updateData as Prisma.EventTypeUpdateManyMutationInput),
            hidden,
          },
        });
      })
    );
  }

  // 3) Remove children for unassigned users.
  if (deletedUserIds.length) {
    await prisma.eventType.deleteMany({
      where: { parentId: eventTypeId, userId: { in: deletedUserIds } },
    });
  }

  return {
    newUserIds,
    oldUserIds,
    deletedUserIds,
  };
}

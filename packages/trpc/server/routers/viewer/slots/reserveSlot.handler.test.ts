import type { PrismaClient } from "@calcom/prisma";
import { vi, describe, it, expect, afterEach } from "vitest";

// We want to test that the UID cookie set by reserveSlotHandler is configured with the correct
// SameSite and Secure attributes depending on the environment (http vs https).
// reserveSlotHandler relies on WEBAPP_URL being evaluated at import time, so we need to reset modules
// between tests after tweaking process.env to simulate different deployment environments.
//
// The handler also calls into Prisma and the SelectedSlotRepository, so we stub those parts out.

// We alias the module path once we know WEBAPP_URL has been configured.
const dynamicImportHandler = async () => await import("./reserveSlot.handler");

// The repository instance method is used to check for an existing reservation by someone else.
// To keep this unit test isolated from the database layer, we stub this to always resolve falsey.
vi.mock("@calcom/features/selectedSlots/repositories/PrismaSelectedSlotRepository", () => ({
  PrismaSelectedSlotRepository: vi.fn().mockImplementation(function () {
    return {
      findReservedByOthers: vi.fn().mockResolvedValue(null),
    };
  }),
}));

// A tiny helper to build a canned handler context with stubbed Prisma methods.
const buildContext = () => {
  const prismaStub = {
    eventType: {
      // Return a minimal event type that will exercise the happy path.
      findUnique: vi.fn().mockResolvedValue({ users: [{ id: 1 }], seatsPerTimeSlot: null }),
    },
    booking: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    selectedSlots: {
      upsert: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;

  // Capture header values to assert on.
  let cookieHeaderValue: string | null = null;
  const resStub = {
    setHeader: vi.fn((_name: string, value: string) => {
      cookieHeaderValue = value;
    }),
  };

  const reqStub = {
    cookies: {},
  };

  return { prismaStub, resStub, reqStub, getCookieHeader: () => cookieHeaderValue };
};

describe("reserveSlotHandler seated event reservation", () => {
  const originalWebappUrl = process.env.NEXT_PUBLIC_WEBAPP_URL;

  afterEach(() => {
    vi.resetModules();
    if (originalWebappUrl === undefined) delete process.env.NEXT_PUBLIC_WEBAPP_URL;
    else process.env.NEXT_PUBLIC_WEBAPP_URL = originalWebappUrl;
  });

  it("reserves the slot for the first attendee of a seated event (no existing booking)", async () => {
    process.env.NEXT_PUBLIC_WEBAPP_URL = "https://example.com";
    vi.resetModules();
    const { reserveSlotHandler } = await dynamicImportHandler();

    const upsertMock = vi.fn().mockResolvedValue(null);
    const prismaStub = {
      eventType: {
        findUnique: vi.fn().mockResolvedValue({
          users: [{ id: 1 }],
          seatsPerTimeSlot: 5,
        }),
      },
      booking: {
        // No existing booking — first person to reserve this seated slot
        findFirst: vi.fn().mockResolvedValue(null),
      },
      selectedSlots: {
        upsert: upsertMock,
      },
    } as unknown as PrismaClient;

    await reserveSlotHandler({
      ctx: { prisma: prismaStub, req: { cookies: {} }, res: { setHeader: vi.fn() } },
      input: {
        slotUtcStartDate: new Date().toISOString(),
        slotUtcEndDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        eventTypeId: 1,
        bookingUid: undefined,
        _isDryRun: false,
      },
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("blocks reservation when all seats on a seated event are taken", async () => {
    process.env.NEXT_PUBLIC_WEBAPP_URL = "https://example.com";
    vi.resetModules();
    const { reserveSlotHandler } = await dynamicImportHandler();

    const upsertMock = vi.fn().mockResolvedValue(null);
    const prismaStub = {
      eventType: {
        findUnique: vi.fn().mockResolvedValue({
          users: [{ id: 1 }],
          seatsPerTimeSlot: 2,
        }),
      },
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          attendees: [{ id: 10 }, { id: 11 }], // 2 attendees = seats full
        }),
      },
      selectedSlots: {
        upsert: upsertMock,
      },
    } as unknown as PrismaClient;

    await reserveSlotHandler({
      ctx: { prisma: prismaStub, req: { cookies: {} }, res: { setHeader: vi.fn() } },
      input: {
        slotUtcStartDate: new Date().toISOString(),
        slotUtcEndDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        eventTypeId: 1,
        bookingUid: undefined,
        _isDryRun: false,
      },
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("reserveSlotHandler cookie settings", () => {
  const originalWebappUrl = process.env.NEXT_PUBLIC_WEBAPP_URL;

  afterEach(() => {
    // Reset the module registry and restore the WEBAPP_URL between tests.
    vi.resetModules();
    if (originalWebappUrl === undefined) {
      delete process.env.NEXT_PUBLIC_WEBAPP_URL;
    } else {
      process.env.NEXT_PUBLIC_WEBAPP_URL = originalWebappUrl;
    }
  });

  it("sets SameSite=None and Secure when WEBAPP_URL is https", async () => {
    process.env.NEXT_PUBLIC_WEBAPP_URL = "https://example.com";
    vi.resetModules();
    const { reserveSlotHandler } = await dynamicImportHandler();
    const { prismaStub, reqStub, resStub, getCookieHeader } = buildContext();
    await reserveSlotHandler({
      ctx: { prisma: prismaStub, req: reqStub, res: resStub },
      input: {
        slotUtcStartDate: new Date().toISOString(),
        slotUtcEndDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        eventTypeId: 1,
        bookingUid: undefined,
        _isDryRun: false,
      },
    });
    const cookie = getCookieHeader();
    expect(cookie).toMatch(/SameSite=None/);
    expect(cookie).toMatch(/Secure/);
  });

  it("falls back to SameSite=Lax and no Secure for http WEBAPP_URL", async () => {
    process.env.NEXT_PUBLIC_WEBAPP_URL = "http://localhost:3000";
    vi.resetModules();
    const { reserveSlotHandler } = await dynamicImportHandler();
    const { prismaStub, reqStub, resStub, getCookieHeader } = buildContext();
    await reserveSlotHandler({
      ctx: { prisma: prismaStub, req: reqStub, res: resStub },
      input: {
        slotUtcStartDate: new Date().toISOString(),
        slotUtcEndDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        eventTypeId: 1,
        bookingUid: undefined,
        _isDryRun: false,
      },
    });
    const cookie = getCookieHeader();
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/Secure/);
  });
});

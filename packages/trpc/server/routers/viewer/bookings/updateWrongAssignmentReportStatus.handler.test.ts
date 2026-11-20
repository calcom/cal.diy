import { WrongAssignmentReportStatus } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateWrongAssignmentReportStatusHandler } from "./updateWrongAssignmentReportStatus.handler";
import prisma from "@calcom/prisma";

const mockFindTeamIdById = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("@calcom/features/bookings/repositories/WrongAssignmentReportRepository", () => {
  return {
    WrongAssignmentReportRepository: class MockRepo {
      findTeamIdById = mockFindTeamIdById;
      updateStatus = mockUpdateStatus;
    },
  };
});

vi.mock("@calcom/prisma", () => ({
  default: {
    membership: {
      findFirst: vi.fn(),
    },
  },
}));

describe("updateWrongAssignmentReportStatusHandler", () => {
  const mockUser = { id: 1, email: "reviewer@example.com", name: "Reviewer" } as any;
  const mockInput = { reportId: "report-123", status: WrongAssignmentReportStatus.RESOLVED };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when report doesn't exist", async () => {
    mockFindTeamIdById.mockResolvedValue(null);
    await expect(
      updateWrongAssignmentReportStatusHandler({ ctx: { user: mockUser }, input: mockInput })
    ).rejects.toThrowError(new TRPCError({ code: "NOT_FOUND", message: "Report not found" }));
  });

  it("throws FORBIDDEN when the report has no team", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: null });
    await expect(
      updateWrongAssignmentReportStatusHandler({ ctx: { user: mockUser }, input: mockInput })
    ).rejects.toThrowError(new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to update this report" }));
  });

  it("throws FORBIDDEN when user is not in the team (IDOR prevented)", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: 5 });
    vi.mocked(prisma.membership.findFirst).mockResolvedValue(null);
    
    await expect(
      updateWrongAssignmentReportStatusHandler({ ctx: { user: mockUser }, input: mockInput })
    ).rejects.toThrowError(new TRPCError({ code: "FORBIDDEN", message: "You must be a member of the team to update this report" }));
  });

  it("updates status when user is a valid team member", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: 5 });
    vi.mocked(prisma.membership.findFirst).mockResolvedValue({ id: 99 } as any);
    mockUpdateStatus.mockResolvedValue({ id: mockInput.reportId, status: mockInput.status });

    const result = await updateWrongAssignmentReportStatusHandler({ ctx: { user: mockUser }, input: mockInput });
    
    expect(result.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalled();
  });
});
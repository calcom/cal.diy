import { WrongAssignmentReportStatus } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateWrongAssignmentReportStatusHandler } from "./updateWrongAssignmentReportStatus.handler";

const mockFindTeamIdById = vi.fn();
const mockUpdateStatus = vi.fn();

const { mockGetAdminOrOwnerMembership } = vi.hoisted(() => ({
  mockGetAdminOrOwnerMembership: vi.fn(),
}));

vi.mock("@calcom/features/bookings/repositories/WrongAssignmentReportRepository", () => {
  return {
    WrongAssignmentReportRepository: class MockWrongAssignmentReportRepository {
      findTeamIdById = mockFindTeamIdById;
      updateStatus = mockUpdateStatus;
    },
  };
});
vi.mock("@calcom/features/membership/repositories/MembershipRepository", () => {
  return {
    MembershipRepository: {
      getAdminOrOwnerMembership: mockGetAdminOrOwnerMembership,
    },
  };
});
vi.mock("@calcom/prisma", () => ({
  default: {},
}));

describe("updateWrongAssignmentReportStatusHandler", () => {
  const mockUser = {
    id: 1,
    email: "reviewer@example.com",
    name: "Reviewer User",
  };

  const mockInput = {
    reportId: "report-uuid-123",
    status: WrongAssignmentReportStatus.RESOLVED,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when the report doesn't exist", async () => {
    mockFindTeamIdById.mockResolvedValue(null);

    await expect(
      updateWrongAssignmentReportStatusHandler({
        ctx: { user: mockUser },
        input: mockInput,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Report not found",
    });

    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the report has no teamId", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: null });

    await expect(
      updateWrongAssignmentReportStatusHandler({
        ctx: { user: mockUser },
        input: mockInput,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to update this report",
    });

    expect(mockGetAdminOrOwnerMembership).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when the caller is not an admin/owner of the report's team", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: 5 });
    mockGetAdminOrOwnerMembership.mockResolvedValue(null);

    await expect(
      updateWrongAssignmentReportStatusHandler({
        ctx: { user: mockUser },
        input: mockInput,
      })
    ).rejects.toThrow(TRPCError);

    expect(mockGetAdminOrOwnerMembership).toHaveBeenCalledWith(mockUser.id, 5);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("updates the report status when the caller is an admin/owner of the report's team", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: 5 });
    mockGetAdminOrOwnerMembership.mockResolvedValue({ id: "membership-1" });
    mockUpdateStatus.mockResolvedValue({
      id: mockInput.reportId,
      status: mockInput.status,
      reviewedById: mockUser.id,
      reviewedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await updateWrongAssignmentReportStatusHandler({
      ctx: { user: mockUser },
      input: mockInput,
    });

    expect(mockUpdateStatus).toHaveBeenCalledWith({
      id: mockInput.reportId,
      status: mockInput.status,
      reviewedById: mockUser.id,
    });
    expect(result).toEqual({
      success: true,
      report: {
        id: mockInput.reportId,
        status: mockInput.status,
        reviewedById: mockUser.id,
        reviewedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
  });

  it("does not let a member from a different team update the report (IDOR check)", async () => {
    mockFindTeamIdById.mockResolvedValue({ id: mockInput.reportId, teamId: 5 });
    mockGetAdminOrOwnerMembership.mockResolvedValue(null);

    await expect(
      updateWrongAssignmentReportStatusHandler({
        ctx: { user: { ...mockUser, id: 999 } },
        input: mockInput,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(mockGetAdminOrOwnerMembership).toHaveBeenCalledWith(999, 5);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});

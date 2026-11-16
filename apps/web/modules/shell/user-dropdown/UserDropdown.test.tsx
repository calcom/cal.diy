import { render, waitFor } from "@testing-library/react";
import React from "react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@calcom/lib/hooks/useUserAgentData", () => ({
  useUserAgentData: () => ({
    os: "linux",
    browser: "chrome",
    isMobile: false,
  }),
}));

const mockUseMeQuery = vi.fn();
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({
  default: () => mockUseMeQuery(),
}));

vi.mock("@calcom/ui/components/avatar", () => ({
  Avatar: () => <div data-testid="avatar">Avatar</div>,
}));

vi.mock("@calcom/ui/components/icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

vi.mock("@coss/ui/components/menu", () => ({
  Menu: ({ children }: { children: React.ReactNode }) => <div data-testid="menu">{children}</div>,
  MenuTrigger: ({ children, render }: { children: React.ReactNode; render?: React.ReactElement }) => {
    if (render) {
      return React.cloneElement(render, {}, children);
    }
    return <div>{children}</div>;
  },
  MenuPopup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MenuSeparator: () => <hr />,
  MenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MenuSubPopup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@calcom/ui/classNames", () => ({
  default: (...args: string[]) => args.filter(Boolean).join(" "),
}));

describe("UserDropdown", () => {
  let mockBeacon: ReturnType<typeof vi.fn>;
  let mockSupportOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBeacon = vi.fn();
    mockSupportOpen = vi.fn();

    Object.defineProperty(window, "Beacon", {
      value: mockBeacon,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "Support", {
      value: { open: mockSupportOpen, shouldShowTriggerButton: vi.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "screen", {
      value: { width: 1920, height: 1080 },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    delete window.Beacon;
    delete window.Support;
  });

  describe("Beacon session-data functionality", () => {
    it("should call Beacon with session-data when Beacon is available and user has username", async () => {
      mockUseMeQuery.mockReturnValue({
        data: { username: "testuser", name: "Test User", avatarUrl: null, avatar: null },
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");
      render(<UserDropdown />);

      await waitFor(() => {
        expect(mockBeacon).toHaveBeenCalledWith("session-data", {
          username: "testuser",
          screenResolution: "1920x1080",
        });
      });
    });

    it("should call Beacon with 'Unknown' username when user has no username", async () => {
      mockUseMeQuery.mockReturnValue({
        data: { username: null, name: "Test User", avatarUrl: null, avatar: null },
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");
      render(<UserDropdown />);

      await waitFor(() => {
        expect(mockBeacon).toHaveBeenCalledWith("session-data", {
          username: "Unknown",
          screenResolution: "1920x1080",
        });
      });
    });

    it("should not throw error when Beacon is undefined", async () => {
      delete window.Beacon;

      mockUseMeQuery.mockReturnValue({
        data: { username: "testuser", name: "Test User", avatarUrl: null, avatar: null },
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");

      // Should not throw
      expect(() => render(<UserDropdown />)).not.toThrow();
    });

    it("should call Beacon when it loads lazily after mount", async () => {
      // Start with Beacon undefined (simulating lazy load)
      delete window.Beacon;

      mockUseMeQuery.mockReturnValue({
        data: { username: "testuser", name: "Test User", avatarUrl: null, avatar: null },
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");
      render(<UserDropdown />);

      // Beacon should not have been called yet
      expect(mockBeacon).not.toHaveBeenCalled();

      // Simulate Beacon loading after mount
      Object.defineProperty(window, "Beacon", {
        value: mockBeacon,
        writable: true,
        configurable: true,
      });

      // Wait for the polling interval to detect Beacon
      await waitFor(
        () => {
          expect(mockBeacon).toHaveBeenCalledWith("session-data", {
            username: "testuser",
            screenResolution: "1920x1080",
          });
        },
        { timeout: 2000 }
      );
    });

    it("should update Beacon session-data when username changes", async () => {
      const { rerender } = render(<div />);

      // First render with initial username
      mockUseMeQuery.mockReturnValue({
        data: { username: "user1", name: "User One", avatarUrl: null, avatar: null },
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");
      const { rerender: rerenderComponent } = render(<UserDropdown />);

      await waitFor(() => {
        expect(mockBeacon).toHaveBeenCalledWith("session-data", {
          username: "user1",
          screenResolution: "1920x1080",
        });
      });

      // Clear mock to track new calls
      mockBeacon.mockClear();

      // Update username
      mockUseMeQuery.mockReturnValue({
        data: { username: "user2", name: "User Two", avatarUrl: null, avatar: null },
        isPending: false,
      });

      rerenderComponent(<UserDropdown />);

      await waitFor(() => {
        expect(mockBeacon).toHaveBeenCalledWith("session-data", {
          username: "user2",
          screenResolution: "1920x1080",
        });
      });
    });
  });

  describe("Component rendering", () => {
    it("should return null when user is not available and not pending", async () => {
      mockUseMeQuery.mockReturnValue({
        data: null,
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");
      const { container } = render(<UserDropdown />);

      // Component should return null
      expect(container.firstChild).toBeNull();
    });

    it("should render dropdown when user is available", async () => {
      mockUseMeQuery.mockReturnValue({
        data: { username: "testuser", name: "Test User", avatarUrl: null, avatar: null },
        isPending: false,
      });

      const { UserDropdown } = await import("./UserDropdown");
      const { getByTestId } = render(<UserDropdown />);

      expect(getByTestId("menu")).toBeInTheDocument();
    });

    it("should render dropdown when isPending is true (loading state)", async () => {
      mockUseMeQuery.mockReturnValue({
        data: null,
        isPending: true,
      });

      const { UserDropdown } = await import("./UserDropdown");
      const { getByTestId } = render(<UserDropdown />);

      expect(getByTestId("menu")).toBeInTheDocument();
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersAddView from "./users-add-view";

const { mockMutate, mockInvalidate, mockShowToast, capturedCallbacks } = vi.hoisted(() => {
  const capturedCallbacks: {
    onSuccess?: () => Promise<void>;
    onError?: (err: { data?: { code?: string; fields?: string[] } }) => void;
  } = {};
  return {
    mockMutate: vi.fn(),
    mockInvalidate: vi.fn().mockResolvedValue(undefined),
    mockShowToast: vi.fn(),
    capturedCallbacks,
  };
});

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/settings/admin/users/add"),
  useRouter: vi.fn().mockReturnValue({
    replace: vi.fn(),
  }),
}));

vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      users: {
        add: {
          useMutation: vi.fn(
            (options: { onSuccess: () => Promise<void>; onError: (err: unknown) => void }) => {
              capturedCallbacks.onSuccess = options.onSuccess;
              capturedCallbacks.onError = options.onError;
              return { mutate: mockMutate, isLoading: false };
            }
          ),
        },
      },
    },
    useUtils: vi.fn(() => ({
      viewer: {
        users: {
          list: {
            invalidate: mockInvalidate,
          },
        },
      },
    })),
  },
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

vi.mock("../components/UserForm", () => ({
  UserForm: ({
    onSubmit,
    submitLabel,
  }: {
    onSubmit: (values: Record<string, unknown>) => void;
    submitLabel: string;
  }) => (
    <form
      data-testid="user-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: "Test User",
          email: "test@example.com",
          username: "testuser",
          bio: "",
          timeZone: "UTC",
          weekStart: { value: "Monday" },
          theme: null,
          defaultScheduleId: null,
          locale: { value: "en" },
          timeFormat: { value: 12 },
          allowDynamicBooking: true,
          identityProvider: { value: "CAL" },
          role: { value: "USER" },
          avatarUrl: null,
        });
      }}>
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

vi.mock("@calcom/ui/components/form", () => ({
  Form: ({ children, handleSubmit }: { children: ReactNode; handleSubmit: () => void }) => (
    <form onSubmit={handleSubmit}>{children}</form>
  ),
  TextField: (props: Record<string, unknown>) => <input {...props} />,
  EmailField: (props: Record<string, unknown>) => <input type="email" {...props} />,
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
  Select: () => <select />,
}));

function renderView() {
  return render(<UsersAddView />);
}

function buildTrpcError(code: string, fields?: string[]) {
  return {
    data: {
      code,
      fields,
    },
  };
}

async function submitForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /add/i }));
}

describe("UsersAddView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallbacks.onSuccess = undefined;
    capturedCallbacks.onError = undefined;
  });

  describe("rendering", () => {
    it("renders the UserForm with submitLabel='add'", () => {
      renderView();
      expect(screen.getByTestId("user-form")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
    });
  });

  describe("form submission", () => {
    it("calls mutation.mutate with the mapped form values on submit", async () => {
      renderView();
      await submitForm();

      expect(mockMutate).toHaveBeenCalledOnce();
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test User",
          email: "test@example.com",
          username: "testuser",
          bio: "",
          timeZone: "UTC",
          weekStart: "Monday",
          locale: "en",
          timeFormat: 12,
          identityProvider: "CAL",
          role: "USER",
          theme: null,
          defaultScheduleId: null,
          allowDynamicBooking: true,
          avatarUrl: null,
        })
      );
    });
  });

  describe("onSuccess callback", () => {
    it("shows a success toast and invalidates the users list", async () => {
      renderView();
      await capturedCallbacks.onSuccess!();

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("user_added_successfully", "success");
      expect(mockInvalidate).toHaveBeenCalledOnce();
    });

    it("navigates away by replacing /add with '' in the pathname", async () => {
      const { useRouter } = await import("next/navigation");
      const mockReplace = vi.fn();
      vi.mocked(useRouter).mockReturnValue({
        replace: mockReplace,
        push: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
      });

      renderView();
      await capturedCallbacks.onSuccess!();

      expect(mockReplace).toHaveBeenCalledWith("/settings/admin/users");
    });
  });

  describe("onError callback – CONFLICT: email already exists", () => {
    it("shows 'user_with_email_already_exists' toast when the conflicting field is 'email'", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["email"]));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("user_with_email_already_exists", "error");
    });

    it("does NOT show any other toast when the email conflict is triggered", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["email"]));

      expect(mockShowToast).toHaveBeenCalledTimes(1);
      const [message] = mockShowToast.mock.calls[0];
      expect(message).toBe("user_with_email_already_exists");
    });
  });

  describe("onError callback – CONFLICT: username already exists", () => {
    it("shows 'user_with_username_already_exists' toast when the conflicting field is 'username'", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["username"]));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("user_with_username_already_exists", "error");
    });

    it("does NOT show any other toast when the username conflict is triggered", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["username"]));

      expect(mockShowToast).toHaveBeenCalledTimes(1);
      const [message] = mockShowToast.mock.calls[0];
      expect(message).toBe("user_with_username_already_exists");
    });
  });

  describe("onError callback – CONFLICT: no specific field match", () => {
    it("shows generic 'user_already_exists' toast when fields array is empty", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", []));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("user_already_exists", "error");
    });

    it("shows generic 'user_already_exists' toast when fields is undefined", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", undefined));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("user_already_exists", "error");
    });

    it("shows generic 'user_already_exists' toast when fields contains an unknown field name", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["phone"]));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("user_already_exists", "error");
    });
  });

  describe("onError callback – non-CONFLICT error", () => {
    it("shows 'error_adding_user' toast for a non-CONFLICT tRPC error code", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("INTERNAL_SERVER_ERROR"));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("error_adding_user", "error");
    });

    it("shows 'error_adding_user' toast when error has no data at all", () => {
      renderView();
      capturedCallbacks.onError!({});

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("error_adding_user", "error");
    });

    it("shows 'error_adding_user' toast for a BAD_REQUEST error", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("BAD_REQUEST"));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("error_adding_user", "error");
    });

    it("shows 'error_adding_user' toast for an UNAUTHORIZED error", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("UNAUTHORIZED"));

      expect(mockShowToast).toHaveBeenCalledOnce();
      expect(mockShowToast).toHaveBeenCalledWith("error_adding_user", "error");
    });
  });

  describe("toast severity", () => {
    it("uses 'error' severity for all error toasts (email conflict)", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["email"]));
      expect(mockShowToast.mock.calls[0][1]).toBe("error");
    });

    it("uses 'error' severity for all error toasts (username conflict)", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", ["username"]));
      expect(mockShowToast.mock.calls[0][1]).toBe("error");
    });

    it("uses 'error' severity for all error toasts (generic conflict)", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("CONFLICT", []));
      expect(mockShowToast.mock.calls[0][1]).toBe("error");
    });

    it("uses 'error' severity for all error toasts (non-conflict)", () => {
      renderView();
      capturedCallbacks.onError!(buildTrpcError("INTERNAL_SERVER_ERROR"));
      expect(mockShowToast.mock.calls[0][1]).toBe("error");
    });

    it("uses 'success' severity for the success toast", async () => {
      renderView();
      await capturedCallbacks.onSuccess!();
      expect(mockShowToast.mock.calls[0][1]).toBe("success");
    });
  });
});

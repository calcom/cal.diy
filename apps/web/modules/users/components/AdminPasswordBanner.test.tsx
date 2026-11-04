import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SessionContextValue } from "next-auth/react";
import { describe, expect, it, vi } from "vitest";

import AdminPasswordBanner from "./AdminPasswordBanner";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@calcom/ui/components/top-banner", () => ({
  TopBanner: ({ text, actions }: { text: string; actions?: ReactNode }) => (
    <div>
      <span>{text}</span>
      {actions}
    </div>
  ),
}));

function buildSession(
  overrides?: Partial<NonNullable<SessionContextValue["data"]>>
): NonNullable<SessionContextValue["data"]> {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    hasValidLicense: true,
    upId: "usr_test",
    profileId: 1,
    user: {
      id: 1,
      uuid: "uuid_test",
      email: "test@example.com",
      name: "Test User",
      username: "testuser",
      role: "INACTIVE_ADMIN",
      inactiveAdminReason: "both",
    },
    ...overrides,
  };
}

describe("AdminPasswordBanner", () => {
  it("does not render for non-INACTIVE_ADMIN users", () => {
    const data = buildSession({ user: { ...buildSession().user, role: "USER" } });
    const { container } = render(<AdminPasswordBanner data={data} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 2FA-only message and links to 2FA settings", () => {
    const data = buildSession({ user: { ...buildSession().user, inactiveAdminReason: "2fa" } });

    render(<AdminPasswordBanner data={data} />);

    expect(screen.getByText("invalid_admin_password_2fa_only")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/settings/security/two-factor-auth");
    expect(link).toHaveTextContent("enable_2fa");
  });

  it("renders password-only message and links to password settings", () => {
    const data = buildSession({ user: { ...buildSession().user, inactiveAdminReason: "password" } });

    render(<AdminPasswordBanner data={data} />);

    expect(screen.getByText("invalid_admin_password_password_only")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/settings/security/password");
    expect(link).toHaveTextContent("change_password_admin");
  });

  it("defaults to both message and password settings when reason is missing", () => {
    const data = buildSession({ user: { ...buildSession().user, inactiveAdminReason: undefined } });

    render(<AdminPasswordBanner data={data} />);

    expect(screen.getByText("invalid_admin_password_requirements")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/settings/security/password");
    expect(link).toHaveTextContent("change_password_admin");
  });
});

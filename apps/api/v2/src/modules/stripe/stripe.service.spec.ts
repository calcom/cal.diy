/**
 * The repositories and workspace packages StripeService imports pull in Prisma and the database, which
 * the unit-test environment cannot resolve. They are mocked here since only createStripeCustomerId is
 * under test.
 */
jest.mock("@/modules/apps/apps.repository", () => ({ AppsRepository: class {} }));
jest.mock("@/modules/credentials/credentials.repository", () => ({ CredentialsRepository: class {} }));
jest.mock("@/modules/memberships/memberships.repository", () => ({ MembershipsRepository: class {} }));
jest.mock("@/modules/users/users.repository", () => ({ UsersRepository: class {} }));
jest.mock("@/modules/stripe/utils/newStripeInstance", () => ({ stripeInstance: jest.fn() }));
jest.mock("@calcom/platform-constants", () => ({ SUCCESS_STATUS: "success" }), { virtual: true });

import { ConfigService } from "@nestjs/config";
import { StripeService } from "./stripe.service";

describe("StripeService.createStripeCustomerId", () => {
  const user = { email: "user@example.com", name: "User", metadata: { existing: true } };

  let customersList: jest.Mock;
  let customersCreate: jest.Mock;
  let updateByEmail: jest.Mock;
  let service: StripeService;

  beforeEach(() => {
    customersList = jest.fn();
    customersCreate = jest.fn();
    updateByEmail = jest.fn().mockResolvedValue(undefined);

    const config = { get: jest.fn() } as unknown as ConfigService;
    service = new StripeService(
      config,
      config,
      {} as never,
      {} as never,
      {} as never,
      { updateByEmail } as never
    );
    jest
      .spyOn(service, "getStripe")
      .mockReturnValue({ customers: { list: customersList, create: customersCreate } } as never);
  });

  it("reuses the customer Stripe already has for the email", async () => {
    customersList.mockResolvedValue({ data: [{ id: "cus_existing" }] });

    await expect(service.createStripeCustomerId(user)).resolves.toBe("cus_existing");

    expect(customersCreate).not.toHaveBeenCalled();
    expect(updateByEmail).toHaveBeenCalledWith(user.email, {
      metadata: { existing: true, stripeCustomerId: "cus_existing" },
    });
  });

  it("creates a customer when Stripe has none for the email", async () => {
    customersList.mockResolvedValue({ data: [] });
    customersCreate.mockResolvedValue({ id: "cus_new" });

    await expect(service.createStripeCustomerId(user)).resolves.toBe("cus_new");

    expect(customersCreate).toHaveBeenCalledWith({ email: user.email });
    expect(updateByEmail).toHaveBeenCalledWith(user.email, {
      metadata: { existing: true, stripeCustomerId: "cus_new" },
    });
  });

  it("propagates a failed lookup instead of creating a possibly duplicate customer", async () => {
    customersList.mockRejectedValue(new Error("Invalid API Key provided"));

    await expect(service.createStripeCustomerId(user)).rejects.toThrow("Invalid API Key provided");

    expect(customersCreate).not.toHaveBeenCalled();
    expect(updateByEmail).not.toHaveBeenCalled();
  });
});

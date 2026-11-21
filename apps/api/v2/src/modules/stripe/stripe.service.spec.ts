import { ConfigService } from "@nestjs/config";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type Stripe from "stripe";
import { StripeService } from "./stripe.service";
import { AppsRepository } from "@/modules/apps/apps.repository";
import { CredentialsRepository } from "@/modules/credentials/credentials.repository";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { UsersRepository } from "@/modules/users/users.repository";

describe("StripeService - createStripeCustomerId", () => {
  let service: StripeService;
  let usersRepository: { updateByEmail: jest.Mock };
  let mockStripeCustomersList: jest.Mock;
  let mockStripeCustomersCreate: jest.Mock;

  const mockUser = {
    email: "organizer@example.com",
    name: "Organizer",
    metadata: { existingMetaKey: "value" },
  };

  beforeEach(async () => {
    usersRepository = {
      updateByEmail: jest.fn().mockResolvedValue({}),
    };

    mockStripeCustomersList = jest.fn();
    mockStripeCustomersCreate = jest.fn();

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "stripe.apiKey") return "sk_test_fake_key";
        if (key === "api.url") return "https://api.example.com";
        if (key === "app.baseUrl") return "https://app.example.com";
        return "test-val";
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AppsRepository, useValue: {} },
        { provide: CredentialsRepository, useValue: {} },
        { provide: MembershipsRepository, useValue: {} },
        { provide: UsersRepository, useValue: usersRepository },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);

    const mockStripeInstance = {
      customers: {
        list: mockStripeCustomersList,
        create: mockStripeCustomersCreate,
      },
    } as unknown as Stripe;

    jest.spyOn(service, "getStripe").mockReturnValue(mockStripeInstance);
  });

  it("should reuse existing customer ID when Stripe returns an existing customer", async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [{ id: "cus_existing123" }],
    });

    const result = await service.createStripeCustomerId(mockUser);

    expect(mockStripeCustomersList).toHaveBeenCalledTimes(1);
    expect(mockStripeCustomersList).toHaveBeenCalledWith({
      email: mockUser.email,
      limit: 1,
    });
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
    expect(usersRepository.updateByEmail).toHaveBeenCalledWith(mockUser.email, {
      metadata: {
        existingMetaKey: "value",
        stripeCustomerId: "cus_existing123",
      },
    });
    expect(result).toBe("cus_existing123");
  });

  it("should create a new customer in Stripe when customer list is empty", async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [],
    });
    mockStripeCustomersCreate.mockResolvedValue({
      id: "cus_new456",
    });

    const result = await service.createStripeCustomerId(mockUser);

    expect(mockStripeCustomersList).toHaveBeenCalledTimes(1);
    expect(mockStripeCustomersCreate).toHaveBeenCalledTimes(1);
    expect(mockStripeCustomersCreate).toHaveBeenCalledWith({
      email: mockUser.email,
    });
    expect(usersRepository.updateByEmail).toHaveBeenCalledWith(mockUser.email, {
      metadata: {
        existingMetaKey: "value",
        stripeCustomerId: "cus_new456",
      },
    });
    expect(result).toBe("cus_new456");
  });

  it("should propagate errors from stripe.customers.list without attempting to create a customer", async () => {
    const stripeApiError = new Error("Stripe rate limit exceeded");
    mockStripeCustomersList.mockRejectedValue(stripeApiError);

    await expect(service.createStripeCustomerId(mockUser)).rejects.toThrow("Stripe rate limit exceeded");

    expect(mockStripeCustomersList).toHaveBeenCalledTimes(1);
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
    expect(usersRepository.updateByEmail).not.toHaveBeenCalled();
  });

  it("should propagate errors from stripe.customers.create when creation fails", async () => {
    mockStripeCustomersList.mockResolvedValue({
      data: [],
    });
    const stripeCreationError = new Error("Stripe authentication failure");
    mockStripeCustomersCreate.mockRejectedValue(stripeCreationError);

    await expect(service.createStripeCustomerId(mockUser)).rejects.toThrow("Stripe authentication failure");

    expect(mockStripeCustomersList).toHaveBeenCalledTimes(1);
    expect(mockStripeCustomersCreate).toHaveBeenCalledTimes(1);
    expect(usersRepository.updateByEmail).not.toHaveBeenCalled();
  });
});

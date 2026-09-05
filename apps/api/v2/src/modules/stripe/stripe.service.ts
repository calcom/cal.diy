import { AppConfig } from "@/config/type";
import { AppsRepository } from "@/modules/apps/apps.repository";
import { CredentialsRepository } from "@/modules/credentials/credentials.repository";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { stripeInstance } from "@/modules/stripe/utils/newStripeInstance";
import { StripeData } from "@/modules/stripe/utils/stripeDataSchemas";
import { UsersRepository } from "@/modules/users/users.repository";
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { z } from "zod";

import { SUCCESS_STATUS } from "@calcom/platform-constants";
import type { Prisma, Credential, User } from "@calcom/prisma/client";

import { stripeKeysResponseSchema } from "./utils/stripeDataSchemas";

import stringify = require("qs-stringify");

export type OAuthCallbackState = {
  accessToken: string;
  teamId?: string;
  orgId?: string;
  fromApp?: boolean;
  returnTo?: string;
  onErrorReturnTo?: string;
};

@Injectable()
export class StripeService {
  private stripe: Stripe;
  private redirectUri = `${this.config.get("api.url")}/stripe/save`;
  private webAppUrl = this.config.get("app.baseUrl");
  private environment = this.config.get("env.type");
  private teamMonthlyPriceId = this.config.get("stripe.teamMonthlyPriceId");

  constructor(
    configService: ConfigService<AppConfig>,
    private readonly config: ConfigService,
    private readonly appsRepository: AppsRepository,
    private readonly credentialsRepository: CredentialsRepository,
    private readonly membershipRepository: MembershipsRepository,
    private readonly usersRepository: UsersRepository
  ) {
    this.stripe = new Stripe(configService.get("stripe.apiKey", { infer: true }) ?? "", {
      apiVersion: "2020-08-27",
    });
  }

  getStripe() {
    return this.stripe;
  }

  async getStripeRedirectUrl(state: OAuthCallbackState, userEmail?: string, userName?: string | null) {
    const { client_id } = await this.getStripeAppKeys();

    const stripeConnectParams: Stripe.OAuthAuthorizeUrlParams = {
      client_id,
      scope: "read_write",
      response_type: "code",
      stripe_user: {
        email: userEmail,
        first_name: userName || undefined,
        /** We need this so E2E don't fail for international users */
        country: process.env.NEXT_PUBLIC_IS_E2E ? "US" : undefined,
      },
      redirect_uri: this.redirectUri,
      state: JSON.stringify(state),
    };

    const params = z.record(z.any()).parse(stripeConnectParams);
    const query = stringify(params);
    const url = `https://connect.stripe.com/oauth/authorize?${query}`;

    return url;
  }

  async getStripeAppKeys() {
    const app = await this.appsRepository.getAppBySlug("stripe");

    const { client_id, client_secret } = stripeKeysResponseSchema.parse(app?.keys);

    if (!client_id) {
      throw new NotFoundException("Stripe app not found");
    }

    if (!client_secret) {
      throw new NotFoundException("Stripe app not found");
    }

    return { client_id, client_secret };
  }

  async saveStripeAccount(state: OAuthCallbackState, code: string, userId: number): Promise<{ url: string }> {
    if (!userId) {
      throw new UnauthorizedException("Invalid Access token.");
    }

    const response = await stripeInstance.oauth.token({
      grant_type: "authorization_code",
      code: code?.toString(),
    });

    const data: StripeData = { ...response, default_currency: "" };
    if (response["stripe_user_id"]) {
      const account = await stripeInstance.accounts.retrieve(response["stripe_user_id"]);
      data["default_currency"] = account.default_currency;
    }

    const existingCredentials = await this.credentialsRepository.findAllCredentialsByTypeAndUserId(
      "stripe_payment",
      userId
    );

    const credentialIdsToDelete = existingCredentials.map((item: Credential) => item.id);
    if (credentialIdsToDelete.length > 0) {
      await this.appsRepository.deleteAppCredentials(credentialIdsToDelete, userId);
    }

    await this.appsRepository.createAppCredential(
      "stripe_payment",
      data as unknown as Prisma.InputJsonObject,
      userId,
      "stripe"
    );

    return { url: state.returnTo ?? "" };
  }

  async checkIfIndividualStripeAccountConnected(userId: number): Promise<{ status: typeof SUCCESS_STATUS }> {
    const stripeCredentials = await this.credentialsRepository.findCredentialByTypeAndUserId(
      "stripe_payment",
      userId
    );

    return await this.validateStripeCredentials(stripeCredentials);
  }

  async validateStripeCredentials(
    credentials?: Credential | null
  ): Promise<{ status: typeof SUCCESS_STATUS }> {
    if (!credentials) {
      throw new NotFoundException("Credentials for stripe not found.");
    }

    if (credentials.invalid) {
      throw new BadRequestException("Invalid stripe credentials.");
    }

    const stripeKey = JSON.stringify(credentials.key);
    const stripeKeyObject = JSON.parse(stripeKey);

    const stripeAccount = await stripeInstance.accounts.retrieve(stripeKeyObject?.stripe_user_id);

    // both of these should be true for an account to be fully active
    if (!stripeAccount.payouts_enabled || !stripeAccount.charges_enabled) {
      throw new BadRequestException("Stripe account is not an active account");
    }

    return {
      status: SUCCESS_STATUS,
    };
  }

  async generateTeamCheckoutSession(pendingPaymentTeamId: number, ownerId: number) {
    const stripe = this.getStripe();
    const customer = await this.getStripeCustomerIdFromUserId(ownerId);

    if (!customer) {
      throw new BadRequestException("Failed to create a customer on Stripe.");
    }

    const session = await stripe.checkout.sessions.create({
      customer,
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${this.webAppUrl}/api/teams/api/create?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.webAppUrl}/settings/my-account/profile`,
      line_items: [
        {
          /** We only need to set the base price and we can upsell it directly on Stripe's checkout  */
          price: this.teamMonthlyPriceId,
          /**Initially it will be just the team owner */
          quantity: 1,
        },
      ],
      customer_update: {
        address: "auto",
      },
      // Disabled when testing locally as usually developer doesn't setup Tax in Stripe Test mode
      automatic_tax: {
        enabled: this.environment === "production",
      },
      metadata: {
        pendingPaymentTeamId,
        ownerId,
        dubCustomerId: ownerId, // pass the userId during checkout creation for sales conversion tracking: https://d.to/conversions/stripe
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException({
        message: "Failed generating a Stripe checkout session URL.",
      });
    }

    return session;
  }

  async getStripeCustomerIdFromUserId(userId: number) {
    const user = await this.usersRepository.findById(userId);

    if (!user?.email) return null;
    const customerId = await this.getStripeCustomerId(user);
    if (!customerId) {
      return this.createStripeCustomerId(user);
    }

    return customerId;
  }

  async getStripeCustomerId(user: Pick<User, "email" | "name" | "metadata">) {
    if (user?.metadata && typeof user.metadata === "object" && "stripeCustomerId" in user.metadata) {
      return (user?.metadata as Prisma.JsonObject).stripeCustomerId as string;
    }
    return null;
  }

  async createStripeCustomerId(user: Pick<User, "email" | "name" | "metadata">) {
    let customerId: string;
    let customersResponse: Stripe.ApiList<Stripe.Customer>;

    const stripe = this.getStripe();
    try {
      customersResponse = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException({
        message: "Failed to create Stripe customer.",
      });
    }

    if (customersResponse.data[0] && customersResponse.data[0].id) {
      customerId = customersResponse.data[0].id;
    } else {
      try {
      const customer = await stripe.customers.create(
        { email: user.email },
        { idempotencyKey: `stripe-customer-${user.email.toLowerCase()}` }
      );
        customerId = customer.id;
      } catch (error) {
        console.error(error);
        throw new InternalServerErrorException({
          message: "Failed to create Stripe customer.",
        });
      }
    }

    await this.usersRepository.updateByEmail(user.email, {
      metadata: {
        ...(user.metadata as Prisma.JsonObject),
        stripeCustomerId: customerId,
      },
    });

    return customerId;
  }

  async getSubscription(subscriptionId: string) {
    return await this.stripe.subscriptions.retrieve(subscriptionId);
  }
}

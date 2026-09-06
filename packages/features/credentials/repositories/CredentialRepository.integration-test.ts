import { prisma } from "@calcom/prisma";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CredentialRepository } from "./CredentialRepository";

const repository = new CredentialRepository(prisma);

describe("CredentialRepository.findPaymentAppCredentials (integration)", () => {
  let userId: number;
  let hasUser = false;
  let secondaryPaymentCredentialId: number;
  const appSlugs: string[] = [];

  beforeEach(async () => {
    const id = crypto.randomUUID();
    const user = await prisma.user.create({
      data: { email: `payment-credential-${id}@test.cal.com`, username: `payment-credential-${id}` },
      select: { id: true },
    });
    userId = user.id;
    hasUser = true;

    const paymentAppSlug = `payment-app-${id}`;
    const calendarAppSlug = `calendar-app-${id}`;
    appSlugs.push(paymentAppSlug, calendarAppSlug);
    await prisma.app.createMany({
      data: [
        { slug: paymentAppSlug, dirName: `payment-dir-${id}`, categories: ["payment"] },
        { slug: calendarAppSlug, dirName: `calendar-dir-${id}`, categories: ["calendar"] },
      ],
    });
    const [, secondaryPaymentCredential] = await Promise.all([
      prisma.credential.create({
        data: { type: "payment", key: { account: "primary" }, userId, appId: paymentAppSlug },
      }),
      prisma.credential.create({
        data: { type: "payment", key: { account: "secondary" }, userId, appId: paymentAppSlug },
        select: { id: true },
      }),
      prisma.credential.create({
        data: { type: "calendar", key: { account: "calendar" }, userId, appId: calendarAppSlug },
      }),
    ]);
    secondaryPaymentCredentialId = secondaryPaymentCredential.id;
  });

  afterEach(async () => {
    if (hasUser) await prisma.user.delete({ where: { id: userId } });
    hasUser = false;
    await prisma.app.deleteMany({ where: { slug: { in: appSlugs.splice(0) } } });
  });

  it("excludes non-payment apps and honors an explicitly selected payment credential", async () => {
    const paymentCredentials = await repository.findPaymentAppCredentials({ userId });
    expect(paymentCredentials).toHaveLength(2);
    expect(paymentCredentials.map((credential) => credential.key)).toEqual(
      expect.arrayContaining([{ account: "primary" }, { account: "secondary" }])
    );

    await expect(
      repository.findPaymentAppCredentials({ credentialId: secondaryPaymentCredentialId, userId })
    ).resolves.toEqual([expect.objectContaining({ key: { account: "secondary" } })]);
  });

  it("prevents IDOR: returns empty array when fetching another user's credentialId", async () => {
  const userB = await prisma.user.create({
    data: { 
      email: `user-b-${crypto.randomUUID()}@test.cal.com`, 
      username: `user-b-${crypto.randomUUID()}` 
    },
    select: { id: true },
  });

  try {
    const crossUserCredentials = await repository.findPaymentAppCredentials({
      credentialId: secondaryPaymentCredentialId,
      userId: userB.id,
    });

    expect(crossUserCredentials).toEqual([]);
  } finally {
    await prisma.user.delete({ where: { id: userB.id } });
  }
});
});

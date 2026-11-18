import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkOnboardingRedirect } from "@calcom/features/auth/lib/onboardingUtils";
import { UserPermissionRole } from "@calcom/prisma/enums";
import HomePageAuthActions from "@calcom/web/modules/auth/HomePageAuthActions";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { getPublicEventCatalog } from "app/_lib/getPublicEventCatalog";
import { getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const EventDescription = ({ description }: { description: string | null }): JSX.Element | null => {
  if (!description) return null;

  return <p className="mt-2">{description}</p>;
};

const HomePage = async (): Promise<JSX.Element> => {
  const session = await getServerSession({
    req: buildLegacyRequest(await headers(), await cookies()),
  });

  if (session?.user?.id) {
    const onboardingPath = await checkOnboardingRedirect(session.user.id, {
      checkEmailVerification: true,
      organizationId: session.user.profile?.organizationId ?? null,
    });

    if (onboardingPath) {
      redirect(onboardingPath);
    }

    if (session.user.role === UserPermissionRole.ADMIN) {
      redirect("/event-types");
    }
  }

  const [eventTypes, t] = await Promise.all([getPublicEventCatalog(), getTranslate()]);
  const getCatalogContent = (): JSX.Element => {
    if (eventTypes.length === 0) {
      return <p>{t("public_event_catalog_empty")}</p>;
    }

    return (
      <ul className="space-y-4">
        {eventTypes.map((eventType) => (
          <li key={eventType.href} className="rounded-lg border border-subtle p-4">
            <a className="font-medium text-emphasis text-lg underline" href={eventType.href}>
              {eventType.title}
            </a>
            <EventDescription description={eventType.description} />
            <p className="mt-2 text-sm text-subtle">
              {t("public_event_catalog_host", { host: eventType.host })}
            </p>
            <p className="mt-2 text-sm text-subtle">
              {t("public_event_catalog_duration", { duration: eventType.length })}
            </p>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-semibold text-3xl text-emphasis">{t("public_event_catalog_title")}</h1>
        <div className="flex items-center gap-3">
          {session?.user?.id && <span className="text-sm text-subtle">{session.user.name}</span>}
          <HomePageAuthActions
            isAuthenticated={Boolean(session?.user?.id)}
            signInLabel={t("sign_in")}
            signOutLabel={t("sign_out")}
          />
        </div>
      </header>
      {getCatalogContent()}
    </main>
  );
};

export default HomePage;

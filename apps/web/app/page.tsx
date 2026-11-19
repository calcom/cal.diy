import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkOnboardingRedirect } from "@calcom/features/auth/lib/onboardingUtils";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { getPublicEventCatalog } from "app/_lib/getPublicEventCatalog";
import { getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import EventCatalog from "./(werko)/_components/EventCatalog";
import PortalFooter from "./(werko)/_components/PortalFooter";
import PortalHeaderView from "./(werko)/_components/PortalHeaderView";
import { archivo, archivoNarrow } from "./(werko)/_lib/fonts";

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
  const signedIn = Boolean(session?.user?.id);

  return (
    <div
      className={`${archivo.variable} ${archivoNarrow.variable} flex min-h-screen flex-col bg-deep-blue font-werko text-s text-white antialiased`}>
      <PortalHeaderView user={session?.user} />
      <EventCatalog
        title={t("public_event_catalog_title")}
        action={
          signedIn
            ? { href: `/api/authentik-logout?callbackUrl=${encodeURIComponent("/")}`, label: t("sign_out") }
            : { href: "/auth/login", label: t("sign_in") }
        }
        emptyText={t("public_event_catalog_empty")}
        bookLabel={t("book_now")}
        items={eventTypes.map((eventType) => ({
          href: eventType.href,
          title: eventType.title,
          description: eventType.description,
          hostLabel: t("public_event_catalog_host", { host: eventType.host }),
          durationLabel: t("public_event_catalog_duration", { duration: eventType.length }),
        }))}
      />
      <PortalFooter />
    </div>
  );
};

export default HomePage;

import { FeatureProvider } from "@calcom/features/flags/context/provider";
import { useFlags } from "@calcom/web/modules/feature-flags/hooks/useFlags";
import type { PageWrapperProps } from "@components/PageWrapperAppDir";
import useIsBookingPage from "@lib/hooks/useIsBookingPage";
import useIsThemeSupported from "@lib/hooks/useIsThemeSupported";
import { useNuqsParams } from "@lib/hooks/useNuqsParams";
import type { WithLocaleProps } from "@lib/withLocale";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import type { AppProps as NextAppProps } from "next/app";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useEffect, useState } from "react";
import { getThemeProviderProps } from "./getThemeProviderProps";

// Workaround for https://github.com/vercel/next.js/issues/8592
export type AppProps = Omit<
  NextAppProps<
    WithLocaleProps<{
      nonce: string | undefined;
      themeBasis?: string;
      session: Session;
    }>
  >,
  "Component"
> & {
  Component: NextAppProps["Component"] & {
    requiresLicense?: boolean;
    isBookingPage?: boolean | ((arg: { router: NextAppProps["router"] }) => boolean);
    PageWrapper?: (props: AppProps) => JSX.Element;
  };

  /** Will be defined only is there was an error */
  err?: Error;
};

const getEmbedNamespace = (searchParams: ReadonlyURLSearchParams) => {
  // Mostly embed query param should be available on server. Use that there.
  // Use the most reliable detection on client
  return typeof window !== "undefined" ? window.getEmbedNamespace() : (searchParams.get("embed") ?? null);
};

type CalcomThemeProps = Readonly<{
  isBookingPage: boolean;
  nonce: string | undefined;
  children: React.ReactNode;
  isThemeSupported: boolean;
}>;

const CalcomThemeProvider = (props: CalcomThemeProps) => {
  // Use namespace of embed to ensure same namespaced embed are displayed with same theme. This allows different embeds on the same website to be themed differently
  // One such example is our Embeds Demo and Testing page at http://localhost:3100
  // Having `getEmbedNamespace` defined on window before react initializes the app, ensures that embedNamespace is available on the first mount and can be used as part of storageKey
  const searchParams = useSearchParams();
  const embedNamespace = searchParams ? getEmbedNamespace(searchParams) : null;
  const isEmbedMode = typeof embedNamespace === "string";
  const [shouldApplyColorScheme, setShouldApplyColorScheme] = useState(false);
  const pathname = usePathname();
  const { key, ...themeProviderProps } = getThemeProviderProps({
    props,
    isEmbedMode,
    embedNamespace,
    pathname,
    searchParams,
  });

  useEffect(() => {
    setShouldApplyColorScheme(!isEmbedMode);
  }, [isEmbedMode]);

  return (
    <ThemeProvider key={key} {...themeProviderProps}>
      {/* Embed Mode can be detected reliably only on client side here as there can be static generated pages as well which can't determine if it's embed mode at backend */}
      {/* color-scheme makes background:transparent not work in iframe which is required by embed. */}
      {shouldApplyColorScheme && (
        //eslint-disable-next-line react/no-unknown-property
        <style jsx global>
          {`
            .dark {
              color-scheme: dark;
            }
          `}
        </style>
      )}
      {props.children}
    </ThemeProvider>
  );
};

function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const flags = useFlags();
  return <FeatureProvider value={flags}>{children}</FeatureProvider>;
}

function OrgBrandProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const AppProviders = (props: PageWrapperProps) => {
  // No need to have intercom on public pages - Good for Page Performance
  const isBookingPage = useIsBookingPage();
  const isThemeSupported = useIsThemeSupported();
  const nuqsParams = useNuqsParams();

  const RemainingProviders = (
    <>
      <TooltipProvider>
        {/* color-scheme makes background:transparent not work which is required by embed. We need to ensure next-theme adds color-scheme to `body` instead of `html`(https://github.com/pacocoursey/next-themes/blob/main/src/index.tsx#L74). Once that's done we can enable color-scheme support */}
        <CalcomThemeProvider
          nonce={props.nonce}
          isThemeSupported={isThemeSupported}
          isBookingPage={props.isBookingPage || isBookingPage}>
          <NuqsAdapter {...nuqsParams}>
            <FeatureFlagsProvider>
              <OrgBrandProvider>{props.children}</OrgBrandProvider>
            </FeatureFlagsProvider>
          </NuqsAdapter>
        </CalcomThemeProvider>
      </TooltipProvider>
    </>
  );

  if (props.isBookingPage || isBookingPage) {
    return RemainingProviders;
  }

  return RemainingProviders;
};

export default AppProviders;

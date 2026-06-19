import AdminPasswordBanner, {
  type AdminPasswordBannerProps,
} from "@calcom/web/modules/users/components/AdminPasswordBanner";
import CalendarCredentialBanner, {
  type CalendarCredentialBannerProps,
} from "@calcom/web/modules/users/components/CalendarCredentialBanner";
import ImpersonationBanner, {
  type ImpersonationBannerProps,
} from "@calcom/web/modules/users/components/ImpersonationBanner";
import {
  InvalidAppCredentialBanners,
  type InvalidAppCredentialBannersProps,
} from "@calcom/web/modules/users/components/InvalidAppCredentialsBanner";
import VerifyEmailBanner, {
  type VerifyEmailBannerProps,
} from "@calcom/web/modules/users/components/VerifyEmailBanner";

type BannerTypeProps = {
  verifyEmailBanner: VerifyEmailBannerProps;
  adminPasswordBanner: AdminPasswordBannerProps;
  impersonationBanner: ImpersonationBannerProps;
  calendarCredentialBanner: CalendarCredentialBannerProps;
  invalidAppCredentialBanners: InvalidAppCredentialBannersProps;
};

type BannerType = keyof BannerTypeProps;

type BannerComponent = {
  [Key in BannerType]: (props: BannerTypeProps[Key]) => JSX.Element;
};

export type AllBannerProps = { [Key in BannerType]: BannerTypeProps[Key]["data"] };

export const BannerComponent: BannerComponent = {
  verifyEmailBanner: (props: VerifyEmailBannerProps) => <VerifyEmailBanner {...props} />,
  adminPasswordBanner: (props: AdminPasswordBannerProps) => <AdminPasswordBanner {...props} />,
  impersonationBanner: (props: ImpersonationBannerProps) => <ImpersonationBanner {...props} />,
  calendarCredentialBanner: (props: CalendarCredentialBannerProps) => <CalendarCredentialBanner {...props} />,
  invalidAppCredentialBanners: (props: InvalidAppCredentialBannersProps) => (
    <InvalidAppCredentialBanners {...props} />
  ),
};

interface BannerContainerProps {
  banners: AllBannerProps;
}

export const BannerContainer: React.FC<BannerContainerProps> = ({ banners }) => {
  return (
    <div className="sticky top-0 z-10 w-full divide-y divide-black">
      {Object.keys(banners).map((key) => {
        if (key === "verifyEmailBanner") {
          const Banner = BannerComponent[key];
          return <Banner data={banners[key]} key={key} />;
        } else if (key === "adminPasswordBanner") {
          const Banner = BannerComponent[key];
          return <Banner data={banners[key]} key={key} />;
        } else if (key === "impersonationBanner") {
          const Banner = BannerComponent[key];
          return <Banner data={banners[key]} key={key} />;
        } else if (key === "calendarCredentialBanner") {
          const Banner = BannerComponent[key];
          return <Banner data={banners[key]} key={key} />;
        } else if (key === "invalidAppCredentialBanners") {
          const Banner = BannerComponent[key];
          return <Banner data={banners[key]} key={key} />;
        }
      })}
    </div>
  );
};

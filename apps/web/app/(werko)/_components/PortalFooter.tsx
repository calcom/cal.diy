import Logo from "@devx-agency/werko-ui/components/Logo";
import TextLink from "@devx-agency/werko-ui/components/TextLink";
import { copy } from "../_lib/copy";
import { werkoWebPath } from "../_lib/werko";

export default function PortalFooter() {
  return (
    <footer className="mt-auto px-6 pt-16 pb-10 md:px-8 lg:px-28">
      <div className="container-page flex flex-col gap-8">
        <Logo className="h-14 w-auto self-start lg:h-16" />
        <p className="headline-4 max-w-138">{copy.footer.claim}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <span className="text-s">© {new Date().getFullYear()} Werk|0</span>
          <TextLink href={werkoWebPath("/obchodni-podminky")}>{copy.footer.terms}</TextLink>
          <TextLink href={werkoWebPath("/ochrana-osobnich-udaju")}>{copy.footer.privacy}</TextLink>
          <TextLink href={werkoWebPath("/zasady-cookies")}>{copy.footer.cookies}</TextLink>
        </div>
      </div>
    </footer>
  );
}

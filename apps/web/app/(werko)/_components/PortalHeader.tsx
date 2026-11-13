import Button from "@devx-agency/werko-ui/components/Button";
import Logo from "@devx-agency/werko-ui/components/Logo";
import { FOCUS_RING } from "@devx-agency/werko-ui/styles";
import { copy } from "../_lib/copy";
import { WERKO_WEB_URL, werkoWebPath } from "../_lib/werko";

const NAV = [
  { href: werkoWebPath("/prostory/cowork"), label: copy.nav.spaces },
  { href: werkoWebPath("/spoluprace"), label: copy.nav.cooperation },
  { href: werkoWebPath("#aktuality"), label: copy.nav.news },
  { href: werkoWebPath("/kontakt"), label: copy.nav.contact },
];

/** Same header as the Werk|0 website; navigation leads back to the web */
export default function PortalHeader() {
  return (
    <header className="bg-deep-blue px-6 py-4 md:px-8 lg:px-14 lg:py-6">
      <div className="container-page flex items-center justify-between gap-6">
        <a href={`${WERKO_WEB_URL}/cs`} className={FOCUS_RING}>
          <Logo className="h-12 w-auto lg:h-16" />
        </a>
        <nav className="flex items-center gap-8">
          <ul className="hidden items-center gap-8 lg:flex">
            {NAV.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  className={`font-semibold text-s transition-colors hover:text-neon-green-bold ${FOCUS_RING}`}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <Button href="/rezervace">{copy.nav.reserve}</Button>
        </nav>
      </div>
    </header>
  );
}

import Button from "@devx-agency/werko-ui/components/Button";
import ArrowRightIcon from "@devx-agency/werko-ui/icons/ArrowRightIcon";
import { FOCUS_RING } from "@devx-agency/werko-ui/styles";

type EventCatalogItem = {
  href: string;
  title: string;
  description: string | null;
  hostLabel: string;
  durationLabel: string;
};

type EventCatalogProps = {
  title: string;
  action: { href: string; label: string };
  emptyText: string;
  bookLabel: string;
  items: EventCatalogItem[];
};

/** Werk|0 look of Cal.diy's public event catalog; the data and links come from the catalog unchanged */
export default function EventCatalog({ title, action, emptyText, bookLabel, items }: EventCatalogProps) {
  return (
    <main className="px-6 pt-8 pb-16 md:px-8 lg:px-28 lg:pt-12 lg:pb-24">
      <div className="container-page flex flex-col gap-10 lg:gap-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="headline-hero">{title}</h1>
          <Button href={action.href}>{action.label}</Button>
        </div>

        {items.length === 0 ? (
          <p className="text-s">{emptyText}</p>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {items.map(({ href, title: itemTitle, description, hostLabel, durationLabel }) => {
              return (
                <li
                  key={href}
                  className="group relative flex flex-col border-2 border-transparent bg-deep-blue-green transition-colors duration-150 hover:border-neon-green has-focus-visible:border-neon-green">
                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <a
                      href={href}
                      className={`headline-4 transition-colors after:absolute after:inset-0 group-hover:text-neon-green ${FOCUS_RING}`}>
                      {itemTitle}
                    </a>
                    {description && <p className="flex-1 text-s">{description}</p>}
                    <div className="flex flex-col gap-1 text-werko-xs text-white/70">
                      <p>{hostLabel}</p>
                      <p>{durationLabel}</p>
                    </div>
                    <span
                      aria-hidden
                      className="flex items-center gap-2 font-semibold text-neon-green text-s">
                      {bookLabel}
                      <ArrowRightIcon className="size-4 transition-transform duration-150 group-hover:translate-x-1" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

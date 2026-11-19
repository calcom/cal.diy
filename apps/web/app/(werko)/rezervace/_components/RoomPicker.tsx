"use client";

import Breadcrumbs from "@devx-agency/werko-ui/components/Breadcrumbs";
import Button from "@devx-agency/werko-ui/components/Button";
import SpaceCard from "@devx-agency/werko-ui/components/SpaceCard";
import Image from "next/image";
import { Suspense, useState } from "react";
import BookingStepper from "../../_components/BookingStepper";
import { copy } from "../../_lib/copy";
import { roomPath, WERKO_WEB_URL } from "../../_lib/werko";

type RoomPickerProps = {
  spaces: { username: string; name: string; description: string; image?: string }[];
};

export default function RoomPicker({ spaces }: RoomPickerProps) {
  const [selected, setSelected] = useState<string>();

  return (
    <main className="px-6 pt-8 pb-16 md:px-8 lg:px-28 lg:pt-12 lg:pb-24">
      <div className="container-page flex flex-col gap-10 lg:gap-14">
        <div className="flex flex-col gap-6">
          <Breadcrumbs
            items={[{ label: copy.nav.home, href: `${WERKO_WEB_URL}/cs` }, { label: copy.page.title }]}
          />
          <h1 className="headline-hero">{copy.page.title}</h1>
          <p className="text-s">{copy.page.text}</p>
        </div>

        <Suspense>
          <BookingStepper />
        </Suspense>

        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="headline-2">{copy.space.title}</h2>
            <p className="text-s">{copy.space.text}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {spaces.map(({ username, name, description, image }) => (
              <SpaceCard
                key={username}
                name="space"
                value={username}
                checked={username === selected}
                onChange={() => setSelected(username)}
                title={name}
                description={description}
                selectLabel={copy.space.select}
                selectedLabel={copy.space.selected}
                image={
                  image ? (
                    <Image
                      src={image}
                      alt=""
                      fill
                      unoptimized={!image.startsWith("/")}
                      sizes="(min-width: 1024px) 25vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 bg-white/10" />
                  )
                }
              />
            ))}
          </div>
          <div className="flex flex-col gap-6 border-white/10 border-t pt-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-s">{copy.space.note}</p>
              <Button href={selected ? roomPath(selected) : undefined} disabled={!selected}>
                {copy.space.continue}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

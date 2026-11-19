"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import BookingStepper from "./BookingStepper";

type WerkoFrameProps = {
  header: ReactNode;
  footer: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function WerkoFrame({ header, footer, className, children }: WerkoFrameProps) {
  const pathname = usePathname();
  if (pathname?.endsWith("/embed")) return <>{children}</>;

  return (
    <div className={`flex min-h-screen flex-col bg-deep-blue font-werko text-white ${className ?? ""}`}>
      {header}
      <Suspense>
        <div className="px-6 md:px-8 lg:px-14">
          <BookingStepper className="container-page pt-6" />
        </div>
      </Suspense>
      <div data-werko-content className="flex flex-1 flex-col justify-center">
        {children}
      </div>
      {footer}
    </div>
  );
}

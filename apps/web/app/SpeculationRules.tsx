import Script from "next/script";

export function SpeculationRules({
  prerenderPathsOnHover = [],
}: {
  prerenderPathsOnHover?: string[];
}) {
  const speculationRules = {
    prerender: [
      {
        urls: prerenderPathsOnHover,
        eagerness: "moderate",
      },
    ],
  };

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Speculation rules require inline script
    <Script
      dangerouslySetInnerHTML={{
        __html: `${JSON.stringify(speculationRules)}`,
      }}
      type="speculationrules"
      id="speculation-rules"
    />
  );
}

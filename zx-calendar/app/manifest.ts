import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Z × XOE Calendar",
    short_name: "Z × XOE",
    description: "Z's schedule and team booking.",
    start_url: "/team",
    display: "standalone",
    background_color: "#04071A",
    theme_color: "#04071A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

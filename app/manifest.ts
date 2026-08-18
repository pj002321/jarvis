import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "J.A.R.V.I.S",
    short_name: "J.A.R.V.I.S",
    description: "Personal AI assistant UI powered by Claude",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#0891b2",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}

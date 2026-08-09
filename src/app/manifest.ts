import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Presence — Smart Attendance",
    short_name: "Presence",
    description:
      "Rotating-QR classroom attendance that stops buddy signing, with a location check.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e1a",
    theme_color: "#0b0e1a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

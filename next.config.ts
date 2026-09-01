import type { NextConfig } from "next";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "images.unsplash.com",
    port: "",
    pathname: "/photo-1760727467056-dfd5811970b9",
  },
  {
    protocol: "https",
    hostname: "upload.wikimedia.org",
    port: "",
    pathname: "/wikipedia/commons/**",
  },
  {
    protocol: "https",
    hostname: "commons.wikimedia.org",
    port: "",
    pathname: "/wiki/**",
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (supabaseUrl) {
  const { hostname, port, protocol } = new URL(supabaseUrl);

  if (protocol === "https:" || protocol === "http:") {
    for (const bucket of ["bike-assets", "tire-assets", "content-assets", "battery-assets"] as const) {
      remotePatterns.push({
        protocol: protocol.slice(0, -1) as "https" | "http",
        hostname,
        port,
        pathname: `/storage/v1/object/public/${bucket}/**`,
      });
    }
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
    maximumRedirects: 3,
  },
};

export default nextConfig;

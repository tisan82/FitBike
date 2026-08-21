import type { NextConfig } from "next";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "images.unsplash.com",
    port: "",
    pathname: "/photo-1760727467056-dfd5811970b9",
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (supabaseUrl) {
  const { hostname, port, protocol } = new URL(supabaseUrl);

  if (protocol === "https:" || protocol === "http:") {
    remotePatterns.push({
      protocol: protocol.slice(0, -1) as "https" | "http",
      hostname,
      port,
      pathname: "/storage/v1/object/public/bike-assets/**",
    });
    remotePatterns.push({
      protocol: protocol.slice(0, -1) as "https" | "http",
      hostname,
      port,
      pathname: "/storage/v1/object/public/tire-assets/**",
    });
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
};

export default nextConfig;

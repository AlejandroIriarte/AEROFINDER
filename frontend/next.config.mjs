/** @type {import('next').NextConfig} */
const nextConfig = {
  // Requerido por el Dockerfile multi-stage para imagen mínima
  output: "standalone",

  // Leaflet requiere transpilación desde ESM
  transpilePackages: ["leaflet", "react-leaflet"],
};

export default nextConfig;

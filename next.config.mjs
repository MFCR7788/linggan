const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["fibzvsstxxkdcflvtdzu.supabase.co"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
};

export default nextConfig;

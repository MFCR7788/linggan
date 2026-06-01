const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["fibzvsstxxkdcflvtdzu.supabase.co"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};

export default nextConfig;

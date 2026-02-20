import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone output for Docker/ECS Fargate deployment
  output: 'standalone',
}

export default nextConfig

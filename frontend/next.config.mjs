import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  trailingSlash: true,
  ...(phase === PHASE_DEVELOPMENT_SERVER
    ? {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: 'http://localhost:3000/api/:path*'
            },
            {
              source: '/socket.io/:path*',
              destination: 'http://localhost:3000/socket.io/:path*'
            },
            {
              source: '/widget.js',
              destination: 'http://localhost:3000/widget.js'
            },
            {
              source: '/widget.css',
              destination: 'http://localhost:3000/widget.css'
            }
          ];
        }
      }
    : {})
});

export default nextConfig;

import React from 'react';

interface ZenithLogoProps {
  size?: number;
  className?: string;
}

export const ZenithLogo: React.FC<ZenithLogoProps> = ({ size = 512, className = "" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="iconBg" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#1A1A1A" />
          <stop offset="1" stop-color="#050505" />
        </linearGradient>
        <filter id="hubGlow" x="156" y="156" width="200" height="200" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background Squircle */}
      <rect width="512" height="512" rx="120" fill="url(#iconBg)" />
      <rect width="508" height="508" x="2" y="2" rx="118" stroke="white" stroke-opacity="0.08" stroke-width="2" />

      {/* Orbital Ring (Delicate) */}
      <circle cx="256" cy="256" r="215" stroke="white" stroke-width="1.5" stroke-opacity="0.07" stroke-dasharray="4 8" />
      <circle cx="256" cy="256" r="185" stroke="white" stroke-width="1" stroke-opacity="0.04" />

      {/* Radial Structure */}
      <g stroke="white" stroke-linecap="round">
        {/* Main Axes (Elegant) */}
        <g stroke-width="8" stroke-opacity="0.7">
          <path d="M256 125V175" />
          <path d="M387 256H337" />
          <path d="M256 387V337" />
          <path d="M125 256H175" />
        </g>
        {/* Diagonals (Subtle) */}
        <g stroke-width="5" stroke-opacity="0.3">
          <path d="M348.5 163.5L313.1 198.9" />
          <path d="M348.5 348.5L313.1 313.1" />
          <path d="M163.5 348.5L198.9 313.1" />
          <path d="M163.5 163.5L198.9 198.9" />
        </g>
      </g>

      {/* Center Hub (Glowing) */}
      <circle cx="256" cy="256" r="42" fill="white" filter="url(#hubGlow)" fill-opacity="0.95" />
      <circle cx="256" cy="256" r="30" stroke="black" stroke-opacity="0.1" stroke-width="1" />
    </svg>
  );
};

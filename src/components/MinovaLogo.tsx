import React, { useId } from 'react';

interface MinovaLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<MinovaLogoProps['size']>, string> = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-11 h-11',
  xl: 'w-14 h-14',
};

/**
 * Geometric MINOVA AI emblem crafted in Midnight Navy (#060A14 / #0B1326),
 * Electric Cyan (#06B6D4 / #22D3EE), and Restrained Violet (#8B5CF6 / #7C3AED).
 */
export const MinovaLogo: React.FC<MinovaLogoProps> = ({
  size = 'md',
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `minova-bg-${uid}`;
  const borderId = `minova-border-${uid}`;
  const cyanId = `minova-cyan-${uid}`;
  const violetId = `minova-violet-${uid}`;
  const coreId = `minova-core-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="MINOVA AI Logo"
      className={`${SIZE_CLASSES[size]} shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0B1326" />
          <stop offset="100%" stopColor="#060A14" />
        </linearGradient>
        <linearGradient id={borderId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.65" />
          <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id={cyanId} x1="12" y1="14" x2="36" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id={violetId} x1="28" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="45%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={coreId} x1="32" y1="12" x2="32" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>

      {/* Midnight Navy Geometric Container */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={`url(#${bgId})`}
        stroke={`url(#${borderId})`}
        strokeWidth="2"
      />

      {/* Inner Faceted Hexagonal Frame */}
      <polygon
        points="32,8 52,19.5 52,44.5 32,56 12,44.5 12,19.5"
        fill="#091022"
        fillOpacity="0.75"
        stroke="#1E293B"
        strokeWidth="1"
      />

      {/* Left Electric Cyan Geometric Pillar & Wing */}
      <path
        d="M16 46V18L23.5 18L32 32.5L26.5 36.5L22.5 29.5V46H16Z"
        fill={`url(#${cyanId})`}
      />

      {/* Right Restrained Violet Geometric Pillar & Wing */}
      <path
        d="M48 46V18L40.5 18L32 32.5L37.5 36.5L41.5 29.5V46H48Z"
        fill={`url(#${violetId})`}
      />

      {/* Central Geometric Diamond Apex Node */}
      <polygon
        points="32,26 37.5,35 32,43 26.5,35"
        fill={`url(#${coreId})`}
      />

      {/* Precision Top Crest Node */}
      <polygon
        points="32,12 35.5,17.5 32,21.5 28.5,17.5"
        fill="#22D3EE"
      />
    </svg>
  );
};

import React, { useId } from 'react';

interface RovylLogoProps {
  size?: number;
  className?: string;
  color?: string;
}

/**
 * Rovyl mark: three destinations arranged around a central quick-access hub.
 * The asymmetric upper module and lower diagonal create a subtle abstract “R”.
 */
export const RovylLogo: React.FC<RovylLogoProps> = ({
  size = 512,
  className = '',
  color = '#F4F2ED',
}) => {
  const maskId = `rovyl-mark-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="48" y="48" width="416" height="416">
        <rect x="48" y="48" width="416" height="416" fill="black" />
        <rect x="112" y="104" width="320" height="112" rx="50" transform="rotate(30 272 160)" fill="white" />
        <rect x="70" y="286" width="202" height="112" rx="48" transform="rotate(-30 171 342)" fill="white" />
        <rect x="267" y="286" width="202" height="112" rx="48" transform="rotate(58 368 342)" fill="white" />
        <circle cx="256" cy="256" r="54" fill="black" />
      </mask>
      <rect x="48" y="48" width="416" height="416" fill={color} mask={`url(#${maskId})`} />
    </svg>
  );
};

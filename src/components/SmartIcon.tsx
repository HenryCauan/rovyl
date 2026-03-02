import React from 'react';

interface SmartIconProps {
  src: string;
  alt?: string;
  className?: string;
  size?: number;
  referenceScale?: number; // kept for API compatibility, not used
  /** Scale factor applied to the icon within its container (0-1). Default 0.82 */
  displayScale?: number;
}

/**
 * SmartIcon renders a native app icon.
 * Icon normalization is now handled at the extraction layer (extract-icon.ps1),
 * which places all icon content on a 256x256 canvas with 15% padding.
 * displayScale shrinks the rendered image within the container so the
 * standardized icons appear slightly smaller without affecting layout.
 */
export const SmartIcon: React.FC<SmartIconProps> = ({
  src,
  alt = "",
  className = "",
  displayScale = 0.70,
}) => {
  const pct = `${displayScale * 100}%`;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        width: pct,
        height: pct,
        objectFit: 'contain',
      }}
    />
  );
};

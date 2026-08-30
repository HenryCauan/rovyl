import React from 'react';

interface SmartIconProps {
  src: string;
  alt?: string;
  className?: string;
  size?: number;
  referenceScale?: number; // kept for API compatibility, not used
  /** Scale factor applied to the icon within its container (0-1). Default 0.82 */
  displayScale?: number;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * SmartIcon renders a native app icon.
 * Icon normalization is handled at the extraction layer (extract-icon.ps1),
 * which crops each icon to its visible content and rescales it to a fixed
 * fraction of a 256x256 canvas, so all icons arrive optically the same size.
 * displayScale shrinks the rendered image within the container so the
 * standardized icons appear slightly smaller without affecting layout.
 */
export const SmartIcon: React.FC<SmartIconProps> = ({
  src,
  alt = "",
  className = "",
  displayScale = 0.70,
  onError,
}) => {
  const pct = `${displayScale * 100}%`;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={onError}
      /** Ícone é conteúdo de um controlo, não uma imagem para levar dali. */
      draggable={false}
      style={{
        width: pct,
        height: pct,
        objectFit: 'contain',
        WebkitUserDrag: 'none',
      } as React.CSSProperties}
    />
  );
};

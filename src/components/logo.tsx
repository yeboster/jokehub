
"use client";

import Image from 'next/image';
import type { FC } from 'react';

interface LogoProps {
  width: number;
  className?: string;
  priority?: boolean;
  /** Accessible name. "Joke Hub", not "Joke Hub Logo" — the word "logo" is
   *  read aloud and tells the user nothing. */
  alt?: string;
}

const LOGO_ASPECT_RATIO = 312 / 1395;

const Logo: FC<LogoProps> = ({ width, className, priority = false, alt = 'Joke Hub' }) => {
  const height = Math.round(width * LOGO_ASPECT_RATIO);

  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
};

export default Logo;

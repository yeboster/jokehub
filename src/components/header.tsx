
import type { FC } from 'react';

interface HeaderProps {
  title: string;
  /** Optional one-line description rendered under the title. */
  description?: string;
  /** Centre the block; the default is left-aligned. */
  centered?: boolean;
}

const Header: FC<HeaderProps> = ({ title, description, centered = false }) => {
  return (
    <header className={centered ? 'mb-8 text-center' : 'mb-8'}>
      <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">{title}</h1>
      {description && (
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">{description}</p>
      )}
    </header>
  );
};

export default Header;

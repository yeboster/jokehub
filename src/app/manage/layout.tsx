import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The page itself is a client component and cannot export metadata; a segment
// layout can. It renders children verbatim, so the route's markup is unchanged.
export const metadata: Metadata = {
  title: 'Import jokes',
};

export default function ImportLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

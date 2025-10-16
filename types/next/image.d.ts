declare module 'next/image' {
  import type { ReactElement } from 'react';

  export interface ImageProps {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    priority?: boolean;
    className?: string;
    onClick?: (event: unknown) => void;
    [key: string]: unknown;
  }

  const Image: (props: ImageProps) => ReactElement;
  export default Image;
}

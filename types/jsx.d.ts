import type { ReactElement } from 'react';

declare global {
  namespace JSX {
    interface Element extends ReactElement {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export {};

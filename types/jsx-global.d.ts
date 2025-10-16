import type { ReactElement } from 'react';

declare global {
  namespace JSX {
    interface Element extends ReactElement {}
    interface ElementClass {
      render: () => unknown;
    }
    interface ElementAttributesProperty {
      props: any;
    }
    interface ElementChildrenAttribute {
      children: any;
    }
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export {};

declare module 'next/font/google' {
  interface NextFont {
    className: string;
    style?: { fontFamily: string };
  }

  interface FontOptions {
    subsets?: string[];
    variable?: string;
    display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
    weight?: string | string[];
    style?: 'normal' | 'italic' | Array<'normal' | 'italic'>;
    preload?: boolean;
    adjustFontFallback?: boolean;
    fallback?: string[];
  }

  export function Inter(options?: FontOptions): NextFont;
  export function Roboto(options?: FontOptions): NextFont;
  export type FontFunction = (options?: FontOptions) => NextFont;
}

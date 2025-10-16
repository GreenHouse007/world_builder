declare module 'next/font/google' {
  interface FontOptions {
    subsets?: string[];
    variable?: string;
    weight?: string | string[];
    style?: string | string[];
    display?: string;
  }

  interface FontResult {
    className: string;
    variable: string;
    style?: Record<string, unknown>;
  }

  export function Geist(options?: FontOptions): FontResult;
  export function Geist_Mono(options?: FontOptions): FontResult;
}

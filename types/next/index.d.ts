declare module 'next' {
  export interface Metadata {
    title?: string;
    description?: string;
    icons?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface NextConfig {
    [key: string]: unknown;
  }
}

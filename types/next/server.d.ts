declare module 'next/server' {
  export interface NextURL {
    searchParams: {
      get(name: string): string | null;
    };
  }

  export interface NextRequest extends Request {
    nextUrl: NextURL;
  }

  export interface NextResponseInit extends ResponseInit {}

  export class NextResponse extends Response {
    static json(body: unknown, init?: NextResponseInit): NextResponse;
  }
}

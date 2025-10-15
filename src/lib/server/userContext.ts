import { NextRequest } from 'next/server';

const FALLBACK_USER_ID = process.env.DEFAULT_USER_ID ?? 'admin';

export function getUserIdFromRequest(request: NextRequest) {
  return (
    request.headers.get('x-user-id') ??
    request.nextUrl.searchParams.get('userId') ??
    FALLBACK_USER_ID
  );
}

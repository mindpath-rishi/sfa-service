import { Request } from 'express';
import { ExtractJwt } from 'passport-jwt';

export const jwtExtractor = (req: Request): string | null => {
  if (!req) return null;

  /* ======================================================
   * 1️⃣ Authorization: Bearer <token> (Mobile / API)
   * ====================================================== */
  const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  console.log('Extracted JWT from Authorization header:', bearerToken);
  if (bearerToken) {
    return bearerToken;
  }

  /* ======================================================
   * 2️⃣ HttpOnly Cookie (Web)
   * ====================================================== */
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }

  /* ======================================================
   * 3️⃣ Signed Cookie (optional, if enabled)
   * ====================================================== */
  if ((req as any).signedCookies?.access_token) {
    return (req as any).signedCookies.access_token;
  }

  /* ======================================================
   * 4️⃣ Fallback headers (optional support)
   * ====================================================== */
  const headerToken =
    (req.headers['x-access-token'] as string) ||
    (req.headers['x-auth-token'] as string);

  if (headerToken) {
    return headerToken.trim();
  }

  return null;
};

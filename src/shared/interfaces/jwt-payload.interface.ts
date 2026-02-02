export interface JwtPayload {
  sub: string; // profileId / userId
  role: string;
  sid: string; // sessionId
  iat?: number;
  exp?: number;
  name: string
}

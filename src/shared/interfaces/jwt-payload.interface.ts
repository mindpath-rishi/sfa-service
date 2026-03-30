export interface JwtPayload {
  sub: string; // profileId / userId
  role: string;
  sid: string; // sessionId
  iat?: number;
  exp?: number;
  name: string;
  deviceId: string;
  vanId?: string; // optional but useful
  vanName?: string; // optional but useful
}

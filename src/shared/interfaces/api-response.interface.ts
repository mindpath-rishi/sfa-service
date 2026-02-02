/**
 * Standard API Success Response
 */
export interface ApiResponse<T> {
  success: true;
  requestId: string;
  timestamp: string;
  path: string;
  method: string;
  durationMs: number;
  data: T;
}
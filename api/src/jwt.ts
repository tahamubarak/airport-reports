import jwt from 'jsonwebtoken';

export interface JwtPayload {
  username: string;
  isAppAdmin: boolean;
  isSiteAdmin?: boolean;
  siteId?: string | null;
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET ?? 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: '8h' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret';
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

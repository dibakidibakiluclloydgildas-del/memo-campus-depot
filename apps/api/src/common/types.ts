import { Request } from 'express';
import type { Role } from '@memo/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  planCode: string;
  institutionId: string | null;
  sessionId: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  id?: string;
}

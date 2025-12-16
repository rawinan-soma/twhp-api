import { Accounts } from 'prisma/generated/client';
import { Request } from 'express';

export interface RequestWithAccountData extends Request {
  user: Omit<Accounts, 'password'>;
}

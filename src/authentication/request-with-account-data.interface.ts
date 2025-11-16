import { Accounts } from '@prisma/client';
import { Request } from 'express';

export interface RequestWithAccountData extends Request {
  user: Omit<Accounts, 'password'>;
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithAccountData } from './request-with-account-data.interface';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getClass(),
      context.getHandler(),
    ]);

    if (isPublic) return true;

    const requireRole = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getClass(),
      context.getHandler(),
    ]);

    if (!requireRole) return true;

    const request = context.switchToHttp().getRequest<RequestWithAccountData>();
    const account = request.user;
    if (!account) return false;
    // console.log(account);
    return account && requireRole.includes(account?.role);
  }
}

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './audit.service';
import { getSeverityLevel } from './audit.mapping';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/entities/user.entity';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private auditService: AuditService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // RULE: Skip login logging in real-time alerts (stay internal)
    if (url.includes('/auth/login')) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap((data) => {
        // SUCCESS PATH - Generate a NEW unique eventId for each log attempt
        const eventId = uuidv4();
        this.logAction(context, 'SUCCESS', eventId).catch((err) =>
          console.error('[AuditInterceptor] Success log failed', err),
        );
      }),
      catchError((error) => {
        // FAILURE PATH - Generate a NEW unique eventId for each log attempt
        const eventId = uuidv4();
        this.logAction(context, 'FAILURE', eventId, error).catch((err) =>
          console.error('[AuditInterceptor] Failure log failed', err),
        );
        return throwError(() => error);
      }),
    );
  }

  private async logAction(
    context: ExecutionContext,
    outcome: 'SUCCESS' | 'FAILURE',
    eventId: string,
    error?: any,
  ) {
    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user; // JWT payload: { userId, email, role }

    // HOW: Fetch full user details from database
    // WHY: JWT only contains userId, email, role - need firstName/lastName for audit logs
    let fullUser: UserDocument | null = null;
    if (jwtUser?.userId) {
      try {
        fullUser = (await this.userModel
          .findById(jwtUser.userId)
          .select('firstName lastName email role plan isVerified createdAt')
          .lean()
          .exec()) as UserDocument;
      } catch (e) {
        console.error('[AuditInterceptor] Failed to fetch user details', e);
      }
    }

    // Extract ID from params if possible
    const resourceId = request.params?.id || null;
    const severity = getSeverityLevel(request.method, request.url);

    // HOW: Build user's full name from database record
    // WHY: Ensures "Guest (N/A)" is only shown for truly anonymous requests
    const userName = fullUser
      ? `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim() ||
        fullUser.email
      : 'Guest';
    const userEmail = fullUser?.email || jwtUser?.email || 'N/A';

    // HOW: Construct mandatory canonical event schema
    // WHY: Guarantees every log has standard metadata for auditing/digest grouping
    const event = {
      eventId,
      severity,
      action: `${request.method} ${request.url}`,
      timestamp: new Date(),
      user: {
        userId: jwtUser?.userId || 'ANONYMOUS',
        fullName: userName,
        email: userEmail,
        username: fullUser?.email?.split('@')[0] || null,
        role: fullUser?.role || jwtUser?.role || 'GUEST',
        plan: (fullUser as any)?.plan || 'FREE',
        status: fullUser?.isVerified ? 'VERIFIED' : 'PENDING',
        signupDate: fullUser?.createdAt || new Date(),
        lastActivity: new Date(),
        ipAddress:
          request.ip || request.headers['x-forwarded-for'] || '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'Unknown',
      },
      request: {
        method: request.method,
        route: request.url,
        resourceId,
      },
      outcome,
      metadata: {
        statusCode: context.switchToHttp().getResponse().statusCode,
        error: error?.message || null,
      },
    };

    // HOW: Offload logging to AuditService
    // WHY: Non-blocking execution allows the request to finish without waiting for DB/Mail
    return this.auditService.logEvent(event);
  }
}

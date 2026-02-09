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

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // RULE: Skip login logging in real-time alerts (stay internal)
    if (url.includes('/auth/login')) {
      return next.handle();
    }

    const startTime = Date.now();
    const eventId = uuidv4();

    return next.handle().pipe(
      tap((data) => {
        // SUCCESS PATH
        this.logAction(context, 'SUCCESS', eventId).catch(err => 
          console.error('[AuditInterceptor] Success log failed', err)
        );
      }),
      catchError((error) => {
        // FAILURE PATH
        this.logAction(context, 'FAILURE', eventId, error).catch(err =>
          console.error('[AuditInterceptor] Failure log failed', err)
        );
        return throwError(() => error);
      }),
    );
  }

  private async logAction(context: ExecutionContext, outcome: 'SUCCESS' | 'FAILURE', eventId: string, error?: any) {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Assumes Passport/JWT populated user
    
    // Extract ID from params if possible
    const resourceId = request.params?.id || null;
    const severity = getSeverityLevel(request.method, request.url);

    // HOW: Construct mandatory canonical event schema
    // WHY: Guarantees every log has standard metadata for auditing/digest grouping
    const event = {
      eventId,
      severity,
      action: `${request.method} ${request.url}`,
      timestamp: new Date(),
      user: {
        userId: user?._id || user?.id || 'ANONYMOUS',
        fullName: user?._id ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Guest',
        email: user?.email || 'N/A',
        username: user?.username || null,
        role: user?.role || 'GUEST',
        plan: (user as any)?.plan || 'FREE', // Cast to any in case plan is not in type
        status: user?.isVerified ? 'VERIFIED' : 'PENDING',
        signupDate: user?.createdAt || new Date(),
        lastActivity: new Date(),
        ipAddress: request.ip || request.headers['x-forwarded-for'] || '127.0.0.1',
        userAgent: request.headers['user-agent'] || 'Unknown'
      },
      request: {
        method: request.method,
        route: request.url,
        resourceId
      },
      outcome,
      metadata: {
        statusCode: context.switchToHttp().getResponse().statusCode,
        error: error?.message || null
      }
    };

    // HOW: Offload logging to AuditService
    // WHY: Non-blocking execution allows the request to finish without waiting for DB/Mail
    return this.auditService.logEvent(event);
  }
}

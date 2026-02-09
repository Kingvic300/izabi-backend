// HOW: Map HTTP methods and routes to audit severity levels
// WHY: Centralizes classification logic for consistency across all captured actions

export function getSeverityLevel(method: string, route: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const path = route.toLowerCase();

  // CRITICAL: Security risks or infrastructure failures
  if (path.includes('auth/reset-password') && method === 'POST') return 'CRITICAL';
  if (path.includes('admin/config') || path.includes('keys')) return 'CRITICAL';

  // HIGH: Onboarding, conversion, or destruction
  if (path.includes('auth/signup')) return 'HIGH';
  if (path.includes('subscription') || path.includes('payment')) return 'HIGH';
  if (method === 'DELETE') return 'HIGH';

  // MEDIUM: Core value creation (Study, AI, Content)
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (path.includes('study') || path.includes('ai') || path.includes('quiz') || path.includes('notes')) {
      return 'MEDIUM';
    }
    return 'MEDIUM'; // Any mutation is at least MEDIUM
  }

  // LOW: Read-only activity
  return 'LOW';
}

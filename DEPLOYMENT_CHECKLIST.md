# Paystack Integration - Deployment Checklist

## Pre-Deployment Setup

### 1. Environment Configuration

- [ ] Set `PAYSTACK_SECRET_KEY` in production environment
- [ ] Set `PAYSTACK_PUBLIC_KEY` in production environment
- [ ] Set `PAYSTACK_CALLBACK_URL` to production URL
- [ ] Verify MongoDB connection string is set
- [ ] Verify JWT secrets are configured
- [ ] Enable HTTPS/SSL certificate

### 2. Paystack Dashboard Configuration

- [ ] Create Paystack account (or use existing)
- [ ] Verify business details in Paystack dashboard
- [ ] Switch to live API keys (remove test keys)
- [ ] Configure webhook URL: `https://yourdomain.com/api/payments/webhook`
- [ ] Enable webhook events: `charge.success`
- [ ] Test webhook delivery in Paystack dashboard
- [ ] Set up email notifications in Paystack

### 3. Database Setup

- [ ] Ensure `payments` collection exists
- [ ] Ensure `payment_logs` collection exists
- [ ] Create index on `reference` field (unique)
- [ ] Create index on `userId` field
- [ ] Create index on `status` field
- [ ] Test database connectivity

### 4. Security Review

- [ ] Verify all endpoints require JWT authentication
- [ ] Add rate limiting middleware (recommended)
- [ ] Add admin guard to `/refund` endpoint
- [ ] Enable CORS with allowed origins only
- [ ] Review and remove any console.log statements
- [ ] Enable Helmet.js for security headers
- [ ] Set up IP whitelisting for webhooks (optional)

### 5. Code Review

- [ ] Review all error messages (no sensitive data)
- [ ] Verify all amounts are in kobo (x100)
- [ ] Check payment plan amounts are correct
- [ ] Verify subscription durations
- [ ] Review refund logic
- [ ] Check webhook signature verification

## Testing Checklist

### 6. Local Testing

- [ ] Run build: `npm run build`
- [ ] Start server: `npm start`
- [ ] Test payment initialization
- [ ] Test payment verification (with test card)
- [ ] Test webhook locally (use ngrok)
- [ ] Test payment history endpoint
- [ ] Test payment stats endpoint
- [ ] Test bank verification
- [ ] Test refund functionality
- [ ] Test failed payment retry
- [ ] Test payment cancellation

### 7. Integration Testing

- [ ] Import Postman collection
- [ ] Test all endpoints sequentially
- [ ] Verify database records are created
- [ ] Check payment logs are recorded
- [ ] Test with multiple users
- [ ] Test concurrent payments
- [ ] Test edge cases (invalid reference, etc.)

### 8. Frontend Integration

- [ ] Update frontend payment button
- [ ] Implement redirect to Paystack checkout
- [ ] Create verification callback page
- [ ] Display payment history
- [ ] Show payment statistics
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test user flow end-to-end

## Deployment Steps

### 9. Deploy to Production

- [ ] Build production bundle: `npm run build`
- [ ] Deploy to server (Render, Railway, etc.)
- [ ] Verify environment variables are set
- [ ] Check application starts successfully
- [ ] Monitor logs for errors
- [ ] Test health check endpoint

### 10. Post-Deployment Testing

- [ ] Test payment with real Naira amount (small)
- [ ] Verify webhook receives events
- [ ] Check database records are created
- [ ] Verify subscription activation works
- [ ] Test payment verification
- [ ] Check email notifications (if configured)
- [ ] Monitor error logs for 24 hours

### 11. Monitoring Setup

- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure logging service
- [ ] Set up uptime monitoring
- [ ] Create alerts for failed payments
- [ ] Monitor webhook delivery rate
- [ ] Track payment success rate

## Go-Live Checklist

### 12. Final Verification

- [ ] Verify payment amounts are correct (in Naira)
- [ ] Test complete user journey
- [ ] Verify refund process works
- [ ] Check all error messages are user-friendly
- [ ] Test on different devices/browsers
- [ ] Verify mobile responsiveness
- [ ] Test with slow network
- [ ] Check accessibility

### 13. Documentation

- [ ] Update API documentation
- [ ] Document payment plans
- [ ] Create troubleshooting guide
- [ ] Document webhook setup
- [ ] Create user guide for payments
- [ ] Document refund policy
- [ ] Add FAQ section

### 14. Business Setup

- [ ] Configure payment settlement account
- [ ] Set up accounting integration
- [ ] Create payment reports dashboard
- [ ] Set up customer support for payment issues
- [ ] Define refund policy and timeline
- [ ] Set up payment failure notification system

## Production Monitoring

### 15. Daily Checks

- [ ] Review failed payment logs
- [ ] Check webhook delivery status
- [ ] Monitor payment success rate
- [ ] Review customer support tickets
- [ ] Check for any API errors

### 16. Weekly Reviews

- [ ] Analyze payment statistics
- [ ] Review refund requests
- [ ] Check payment fraud alerts
- [ ] Update payment plans if needed
- [ ] Review and optimize performance

## Rollback Plan

### 17. In Case of Issues

- [ ] Document current state
- [ ] Backup database
- [ ] Revert to previous version
- [ ] Notify users of payment issues
- [ ] Contact Paystack support if needed
- [ ] Review logs to identify root cause

## Support Resources

### Contact Information

- **Paystack Support**: support@paystack.com
- **Paystack Documentation**: https://paystack.com/docs
- **Emergency Hotline**: [Add your support number]

### Useful Links

- Paystack Dashboard: https://dashboard.paystack.com
- API Reference: https://paystack.com/docs/api
- Test Cards: https://paystack.com/docs/payments/test-payments
- Webhook Guide: https://paystack.com/docs/payments/webhooks

## Performance Benchmarks

### Target Metrics

- Payment initialization: < 2 seconds
- Payment verification: < 3 seconds
- Webhook processing: < 1 second
- Payment history load: < 2 seconds
- API uptime: > 99.9%
- Payment success rate: > 95%

## Compliance

### Legal Requirements

- [ ] Privacy policy includes payment data handling
- [ ] Terms of service mention payment terms
- [ ] Refund policy is published
- [ ] GDPR compliance (if applicable)
- [ ] PCI DSS compliance (handled by Paystack)

---

## Quick Reference

### Test Cards (Paystack)

- **Success**: 4084084084084081
- **Decline**: 4084080000000408
- **Insufficient Funds**: 4084080000000409

### Common Issues

**Issue**: Webhook not receiving events
**Solution**:

1. Check webhook URL in Paystack dashboard
2. Verify signature verification code
3. Test with Paystack webhook debugger

**Issue**: Payment verification fails
**Solution**:

1. Check reference exists in database
2. Verify Paystack API credentials
3. Check network connectivity

**Issue**: Refund not processing
**Solution**:

1. Verify payment status is 'success'
2. Check Paystack account balance
3. Review refund eligibility

---

**Last Updated**: [Current Date]
**Deployment Status**: Pre-deployment
**Version**: 1.0.0

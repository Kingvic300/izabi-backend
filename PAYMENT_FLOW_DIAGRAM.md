# Paystack Payment Flow Diagram

## 1. Payment Initialization Flow

```
┌─────────────┐
│   Frontend  │
│   (User)    │
└──────┬──────┘
       │
       │ POST /api/payments/initialize
       │ { plan: "pro_monthly" }
       │
       ▼
┌─────────────────────────────────────────┐
│     Backend (NestJS)                    │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsController             │   │
│  │   ├─ Validate request           │   │
│  │   └─ Call PaymentsService       │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             ▼                           │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsService                │   │
│  │   ├─ Get user details           │   │
│  │   ├─ Get plan details           │   │
│  │   └─ Call PaystackService       │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             ▼                           │
│  ┌─────────────────────────────────┐   │
│  │  PaystackService                │   │
│  │   └─ initializeTransaction()    │   │
│  └──────────┬──────────────────────┘   │
└─────────────┼───────────────────────────┘
              │
              │ API Request
              ▼
    ┌───────────────────┐
    │   Paystack API    │
    │  (External)       │
    └─────────┬─────────┘
              │
              │ Returns:
              │ - authorization_url
              │ - reference
              ▼
    ┌─────────────────────────────┐
    │   Save to Database          │
    │   - Payment record          │
    │   - Payment log             │
    └─────────────┬───────────────┘
                  │
                  │ Return to Frontend
                  ▼
          ┌──────────────┐
          │  Redirect    │
          │  User to     │
          │  Paystack    │
          │  Checkout    │
          └──────────────┘
```

## 2. Payment Verification Flow

```
┌─────────────┐
│   Paystack  │
│   Checkout  │
│   Page      │
└──────┬──────┘
       │
       │ User completes payment
       │
       ▼
┌─────────────────────────────────────────┐
│   Paystack redirects to callback URL    │
│   https://yourdomain.com/verify?ref=... │
└──────┬──────────────────────────────────┘
       │
       │ Frontend calls verification
       │
       ▼
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │
       │ GET /api/payments/verify/:reference
       │
       ▼
┌─────────────────────────────────────────┐
│     Backend                             │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsController             │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             ▼                           │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsService                │   │
│  │   ├─ Check if already verified  │   │
│  │   ├─ Call Paystack verify API   │   │
│  │   ├─ Update payment record      │   │
│  │   └─ Grant user benefits        │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│  ┌─────────▼────────────────────────┐  │
│  │  UsersService                     │  │
│  │   └─ Update subscription status  │  │
│  └───────────────────────────────────┘  │
└─────────────┬───────────────────────────┘
              │
              │ Success Response
              ▼
        ┌──────────────┐
        │   Frontend   │
        │   Redirect   │
        │   to         │
        │   Dashboard  │
        └──────────────┘
```

## 3. Webhook Flow

```
┌─────────────┐
│   Paystack  │
│   Server    │
└──────┬──────┘
       │
       │ charge.success event
       │ with signature
       │
       ▼
┌─────────────────────────────────────────┐
│   POST /api/payments/webhook            │
│   Headers:                              │
│     x-paystack-signature: <signature>   │
│   Body:                                 │
│     { event: "charge.success",          │
│       data: { reference, ... } }        │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│     Backend                             │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsController             │   │
│  │   └─ Verify signature           │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             │ Signature valid?          │
│             ├─ No → 401 Error           │
│             │                           │
│             ▼ Yes                       │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsService                │   │
│  │   └─ verifyPayment()            │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             ▼                           │
│  ┌─────────────────────────────────┐   │
│  │  Update database                │   │
│  │   ├─ Payment status = success   │   │
│  │   ├─ Set paidAt timestamp       │   │
│  │   └─ Activate subscription      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  PaymentLoggerService           │   │
│  │   └─ Log webhook event          │   │
│  └─────────────────────────────────┘   │
└─────────────┬───────────────────────────┘
              │
              │ Return { status: "success" }
              ▼
        ┌──────────────┐
        │   Paystack   │
        │   marks      │
        │   delivered  │
        └──────────────┘
```

## 4. Refund Flow

```
┌─────────────┐
│   Admin     │
│   Panel     │
└──────┬──────┘
       │
       │ POST /api/payments/refund/:reference
       │ { reason: "..." }
       │
       ▼
┌─────────────────────────────────────────┐
│     Backend                             │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsController             │   │
│  │   └─ Check admin permissions    │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             ▼                           │
│  ┌─────────────────────────────────┐   │
│  │  PaymentsService                │   │
│  │   ├─ Validate payment exists    │   │
│  │   ├─ Check payment is success   │   │
│  │   └─ Call PaystackService       │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│             ▼                           │
│  ┌─────────────────────────────────┐   │
│  │  PaystackService                │   │
│  │   └─ refundTransaction()        │   │
│  └──────────┬──────────────────────┘   │
└─────────────┼───────────────────────────┘
              │
              │ API Request
              ▼
    ┌───────────────────┐
    │   Paystack API    │
    │   /refund         │
    └─────────┬─────────┘
              │
              │ Refund processed
              ▼
    ┌─────────────────────────────┐
    │   Update Database           │
    │   - Payment status: reversed │
    │   - Add refund metadata      │
    │   - Revoke user benefits     │
    └─────────────┬───────────────┘
                  │
                  │ Success Response
                  ▼
          ┌──────────────┐
          │   Admin      │
          │   Dashboard  │
          └──────────────┘
```

## 5. Data Flow Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       Frontend (React/Next.js)           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │  Payment   │  │  History   │  │  Stats     │         │
│  │  Button    │  │  Page      │  │  Dashboard │         │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘         │
└────────┼───────────────┼───────────────┼────────────────┘
         │               │               │
         │ HTTPS/JWT     │               │
         │               │               │
         ▼               ▼               ▼
┌──────────────────────────────────────────────────────────┐
│                    Backend API (NestJS)                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │              PaymentsController                    │ │
│  └─────────────────────┬──────────────────────────────┘ │
│                        │                                 │
│  ┌─────────────────────▼──────────────────────────────┐ │
│  │              PaymentsService                       │ │
│  └─────┬────────────────────────────────┬─────────────┘ │
│        │                                │                │
│  ┌─────▼─────────┐            ┌─────────▼─────────────┐ │
│  │ PaystackSvc   │            │  PaymentLoggerSvc     │ │
│  └───────────────┘            └───────────────────────┘ │
└────────┬────────────────────────────────┬────────────────┘
         │                                │
         │ External API                   │ Database
         │                                │
         ▼                                ▼
┌──────────────────┐          ┌──────────────────────┐
│  Paystack API    │          │    MongoDB           │
│  - Initialize    │          │  ┌────────────────┐  │
│  - Verify        │          │  │  payments      │  │
│  - Refund        │          │  └────────────────┘  │
│  - Banks         │          │  ┌────────────────┐  │
└──────────────────┘          │  │  payment_logs  │  │
                              │  └────────────────┘  │
                              │  ┌────────────────┐  │
                              │  │  users         │  │
                              │  └────────────────┘  │
                              └──────────────────────┘
```

## Key Features

### Security Layers
1. **JWT Authentication** - All endpoints protected
2. **Webhook Signature** - HMAC SHA512 verification
3. **Input Validation** - DTO validation on all inputs
4. **Environment Secrets** - API keys in .env

### Error Handling
- Custom exceptions for different scenarios
- Centralized error handler
- Detailed error logging
- User-friendly error messages

### Audit Trail
- Every payment action logged
- Webhook events recorded
- User activity tracking
- Timestamp on all records

### Scalability
- Paginated endpoints
- Efficient database queries
- Indexed fields
- Async operations

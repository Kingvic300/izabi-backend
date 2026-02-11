# Paystack Payment Integration

This module provides a comprehensive Paystack payment integration for the IZABI application, supporting subscription payments, refunds, webhooks, and payment tracking.

## Features

- ✅ Payment initialization and verification
- ✅ Webhook handling for real-time payment notifications
- ✅ Payment history and statistics
- ✅ Failed payment retry functionality
- ✅ Refund processing
- ✅ Payment cancellation
- ✅ Bank account verification
- ✅ Comprehensive audit logging
- ✅ Subscription management

## Environment Variables

Add these to your `.env` file:

```env
PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here
PAYSTACK_PUBLIC_KEY=pk_test_your_public_key_here
PAYSTACK_CALLBACK_URL=https://yourdomain.com/payment/verify
```

## API Endpoints

### 1. Initialize Payment

**POST** `/api/payments/initialize`

Initialize a new payment transaction.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Request Body:**

```json
{
  "plan": "pro_monthly" | "premium_monthly"
}
```

**Response:**

```json
{
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "xyz123abc"
}
```

### 2. Verify Payment

**GET** `/api/payments/verify/:reference`

Verify a payment transaction.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
    "success": true,
    "reference": "xyz123abc"
}
```

### 3. Get Payment History

**GET** `/api/payments/history?page=1&limit=10`

Get paginated payment history for the authenticated user.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**

- `page` (optional, default: 1)
- `limit` (optional, default: 10)

**Response:**

```json
{
  "payments": [...],
  "total": 25,
  "page": 1,
  "totalPages": 3
}
```

### 4. Get Payment Statistics

**GET** `/api/payments/stats`

Get payment statistics for the authenticated user.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
    "stats": [{ "_id": "success", "count": 10, "totalAmount": 999900 }],
    "totalSpent": 999900,
    "totalTransactions": 10
}
```

### 5. Retry Failed Payment

**POST** `/api/payments/retry/:reference`

Retry a failed payment.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "new_xyz123abc"
}
```

### 6. Cancel Pending Payment

**POST** `/api/payments/cancel/:reference`

Cancel a pending payment.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
    "success": true,
    "message": "Payment cancelled successfully"
}
```

### 7. Process Refund

**POST** `/api/payments/refund/:reference`

Process a refund (admin only).

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Request Body:**

```json
{
    "reason": "Customer requested refund"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Refund processed successfully",
  "refundData": {...}
}
```

### 8. Get Banks List

**GET** `/api/payments/banks/list`

Get list of Nigerian banks.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Response:**

```json
{
    "data": [
        {
            "name": "Access Bank",
            "code": "044"
        }
    ]
}
```

### 9. Verify Bank Account

**POST** `/api/payments/banks/verify`

Verify a bank account number.

**Headers:**

```
Authorization: Bearer {jwt_token}
```

**Request Body:**

```json
{
    "accountNumber": "0123456789",
    "bankCode": "044"
}
```

**Response:**

```json
{
    "account_name": "John Doe",
    "account_number": "0123456789"
}
```

### 10. Webhook Endpoint

**POST** `/api/payments/webhook`

Receives Paystack webhook notifications.

**Headers:**

```
x-paystack-signature: {webhook_signature}
```

**Note:** This endpoint is called by Paystack, not your frontend.

## Webhook Configuration

1. Go to Paystack Dashboard → Settings → Webhooks
2. Add your webhook URL: `https://yourdomain.com/api/payments/webhook`
3. The webhook will automatically verify signatures and process events

## Payment Plans

The system supports two plans:

```typescript
{
  pro_monthly: {
    name: 'Pro Scholar Monthly',
    amount: 199900, // 1,999 NGN
    tier: 'pro',
    duration: 30 // days
  },
  premium_monthly: {
    name: 'Premium Scholar Monthly',
    amount: 299900, // 2,999 NGN
    tier: 'premium',
    duration: 30 // days
  }
}
```

## Frontend Integration Example

```typescript
// Initialize payment
const initializePayment = async (plan: 'pro_monthly' | 'premium_monthly') => {
    const response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
    });

    const data = await response.json();

    // Redirect to Paystack checkout
    window.location.href = data.authorization_url;
};

// Verify payment (call this on your callback page)
const verifyPayment = async (reference: string) => {
    const response = await fetch(`/api/payments/verify/${reference}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    const data = await response.json();

    if (data.success) {
        // Payment successful, redirect to dashboard
        router.push('/dashboard');
    }
};
```

## Error Handling

All endpoints return standard error responses:

```json
{
    "statusCode": 400,
    "message": "Error description",
    "error": "Bad Request"
}
```

Common error codes:

- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found (payment not found)
- `500` - Internal Server Error (Paystack API error)

## Testing

Use Paystack test keys for development:

- Test cards: https://paystack.com/docs/payments/test-payments
- Sample card: 4084084084084081 (success)

## Security

- All payment endpoints are protected with JWT authentication
- Webhook signatures are verified using HMAC SHA512
- Sensitive data is never logged
- All amounts are validated server-side

## Audit Logging

All payment activities are logged for audit purposes:

- Payment initialization
- Verification attempts
- Webhook events
- Refunds

Query logs using:

```typescript
paymentLoggerService.getPaymentLogs(reference);
paymentLoggerService.getUserLogs(userId);
```

## Support

For Paystack API documentation: https://paystack.com/docs/api

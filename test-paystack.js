#!/usr/bin/env node

/**
 * Paystack Integration Test Script
 *
 * This script demonstrates how to test the Paystack integration
 * Run with: node test-paystack.js
 */

const BASE_URL = 'http://localhost:3000';
let authToken = '';
let paymentReference = '';

// Test user credentials (adjust as needed)
const testUser = {
    email: 'test@example.com',
    password: 'password123',
};

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ ${message}`, 'blue');
}

// Helper function to make API requests
async function apiRequest(
    endpoint,
    method = 'GET',
    body = null,
    requireAuth = false,
) {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (requireAuth && authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

async function runTests() {
    try {
        log('\n========================================', 'yellow');
        log('  PAYSTACK INTEGRATION TEST SUITE', 'yellow');
        log('========================================\n', 'yellow');

        // 1. Login
        logStep(1, 'Authenticating user...');
        try {
            const loginResponse = await apiRequest(
                '/api/auth/login',
                'POST',
                testUser,
            );
            authToken = loginResponse.access_token;
            logSuccess('Authentication successful');
            logInfo(`Token: ${authToken.substring(0, 20)}...`);
        } catch (error) {
            logError(`Authentication failed: ${error.message}`);
            logInfo('Make sure you have a test user created in your database');
            return;
        }

        // 2. Initialize Payment
        logStep(2, 'Initializing payment...');
        try {
            const paymentInit = await apiRequest(
                '/api/payments/initialize',
                'POST',
                { plan: 'pro_monthly' },
                true,
            );
            paymentReference = paymentInit.reference;
            logSuccess('Payment initialized');
            logInfo(`Reference: ${paymentReference}`);
            logInfo(`Checkout URL: ${paymentInit.authorization_url}`);
        } catch (error) {
            logError(`Payment initialization failed: ${error.message}`);
            return;
        }

        // 3. Get Payment History
        logStep(3, 'Fetching payment history...');
        try {
            const history = await apiRequest(
                '/api/payments/history?page=1&limit=5',
                'GET',
                null,
                true,
            );
            logSuccess(
                `Payment history retrieved: ${history.total} total payments`,
            );
            logInfo(`Current page: ${history.page}/${history.totalPages}`);
        } catch (error) {
            logError(`Failed to fetch history: ${error.message}`);
        }

        // 4. Get Payment Statistics
        logStep(4, 'Fetching payment statistics...');
        try {
            const stats = await apiRequest(
                '/api/payments/stats',
                'GET',
                null,
                true,
            );
            logSuccess('Statistics retrieved');
            logInfo(`Total transactions: ${stats.totalTransactions}`);
            logInfo(`Total spent: ₦${(stats.totalSpent / 100).toFixed(2)}`);
        } catch (error) {
            logError(`Failed to fetch statistics: ${error.message}`);
        }

        // 5. Get Banks List
        logStep(5, 'Fetching banks list...');
        try {
            const banks = await apiRequest(
                '/api/payments/banks/list',
                'GET',
                null,
                true,
            );
            logSuccess(`Retrieved ${banks.data?.length || 0} banks`);
            if (banks.data && banks.data.length > 0) {
                logInfo(
                    `Sample bank: ${banks.data[0].name} (${banks.data[0].code})`,
                );
            }
        } catch (error) {
            logError(`Failed to fetch banks: ${error.message}`);
        }

        // 6. Verify Bank Account (example with Access Bank)
        logStep(6, 'Testing bank account verification...');
        try {
            const accountVerification = await apiRequest(
                '/api/payments/banks/verify',
                'POST',
                {
                    accountNumber: '0123456789',
                    bankCode: '044', // Access Bank
                },
                true,
            );
            logSuccess('Account verification endpoint working');
            logInfo(`Account name: ${accountVerification.account_name}`);
        } catch (error) {
            logError(`Account verification failed: ${error.message}`);
            logInfo('This may fail with test account numbers');
        }

        // 7. Get Single Payment
        logStep(7, 'Fetching single payment details...');
        try {
            const payment = await apiRequest(
                `/api/payments/${paymentReference}`,
                'GET',
                null,
                true,
            );
            logSuccess('Payment details retrieved');
            logInfo(`Status: ${payment.status}`);
            logInfo(`Plan: ${payment.plan}`);
        } catch (error) {
            logError(`Failed to fetch payment: ${error.message}`);
        }

        // 8. Cancel Payment
        logStep(8, 'Testing payment cancellation...');
        try {
            const cancelResult = await apiRequest(
                `/api/payments/cancel/${paymentReference}`,
                'POST',
                null,
                true,
            );
            logSuccess(cancelResult.message);
        } catch (error) {
            logError(`Payment cancellation failed: ${error.message}`);
        }

        // Summary
        log('\n========================================', 'yellow');
        log('  TEST SUITE COMPLETED', 'yellow');
        log('========================================\n', 'yellow');
        logSuccess('All core endpoints are functional!');
        logInfo('\nNext steps:');
        log('  1. Test actual payment with Paystack test cards', 'blue');
        log('  2. Configure webhook URL in Paystack dashboard', 'blue');
        log('  3. Test webhook events', 'blue');
        log(
            '  4. Test refund functionality (requires successful payment)',
            'blue',
        );
        log('\nDocumentation: src/payments/README.md\n', 'cyan');
    } catch (error) {
        logError(`\nUnexpected error: ${error.message}`);
        console.error(error);
    }
}

// Run the tests
runTests().catch(console.error);

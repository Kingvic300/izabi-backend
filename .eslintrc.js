module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'prettier'],
    extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
    ],
    env: {
        node: true,
        es2023: true,
    },
    rules: {
        // Stop ESLint from pretending it's your compiler
        '@typescript-eslint/explicit-module-boundary-types': 'off',

        // Allow unused things that start with _
        '@typescript-eslint/no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_' },
        ],
    },
};


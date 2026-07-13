/**
 * Formats internal errors into user-friendly messages.
 */
export function formatError(error: any): { message: string; code: string; hint?: string } {
  const code = error?.code || 'UNKNOWN_ERROR';
  const rawMessage = error?.message || '';

  // 1. Database errors
  if (rawMessage.includes('UNIQUE constraint failed')) {
    return {
      code: 'ALREADY_EXISTS',
      message: 'This item already exists.',
      hint: 'Try using a different name or ID.',
    };
  }

  // 2. Network/Auth errors
  if (rawMessage.includes('Network request failed') || rawMessage.includes('ECONNREFUSED')) {
    return {
      code: 'CONNECTION_FAILED',
      message: 'Could not connect to the server. Make sure the app is still running.',
      hint: 'Check your terminal for any crash messages.',
    };
  }

  if (error?.statusCode === 401 || rawMessage.includes('401')) {
    return {
      code: 'UNAUTHORIZED',
      message: 'Your session has expired. Please enter your PIN again.',
    };
  }

  if (error?.statusCode === 429 || rawMessage.includes('429')) {
    return {
      code: 'TOO_MANY_REQUESTS',
      message: 'You are making requests too quickly. Wait a moment and try again.',
    };
  }

  // 3. Auth errors
  if (
    rawMessage.toLowerCase().includes('invalid pin') ||
    rawMessage.toLowerCase().includes('incorrect pin') ||
    rawMessage.toLowerCase().includes('no pin')
  ) {
    return {
      code: 'INVALID_PIN',
      message: 'Incorrect PIN. Please try again.',
    };
  }

  // 4. Null/Undefined protection
  if (rawMessage.includes('undefined') || rawMessage.includes('null')) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  // Default fallback
  return {
    code,
    message: 'Something went wrong. Please try again.',
  };
}

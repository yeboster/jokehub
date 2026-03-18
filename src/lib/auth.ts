import { NextRequest } from 'next/server';

const API_TOKEN = process.env.JOKEHUB_API_TOKEN;

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

export async function verifyApiToken(request: NextRequest): Promise<AuthResult> {
  if (!API_TOKEN) {
    console.error('JOKEHUB_API_TOKEN is not configured');
    return { success: false, error: 'Server configuration error' };
  }

  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return { success: false, error: 'Missing Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  
  if (token !== API_TOKEN) {
    return { success: false, error: 'Invalid token' };
  }

  return { success: true, userId: 'api-user' };
}

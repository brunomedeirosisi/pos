import { typedClient, unwrapOpenApiResponse } from '../api/openapi-client';
import type { AuthUser, LoginCredentials, LoginResponse } from '../types/auth';

export const authService = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> =>
    unwrapOpenApiResponse(typedClient.POST('/api/v1/auth/login', { body: credentials })),
  me: async (): Promise<{ user: AuthUser }> => unwrapOpenApiResponse(typedClient.GET('/api/v1/auth/me')),
};

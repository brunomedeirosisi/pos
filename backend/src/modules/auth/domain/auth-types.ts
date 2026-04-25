export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
  discountLimit: number;
};

export type AuthUserCredentials = AuthenticatedUser & {
  passwordHash: string;
  status: string;
};

export type AccessTokenPayload = {
  sub: string;
  role: string;
};
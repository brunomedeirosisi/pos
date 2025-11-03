export type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  discountLimit: number;
};

export type RoleCreateInput = {
  name: string;
  description?: string | null;
  permissions: string[];
  discountLimit?: number | null;
};

export type RoleUpdateInput = Partial<RoleCreateInput>;

export type UserRoleSummary = {
  id: string;
  name: string;
  permissions: string[];
  discountLimit: number;
};

export type UserStatus = 'active' | 'disabled';

export type User = {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: UserRoleSummary | null;
  permissions: string[];
};

export type UserCreateInput = {
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  status?: UserStatus;
};

export type UserUpdateInput = Partial<{
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  status: UserStatus;
}>;

import { http } from "../api";
import type {
  Role,
  RoleCreateInput,
  RoleUpdateInput,
  User,
  UserCreateInput,
  UserUpdateInput,
  RoleUserSellersPage,
} from "../types/admin";

export const usersService = {
  list: (search?: string) =>
    http.get<User[]>("/users", search ? { search } : undefined),
  get: (id: string) => http.get<User>(`/users/${id}`),
  create: (payload: UserCreateInput) => http.post<User>("/users", payload),
  update: (id: string, payload: UserUpdateInput) =>
    http.patch<User>(`/users/${id}`, payload),
  disable: (id: string) => http.delete<void>(`/users/${id}`),
};

export const rolesService = {
  userSellers: (
    id: string,
    filters: { search?: string; page?: number; limit?: number },
  ) => http.get<RoleUserSellersPage>(`/roles/${id}/users`, filters),
  linkSeller: (roleId: string, userId: string, sellerId: string | null) =>
    http.patch<{ sellerId: string | null }>(
      `/roles/${roleId}/users/${userId}/seller`,
      { sellerId },
    ),
  list: () => http.get<Role[]>("/roles"),
  get: (id: string) => http.get<Role>(`/roles/${id}`),
  create: (payload: RoleCreateInput) => http.post<Role>("/roles", payload),
  update: (id: string, payload: RoleUpdateInput) =>
    http.patch<Role>(`/roles/${id}`, payload),
  remove: (id: string) => http.delete<void>(`/roles/${id}`),
};

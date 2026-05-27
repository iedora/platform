import type { AdminUser, AdminUsersGateway } from '../ports'

export async function getUserById(
  gateway: AdminUsersGateway,
  input: { userId: string },
): Promise<AdminUser | null> {
  return gateway.getUserById({ userId: input.userId })
}

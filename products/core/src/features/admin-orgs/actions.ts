'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { recordAudit } from '@iedora/auth/audit'
import { requireScope } from '../../guards'
import { SCOPES } from '@iedora/auth/scopes'
import { drizzleAdminOrgsGateway } from './adapters/drizzle'
import {
  removeMember as removeMemberUseCase,
  updateMemberRole as updateMemberRoleUseCase,
  cancelInvitation as cancelInvitationUseCase,
} from './use-cases/member-ops'

type ActionResult = { ok: true } | { ok: false; error: string }

export async function removeMemberAction(input: {
  organizationId: string
  memberIdOrEmail: string
}): Promise<ActionResult> {
  const session = await requireScope(SCOPES.core.staff.members.remove)
  const gateway = drizzleAdminOrgsGateway()
  await removeMemberUseCase(gateway, input)
  await recordAudit({
    event: 'member.removed',
    outcome: 'success',
    actor: {
      userId: session.user.id,
      role: session.user.role,
      email: session.user.email,
    },
    target: { orgId: input.organizationId },
    headers: await headers(),
    meta: { memberIdOrEmail: input.memberIdOrEmail },
    important: true,
  })
  revalidatePath(`/core/admin/organizations/${input.organizationId}`)
  return { ok: true }
}

export async function updateMemberRoleAction(input: {
  organizationId: string
  memberId: string
  role: string
}): Promise<ActionResult> {
  const session = await requireScope(SCOPES.core.staff.members.updateRole)
  const gateway = drizzleAdminOrgsGateway()
  await updateMemberRoleUseCase(gateway, input)
  await recordAudit({
    event: 'member.role-changed',
    outcome: 'success',
    actor: {
      userId: session.user.id,
      role: session.user.role,
      email: session.user.email,
    },
    target: { orgId: input.organizationId, userId: input.memberId },
    headers: await headers(),
    meta: { newRole: input.role },
    important: true,
  })
  revalidatePath(`/core/admin/organizations/${input.organizationId}`)
  return { ok: true }
}

export async function cancelInvitationAction(input: {
  organizationId: string
  invitationId: string
}): Promise<ActionResult> {
  const session = await requireScope(SCOPES.core.staff.invitations.cancel)
  const gateway = drizzleAdminOrgsGateway()
  await cancelInvitationUseCase(gateway, { invitationId: input.invitationId })
  await recordAudit({
    event: 'invitation.cancelled',
    outcome: 'success',
    actor: {
      userId: session.user.id,
      role: session.user.role,
      email: session.user.email,
    },
    target: { orgId: input.organizationId },
    headers: await headers(),
    meta: { invitationId: input.invitationId },
    important: true,
  })
  revalidatePath(`/core/admin/organizations/${input.organizationId}`)
  return { ok: true }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailPlus, UserPlus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import { useAuth } from '../../hooks/useAuth'
import {
  addOrganizationMember,
  getManageableOrganizations,
  getOrganizationMembers,
} from '../../services/organizations/organizationMembershipService'

export function OrganizationMembersPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [successMessage, setSuccessMessage] = useState('')
  const organizations = useQuery({
    queryKey: ['manageable-organizations'],
    queryFn: getManageableOrganizations,
    enabled: Boolean(user),
    retry: false,
  })
  const activeOrganizationId = organizations.data?.some((organization) => organization.id === selectedOrganizationId)
    ? selectedOrganizationId
    : organizations.data?.[0]?.id ?? ''
  const selectedOrganization = organizations.data?.find((organization) => organization.id === activeOrganizationId)
  const isPlatformAdmin = user?.isPlatformAdmin === true
  const isOrganizationAdmin = selectedOrganization?.role === 'owner' || selectedOrganization?.role === 'admin'
  const members = useQuery({
    queryKey: ['organization-members', activeOrganizationId],
    queryFn: () => getOrganizationMembers(activeOrganizationId),
    enabled: Boolean(activeOrganizationId && (isPlatformAdmin || isOrganizationAdmin)),
    retry: false,
  })
  const addMember = useMutation({
    mutationFn: (mode: 'assign' | 'invite') => addOrganizationMember({
      organizationId: activeOrganizationId,
      email,
      mode,
      role,
    }),
    onSuccess: async (member) => {
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: ['organization-members', activeOrganizationId] })
      await queryClient.invalidateQueries({ queryKey: ['manageable-organizations'] })
      setSuccessMessage(member.invited
        ? `Convite enviado para ${member.email}; a conta foi vinculada à organização.`
        : `A conta ${member.email} foi vinculada à organização.`)
    },
  })

  if (!user) return null
  if (organizations.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usuários da organização</CardTitle>
          <CardDescription>Convide membros ou atribua contas existentes às organizações que você administra.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200 bg-red-50 text-red-800" role="alert">
            {organizations.error instanceof Error ? organizations.error.message : 'Não foi possível carregar as organizações.'}
          </Alert>
        </CardContent>
      </Card>
    )
  }
  if (organizations.isLoading) return <Skeleton className="h-44 w-full rounded-xl" />
  if (!organizations.data?.length) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSuccessMessage('')
    addMember.mutate(isPlatformAdmin ? 'assign' : 'invite')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários da organização</CardTitle>
        <CardDescription>
          {isPlatformAdmin
            ? 'Vincule contas já cadastradas a qualquer organização e escolha o nível de acesso.'
            : 'Envie um convite por e-mail. O destinatário será vinculado como membro automaticamente.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {organizations.data.length > 1 ? (
          <label className="block space-y-2 text-sm font-medium text-slate-700" htmlFor="membership-organization">
            Organização
            <select
              id="membership-organization"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              value={activeOrganizationId}
              onChange={(event) => {
                setSelectedOrganizationId(event.target.value)
                setSuccessMessage('')
              }}
            >
              {organizations.data.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm font-medium text-slate-700">{organizations.data[0].name}</p>
        )}

        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700" htmlFor="organization-member-email">
            E-mail da conta
            <Input
              id="organization-member-email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="pessoa@empresa.com.br"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {isPlatformAdmin ? (
            <label className="space-y-2 text-sm font-medium text-slate-700" htmlFor="organization-member-role">
              Acesso
              <select
                id="organization-member-role"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                value={role}
                onChange={(event) => setRole(event.target.value as 'admin' | 'member')}
              >
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          ) : null}
          <Button type="submit" disabled={addMember.isPending || !activeOrganizationId}>
            {isPlatformAdmin
              ? <><UserPlus aria-hidden="true" className="h-4 w-4" />{addMember.isPending ? 'Vinculando…' : 'Vincular conta existente'}</>
              : <><MailPlus aria-hidden="true" className="h-4 w-4" />{addMember.isPending ? 'Enviando convite…' : 'Convidar como membro'}</>}
          </Button>
        </form>

        {addMember.isError ? (
          <Alert className="border-red-200 bg-red-50 text-red-800" role="alert">
            {addMember.error instanceof Error ? addMember.error.message : 'Não foi possível vincular o usuário.'}
          </Alert>
        ) : null}
        {successMessage ? (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800" role="status">{successMessage}</Alert>
        ) : null}

        <section className="border-t border-slate-200 pt-5" aria-labelledby="organization-member-list-title">
          <h3 id="organization-member-list-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users aria-hidden="true" className="h-4 w-4 text-sky-700" />
            Pessoas vinculadas
          </h3>
          {members.isLoading ? <Skeleton className="mt-3 h-16 w-full rounded-lg" /> : null}
          {members.isError ? (
            <Alert className="mt-3 border-red-200 bg-red-50 text-red-800" role="alert">
              {members.error instanceof Error ? members.error.message : 'Não foi possível listar os usuários.'}
            </Alert>
          ) : null}
          {members.data?.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              Ainda não há usuários vinculados além de você. Cadastre o e-mail acima para começar.
            </p>
          ) : null}
          {members.data?.length ? (
            <ul className="mt-3 divide-y divide-slate-200">
              {members.data.map((member) => (
                <li key={member.user_id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{member.full_name || member.email}</p>
                    <p className="break-all text-xs text-slate-600">{member.email}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-600">
                    {member.role === 'owner' ? 'Proprietário' : member.role === 'admin' ? 'Administrador' : 'Membro'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </CardContent>
    </Card>
  )
}

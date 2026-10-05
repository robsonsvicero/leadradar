import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Mail, MessageCircle, MapPin, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import { useAuth } from '../../hooks/useAuth'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'
import {
  createManagedOrganization,
  getManagedOrganizations,
  type CreateManagedOrganizationInput,
} from '../../services/organizations/organizationAdminService'

const initialForm: CreateManagedOrganizationInput = {
  name: '',
  address: '',
  email: '',
  whatsapp: '',
}

export function OrganizationManagementPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(initialForm)
  const [successMessage, setSuccessMessage] = useState('')
  const organizations = useQuery({
    queryKey: ['managed-organizations'],
    queryFn: getManagedOrganizations,
    enabled: user?.isPlatformAdmin === true && !prospectingMockMode,
    retry: false,
  })
  const createOrganization = useMutation({
    mutationFn: createManagedOrganization,
    onSuccess: async (organization) => {
      setForm(initialForm)
      setSuccessMessage(`Organização cadastrada. O convite para ${organization.email} foi enviado para definir a senha.`)
      await queryClient.invalidateQueries({ queryKey: ['managed-organizations'] })
    },
    onError: () => setSuccessMessage(''),
  })

  if (!user?.isPlatformAdmin) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSuccessMessage('')
    createOrganization.mutate(form)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organizações e acessos</CardTitle>
        <CardDescription>
          Cadastre uma organização e convide o contato principal. O convite por e-mail permite que essa pessoa defina a própria senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700" htmlFor="managed-organization-name">
              Nome da organização
              <Input
                id="managed-organization-name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="organization"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex.: Studio Nova"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700" htmlFor="managed-organization-email">
              E-mail do administrador
              <Input
                id="managed-organization-email"
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="admin@empresa.com.br"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2" htmlFor="managed-organization-address">
              Endereço
              <Input
                id="managed-organization-address"
                required
                minLength={3}
                maxLength={240}
                autoComplete="street-address"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder="Rua, número, cidade e estado"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700" htmlFor="managed-organization-whatsapp">
              WhatsApp de contato
              <Input
                id="managed-organization-whatsapp"
                required
                type="tel"
                minLength={8}
                maxLength={32}
                autoComplete="tel"
                value={form.whatsapp}
                onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
                placeholder="+55 (11) 99999-9999"
              />
            </label>
          </div>

          {createOrganization.isError ? (
            <Alert className="border-red-200 bg-red-50 text-red-800" role="alert">
              {createOrganization.error instanceof Error ? createOrganization.error.message : 'Não foi possível cadastrar a organização.'}
            </Alert>
          ) : null}
          {successMessage ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800" role="status">
              {successMessage}
            </Alert>
          ) : null}
          <Button type="submit" disabled={createOrganization.isPending}>
            <Send aria-hidden="true" className="h-4 w-4" />
            {createOrganization.isPending ? 'Cadastrando e enviando convite...' : 'Cadastrar e enviar convite'}
          </Button>
        </form>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Organizações cadastradas</h3>
          {organizations.isLoading ? <Skeleton className="mt-3 h-24 w-full rounded-lg" /> : null}
          {organizations.isError ? (
            <Alert className="mt-3 border-red-200 bg-red-50 text-red-800" role="alert">
              {organizations.error instanceof Error ? organizations.error.message : 'Não foi possível carregar as organizações.'}
            </Alert>
          ) : null}
          {organizations.data?.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Nenhuma organização cadastrada até o momento.</p>
          ) : null}
          {organizations.data?.length ? (
            <ul className="mt-3 divide-y divide-slate-200">
              {organizations.data.map((organization) => (
                <li key={organization.id} className="grid gap-2 py-4 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-700" />
                      <span className="truncate">{organization.name}</span>
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-slate-600">
                      <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{organization.address}</span>
                    </p>
                  </div>
                  <div className="space-y-1 text-slate-600 md:text-right">
                    <p className="flex items-center gap-2 break-all md:justify-end">
                      <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {organization.email}
                    </p>
                    <p className="flex items-center gap-2 md:justify-end">
                      <MessageCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {organization.whatsapp}
                    </p>
                    <p className="text-xs text-slate-500">
                      {organization.admin_invite_sent_at ? 'Convite enviado' : 'Convite pendente'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

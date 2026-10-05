import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Check, CircleAlert, Clock3, Pencil, Plus, Radar, Save, ShieldCheck, ToggleLeft, ToggleRight, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { prospectingMockMode } from '../../services/prospecting/prospectingService'
import {
  createOrganization,
  deleteOrganizationService,
  getAIConfigurationOrganizations,
  getOrganizationAISettings,
  saveOrganizationAIProfile,
  saveOrganizationICP,
  saveOrganizationService,
  setOrganizationServiceActive,
  type OrganizationAIProfile,
  type OrganizationAISettings,
  type OrganizationICPSettings,
  type OrganizationService,
  type SaveProfileInput,
  type SaveServiceInput,
} from '../../services/ai/organizationAISettingsService'
import { defaultActionScoreWeights, type ActionScoreWeights } from '../../services/ai/scoring'
import { useAuth } from '../../hooks/useAuth'
import { decideUserApproval, getPendingUsers } from '../../services/auth/userApprovalService'
import { OrganizationMembersPanel } from './organization-members-panel'
import { OrganizationManagementPanel } from './organization-management-panel'
import {
  defaultAutomaticProspectingSettings,
  getAutomaticProspectingSettings,
  saveAutomaticProspectingSettings,
  type AutomaticProspectingSettings,
} from '../../services/prospecting/automaticProspectingService'

const LIST_FIELD_HINT = 'Separe os itens por vírgula ou linha.'

function emptyICP(): Omit<OrganizationICPSettings, 'id' | 'organization_id'> {
  return {
    name: 'ICP principal',
    description: null,
    target_segments: [],
    target_locations: [],
    target_company_sizes: [],
    preferred_services: [],
    minimum_score: 0,
    ideal_signals: [],
    negative_signals: [],
    weights: { actionScore: { ...defaultActionScoreWeights } },
    active: true,
  }
}

const actionScoreWeightFields: Array<{ key: keyof ActionScoreWeights; label: string }> = [
  { key: 'icpFit', label: 'Aderência ao ICP' },
  { key: 'opportunity', label: 'Oportunidade técnica' },
  { key: 'buyingSignals', label: 'Sinais comerciais' },
  { key: 'urgency', label: 'Momento de compra' },
  { key: 'confidence', label: 'Confiança dos dados' },
  { key: 'reachability', label: 'Contato disponível' },
]

function configuredActionWeights(weights: Record<string, unknown>): ActionScoreWeights {
  const nested = weights.actionScore
  const source = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : weights
  return Object.fromEntries(actionScoreWeightFields.map(({ key }) => {
    const value = Number(source[key])
    const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : defaultActionScoreWeights[key]
    return [key, safeValue]
  })) as ActionScoreWeights
}

function emptyProfile(): Omit<OrganizationAIProfile, 'id' | 'organization_id'> {
  return {
    company_name: null,
    company_description: null,
    target_audience: null,
    tone: 'consultivo',
    style: 'direto e humano',
    sales_method: null,
    forbidden_phrases: [],
    preferred_phrases: [],
    signature: null,
  }
}

function toList(value: string) {
  return [...new Set(value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean))]
}

function listValue(value: string[]) {
  return value.join(', ')
}

export function SettingsPage() {
  const { user } = useAuth()
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [newOrganizationName, setNewOrganizationName] = useState('')
  const [newOrganizationSlug, setNewOrganizationSlug] = useState('')
  const organizations = useQuery({
    queryKey: ['ai-configuration-organizations'],
    queryFn: getAIConfigurationOrganizations,
    enabled: !prospectingMockMode,
    retry: false,
  })
  const selectedOrganization = organizations.data?.find((item) => item.id === selectedOrganizationId)
    ?? organizations.data?.[0]

  const createOrganizationMutation = useMutation({
    mutationFn: () => createOrganization({
      name: newOrganizationName,
      slug: newOrganizationSlug,
    }),
    onSuccess: async (organization) => {
      setSelectedOrganizationId(organization.id)
      setNewOrganizationName('')
      setNewOrganizationSlug('')
      await organizations.refetch()
    },
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h2 className="text-3xl font-semibold text-foreground">Configurações comerciais</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Defina o que você oferece, quais empresas quer atender e como a IA deve representar sua abordagem.
        </p>
      </header>

      {user?.isPlatformAdmin ? <UserApprovalsCard /> : null}
      {user?.isPlatformAdmin ? <OrganizationManagementPanel /> : null}
      <OrganizationMembersPanel />

      <Card>
        <CardHeader>
          <CardTitle>Organização</CardTitle>
          <CardDescription>Somente proprietários e administradores podem alterar essas configurações.</CardDescription>
        </CardHeader>
        <CardContent>
          {prospectingMockMode ? (
            <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
              As configurações comerciais são persistidas no Supabase e ficam indisponíveis no modo de demonstração.
              Desative o modo demo para editar dados reais.
            </Alert>
          ) : null}
          {!prospectingMockMode && organizations.isLoading ? <Skeleton className="h-11 w-full" /> : null}
          {!prospectingMockMode && organizations.isError ? (
            <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
              {organizations.error.message}
            </Alert>
          ) : null}
          {!prospectingMockMode && organizations.data?.length === 0 ? (
            <div className="space-y-4 rounded-xl border border-warm/30 bg-warm/10 p-4 text-warm-foreground">
              {user?.isPlatformAdmin ? (
                <>
                  <p>
                    Nenhuma organização com permissão de proprietário ou administrador foi encontrada para sua conta.
                    Crie um workspace interno para ativar prospecção e configurações comerciais.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-medium text-foreground">
                      Nome do workspace interno
                      <input
                        className="mt-1 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={newOrganizationName}
                        onChange={(event) => setNewOrganizationName(event.target.value)}
                        placeholder="Ex.: Minha empresa"
                      />
                    </label>
                    <label className="text-sm font-medium text-foreground">
                      Slug
                      <input
                        className="mt-1 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={newOrganizationSlug}
                        onChange={(event) => setNewOrganizationSlug(event.target.value)}
                        placeholder="minha-empresa"
                      />
                    </label>
                  </div>
                  {createOrganizationMutation.isError ? (
                    <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
                      {createOrganizationMutation.error instanceof Error ? createOrganizationMutation.error.message : 'Não foi possível criar o workspace.'}
                    </Alert>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => void createOrganizationMutation.mutateAsync()}
                    disabled={createOrganizationMutation.isPending || newOrganizationName.trim().length < 2}
                  >
                    {createOrganizationMutation.isPending ? 'Criando...' : 'Criar workspace interno'}
                  </Button>
                </>
              ) : (
                <p>
                  Sua conta ainda não está associada a uma organização. Peça ao administrador da plataforma para cadastrar
                  sua organização e enviar um convite para este e-mail.
                </p>
              )}
            </div>
          ) : null}
          {!prospectingMockMode && organizations.data && organizations.data.length > 0 ? (
            <label className="block max-w-xl text-sm font-medium text-foreground">
              Workspace
              <select
                className="mt-1 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedOrganization?.id ?? ''}
                onChange={(event) => setSelectedOrganizationId(event.target.value)}
              >
                {organizations.data.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </CardContent>
      </Card>

      {selectedOrganization ? (
        <OrganizationAIConfiguration
          key={selectedOrganization.id}
          organizationId={selectedOrganization.id}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Segurança e isolamento</CardTitle>
          <CardDescription>As políticas do banco limitam a configuração à organização correta.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-3 rounded-lg bg-success/10 p-4 text-sm text-success-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          Somente owner/admin pode gravar serviços, ICP e perfil da organização. Membros podem consultar os dados autorizados;
          as Edge Functions validam novamente a associação antes de usar essas informações.
        </CardContent>
      </Card>
    </div>
  )
}

function UserApprovalsCard() {
  const queryClient = useQueryClient()
  const pendingUsers = useQuery({
    queryKey: ['pending-user-approvals'],
    queryFn: getPendingUsers,
    retry: false,
  })
  const decision = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'approved' | 'rejected' }) =>
      decideUserApproval(userId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pending-user-approvals'] })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprovação de novos usuários</CardTitle>
        <CardDescription>Revise os cadastros antes de liberar o acesso ao aplicativo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingUsers.isLoading ? <Skeleton className="h-16 w-full" /> : null}
        {pendingUsers.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
            {pendingUsers.error.message}
          </Alert>
        ) : null}
        {decision.isError ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
            {decision.error.message}
          </Alert>
        ) : null}
        {pendingUsers.data?.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Não há cadastros aguardando aprovação.</p>
        ) : null}
        {pendingUsers.data?.map((pendingUser) => (
          <div
            key={pendingUser.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{pendingUser.full_name || 'Nome não informado'}</p>
              <p className="truncate text-sm text-muted-foreground">{pendingUser.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cadastro em {new Date(pendingUser.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                onClick={() => decision.mutate({ userId: pendingUser.id, status: 'approved' })}
                disabled={decision.isPending}
              >
                <UserCheck aria-hidden="true" className="h-4 w-4" />
                Aprovar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => decision.mutate({ userId: pendingUser.id, status: 'rejected' })}
                disabled={decision.isPending}
              >
                <UserX aria-hidden="true" className="h-4 w-4" />
                Recusar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function OrganizationAIConfiguration({ organizationId }: { organizationId: string }) {
  const settings = useQuery({
    queryKey: ['organization-ai-settings', organizationId],
    queryFn: () => getOrganizationAISettings(organizationId),
    retry: false,
  })

  if (settings.isLoading) return <Skeleton className="h-80 w-full rounded-xl" />
  if (settings.isError) {
    return <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{settings.error.message}</Alert>
  }
  if (!settings.data) return null

  return (
    <div className="space-y-6">
      <ICPSettingsCard organizationId={organizationId} initial={settings.data.icp} />
      <AutomaticProspectingCard organizationId={organizationId} icp={settings.data.icp} />
      <ServicesSettingsCard organizationId={organizationId} initial={settings.data.services} />
      <VoiceSettingsCard organizationId={organizationId} initial={settings.data.profile} />
    </div>
  )
}

function AutomaticProspectingCard({
  organizationId,
  icp,
}: {
  organizationId: string
  icp: OrganizationAISettings['icp']
}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['automatic-prospecting-settings', organizationId],
    queryFn: () => getAutomaticProspectingSettings(organizationId),
    retry: false,
  })
  const [formOverride, setFormOverride] = useState<AutomaticProspectingSettings | null>(null)
  const form = formOverride ?? query.data?.settings ?? defaultAutomaticProspectingSettings
  const hasActiveTargets = Boolean(icp?.active && icp.target_segments.length && icp.target_locations.length)

  const updateForm = (values: Partial<AutomaticProspectingSettings>) => {
    setFormOverride((current) => ({ ...(current ?? query.data?.settings ?? defaultAutomaticProspectingSettings), ...values }))
  }

  const save = useMutation({
    mutationFn: () => saveAutomaticProspectingSettings(organizationId, form),
    onSuccess: async (settings) => {
      setFormOverride(settings)
      await queryClient.invalidateQueries({ queryKey: ['automatic-prospecting-settings', organizationId] })
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save.mutate()
  }

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-xl" />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prospecção automática</CardTitle>
        <CardDescription>
          Agende uma busca diária usando os segmentos e localidades do ICP ativo. Os contatos continuam sob revisão humana.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <Alert className="mb-4 border-destructive/30 bg-destructive/10 text-destructive">{query.error.message}</Alert>
        ) : null}
        <form className="space-y-5" onSubmit={onSubmit}>
          <label className="flex items-start gap-3 rounded-lg border border-border p-4">
            <input
              aria-label="Ativar prospecção automática"
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => updateForm({ enabled: event.target.checked })}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Radar aria-hidden="true" className="h-4 w-4 text-primary" />
                Ativar busca automática diária
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                O agendador cria um job de prospecção; nenhuma mensagem é enviada automaticamente.
              </span>
            </span>
          </label>

          {!hasActiveTargets ? (
            <Alert className="border-warm/30 bg-warm/10 text-warm-foreground">
              Para habilitar a busca, salve um ICP ativo com pelo menos um segmento B2B e uma localização.
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-medium text-foreground">
              <span className="flex items-center gap-2">
                <Clock3 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                Horário diário
              </span>
              <input
                aria-label="Horário diário"
                type="time"
                required
                value={form.run_time}
                onChange={(event) => updateForm({ run_time: event.target.value })}
                className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="mt-1 block text-xs text-muted-foreground">Horário de Brasília (America/Sao_Paulo)</span>
            </label>
            <label className="text-sm font-medium text-foreground">
              Empresas por dia
              <input
                aria-label="Empresas por dia"
                type="number"
                min={1}
                max={100}
                step={1}
                required
                value={form.leads_per_day}
                onChange={(event) => updateForm({ leads_per_day: Number(event.target.value) })}
                className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="mt-1 block text-xs text-muted-foreground">De 1 a 100 por busca</span>
            </label>
            <label className="text-sm font-medium text-foreground">
              Score mínimo para salvar
              <input
                aria-label="Score mínimo para salvar"
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={form.minimum_score}
                onChange={(event) => updateForm({ minimum_score: Number(event.target.value) })}
                className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="mt-1 block text-xs text-muted-foreground">Empresas abaixo do corte não viram leads</span>
            </label>
            <label className="text-sm font-medium text-foreground">
              Score para alertar
              <input
                aria-label="Score para alertar"
                type="number"
                min={form.minimum_score}
                max={100}
                step={1}
                required
                value={form.alert_score}
                onChange={(event) => updateForm({ alert_score: Number(event.target.value) })}
                className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <BellRing aria-hidden="true" className="h-3.5 w-3.5" />Aviso no sino de notificações
              </span>
            </label>
          </div>

          {query.data?.lastRun ? (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium text-foreground">
                Última tentativa: {new Date(query.data.lastRun.started_at).toLocaleString('pt-BR')}
                {' · '}
                {query.data.lastRun.status === 'scheduled'
                  ? 'job criado'
                  : query.data.lastRun.status === 'running'
                    ? 'em andamento'
                    : 'falhou'}
              </p>
              {query.data.lastRun.error_message ? (
                <p className="mt-1 text-destructive">{query.data.lastRun.error_message}</p>
              ) : null}
            </div>
          ) : null}

          {save.isError ? (
            <Alert className="border-destructive/30 bg-destructive/10 text-destructive">{save.error.message}</Alert>
          ) : null}
          {save.isSuccess ? (
            <Alert className="border-success/30 bg-success/10 text-success-foreground">Configuração da prospecção automática salva.</Alert>
          ) : null}
          <Button type="submit" disabled={save.isPending || query.isError}>
            <Save aria-hidden="true" className="h-4 w-4" />
            {save.isPending ? 'Salvando…' : 'Salvar automação'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ICPSettingsCard({
  organizationId,
  initial,
}: {
  organizationId: string
  initial: OrganizationAISettings['icp']
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => {
    const settings = initial ?? emptyICP()
    return { ...settings, weights: { actionScore: configuredActionWeights(settings.weights ?? {}) } }
  })
  const actionWeights = configuredActionWeights(form.weights)
  const weightsTotal = Object.values(actionWeights).reduce((total, weight) => total + weight, 0)
  const save = useMutation({
    mutationFn: () => saveOrganizationICP(organizationId, form),
    onSuccess: async (saved) => {
      setForm({ ...saved, weights: { actionScore: configuredActionWeights(saved.weights ?? {}) } })
      await queryClient.invalidateQueries({ queryKey: ['organization-ai-settings', organizationId] })
      await queryClient.invalidateQueries({ queryKey: ['ai-analysis'] })
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil de cliente ideal (ICP)</CardTitle>
        <CardDescription>Configure somente compradores B2B — empresas ou profissionais. Os critérios qualificam aderência, mas não provam intenção de compra.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome do perfil" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required maxLength={120} />
            <TextField label="Score mínimo (0–100)" type="number" min={0} max={100} value={String(form.minimum_score)} onChange={(value) => setForm((current) => ({ ...current, minimum_score: Number(value) }))} required />
          </div>
          <TextAreaField label="Descrição" value={form.description ?? ''} onChange={(value) => setForm((current) => ({ ...current, description: value || null }))} maxLength={800} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <ListField label="Segmentos prioritários (B2B)" value={form.target_segments} onChange={(value) => setForm((current) => ({ ...current, target_segments: toList(value) }))} />
              <p className="mt-1 text-xs text-muted-foreground">Ex.: academias, clínicas ou empresas. Não informe consumidores finais.</p>
            </div>
            <ListField label="Localizações prioritárias" value={form.target_locations} onChange={(value) => setForm((current) => ({ ...current, target_locations: toList(value) }))} />
            <ListField label="Porte desejado" value={form.target_company_sizes} onChange={(value) => setForm((current) => ({ ...current, target_company_sizes: toList(value) }))} />
            <ListField label="Serviços prioritários" value={form.preferred_services} onChange={(value) => setForm((current) => ({ ...current, preferred_services: toList(value) }))} />
            <ListField label="Sinais desejados" value={form.ideal_signals} onChange={(value) => setForm((current) => ({ ...current, ideal_signals: toList(value) }))} />
            <ListField label="Sinais de desqualificação" value={form.negative_signals} onChange={(value) => setForm((current) => ({ ...current, negative_signals: toList(value) }))} />
          </div>
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <h3 className="font-medium text-foreground">Pesos do Action Score</h3>
              <p className="mt-1 text-xs text-muted-foreground">Os pesos são normalizados no cálculo; pelo menos um precisa ser maior que zero. O score mínimo sinaliza perfis abaixo do corte, mas não remove leads automaticamente.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {actionScoreWeightFields.map(({ key, label }) => (
                <TextField
                  key={key}
                  label={`${label} (0–100)`}
                  type="number"
                  min={0}
                  max={100}
                  value={String(actionWeights[key])}
                  onChange={(value) => setForm((current) => ({
                    ...current,
                    weights: {
                      ...current.weights,
                      actionScore: { ...configuredActionWeights(current.weights), [key]: Number(value) },
                    },
                  }))}
                />
              ))}
            </div>
          </div>
          <SaveFeedback error={save.error?.message} success={save.isSuccess ? 'ICP salvo. Novas análises usarão estes critérios.' : null} />
          <Button type="submit" disabled={save.isPending || !form.name.trim() || weightsTotal === 0}>
            <Save aria-hidden="true" className="h-4 w-4" />{save.isPending ? 'Salvando…' : 'Salvar ICP'}
          </Button>
          {weightsTotal === 0 ? <p className="text-sm text-warm-foreground">Defina pelo menos um peso para calcular o Action Score.</p> : null}
        </form>
      </CardContent>
    </Card>
  )
}

type ServiceFormState = {
  id?: string
  name: string
  description: string
  targetSegments: string
  sellingPoints: string
}

function emptyServiceForm(): ServiceFormState {
  return { name: '', description: '', targetSegments: '', sellingPoints: '' }
}

function serviceInput(form: ServiceFormState): SaveServiceInput {
  return {
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(),
    description: form.description.trim() || null,
    target_segments: toList(form.targetSegments),
    selling_points: toList(form.sellingPoints),
  }
}

function ServicesSettingsCard({
  organizationId,
  initial,
}: {
  organizationId: string
  initial: OrganizationService[]
}) {
  const queryClient = useQueryClient()
  const [services, setServices] = useState(initial)
  const [form, setForm] = useState<ServiceFormState>(emptyServiceForm)
  const [pendingDeletion, setPendingDeletion] = useState<OrganizationService | null>(null)
  const save = useMutation({
    mutationFn: () => saveOrganizationService(organizationId, serviceInput(form)),
    onSuccess: async (saved) => {
      setServices((current) => current.some((service) => service.id === saved.id)
        ? current.map((service) => service.id === saved.id ? saved : service)
        : [...current, saved].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')))
      setForm(emptyServiceForm())
      await queryClient.invalidateQueries({ queryKey: ['organization-ai-settings', organizationId] })
    },
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setOrganizationServiceActive(organizationId, id, active),
    onSuccess: async (saved) => {
      setServices((current) => current.map((service) => service.id === saved.id ? saved : service))
      await queryClient.invalidateQueries({ queryKey: ['organization-ai-settings', organizationId] })
    },
  })
  const remove = useMutation({
    mutationFn: (serviceId: string) => deleteOrganizationService(organizationId, serviceId),
    onSuccess: async (_deleted, serviceId) => {
      setServices((current) => current.filter((service) => service.id !== serviceId))
      setForm((current) => current.id === serviceId ? emptyServiceForm() : current)
      setPendingDeletion(null)
      await queryClient.invalidateQueries({ queryKey: ['organization-ai-settings', organizationId] })
      await queryClient.invalidateQueries({ queryKey: ['ai-analysis'] })
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Serviços oferecidos</CardTitle>
        <CardDescription>Cadastre em “Segmentos atendidos” as empresas ou profissionais B2B compatíveis com cada serviço. A aderência não representa intenção de compra.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-4 rounded-lg bg-muted p-4" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium text-foreground">{form.id ? 'Editar serviço' : 'Adicionar serviço'}</h3>
            {form.id ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(emptyServiceForm())}>
                <X aria-hidden="true" className="h-4 w-4" />Cancelar edição
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome do serviço" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} required maxLength={120} />
            <TextField label="Descrição" value={form.description} onChange={(description) => setForm((current) => ({ ...current, description }))} maxLength={500} />
            <ListField label="Segmentos atendidos (B2B)" value={toList(form.targetSegments)} onChange={(value) => setForm((current) => ({ ...current, targetSegments: value }))} />
            <ListField label="Pontos de venda" value={toList(form.sellingPoints)} onChange={(value) => setForm((current) => ({ ...current, sellingPoints: value }))} />
          </div>
          <Button type="submit" disabled={save.isPending || !form.name.trim()}>
            {form.id ? <Save aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            {save.isPending ? 'Salvando…' : form.id ? 'Salvar serviço' : 'Adicionar serviço'}
          </Button>
          <SaveFeedback error={save.error?.message} success={save.isSuccess ? 'Serviço salvo.' : null} />
        </form>

        {services.length ? (
          <ul className="divide-y divide-slate-200">
            {services.map((service) => (
              <li key={service.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{service.name}</h3>
                    <span className={service.active ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-foreground' : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground'}>
                      {service.active ? 'Ativo para recomendações' : 'Pausado'}
                    </span>
                  </div>
                  {service.description ? <p className="mt-1 text-sm text-muted-foreground">{service.description}</p> : null}
                  {service.selling_points.length ? <p className="mt-1 text-xs text-muted-foreground">Diferenciais: {service.selling_points.join(' · ')}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm({
                    id: service.id,
                    name: service.name,
                    description: service.description ?? '',
                    targetSegments: listValue(service.target_segments),
                    sellingPoints: listValue(service.selling_points),
                  })}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />Editar
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: service.id, active: !service.active })}>
                    {service.active ? <ToggleLeft aria-hidden="true" className="h-4 w-4" /> : <ToggleRight aria-hidden="true" className="h-4 w-4" />}
                    {service.active ? 'Pausar' : 'Ativar'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`Excluir serviço ${service.name}`}
                    onClick={() => {
                      remove.reset()
                      setPendingDeletion(service)
                    }}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum serviço cadastrado. Adicione uma oferta para que a IA possa sugeri-la sem inventar o que você vende.
          </p>
        )}
        {toggle.error ? <SaveFeedback error={toggle.error.message} /> : null}
      </CardContent>
      {pendingDeletion ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/40 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-service-title"
            aria-describedby="delete-service-description"
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 id="delete-service-title" className="text-lg font-semibold text-foreground">Excluir este serviço?</h3>
            <p id="delete-service-description" className="mt-2 text-sm leading-6 text-muted-foreground">
              “{pendingDeletion.name}” será removido dos serviços oferecidos e deixará de ser considerado em novas recomendações. Esta ação não pode ser desfeita.
            </p>
            {remove.isError ? (
              <Alert className="mt-4 border-destructive/30 bg-destructive/10 text-destructive">
                {remove.error instanceof Error ? remove.error.message : 'Não foi possível excluir o serviço.'}
              </Alert>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  setPendingDeletion(null)
                  remove.reset()
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(pendingDeletion.id)}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {remove.isPending ? 'Excluindo…' : 'Excluir serviço'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </Card>
  )
}

function VoiceSettingsCard({
  organizationId,
  initial,
}: {
  organizationId: string
  initial: OrganizationAIProfile | null
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => initial ?? emptyProfile())
  const save = useMutation({
    mutationFn: () => {
      const input: SaveProfileInput = {
        ...form,
        company_name: form.company_name?.trim() || null,
        company_description: form.company_description?.trim() || null,
        target_audience: form.target_audience?.trim() || null,
        sales_method: form.sales_method?.trim() || null,
        signature: form.signature?.trim() || null,
      }
      return saveOrganizationAIProfile(organizationId, input)
    },
    onSuccess: async (saved) => {
      setForm(saved)
      await queryClient.invalidateQueries({ queryKey: ['organization-ai-settings', organizationId] })
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voz comercial da IA</CardTitle>
        <CardDescription>Estas preferências orientam análises e rascunhos. Não autorizam envio automático.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome profissional ou da empresa" value={form.company_name ?? ''} onChange={(value) => setForm((current) => ({ ...current, company_name: value || null }))} maxLength={120} />
            <TextField label="Público-alvo" value={form.target_audience ?? ''} onChange={(value) => setForm((current) => ({ ...current, target_audience: value || null }))} maxLength={250} />
            <TextField label="Tom" value={form.tone} onChange={(value) => setForm((current) => ({ ...current, tone: value }))} required maxLength={80} />
            <TextField label="Estilo de escrita" value={form.style} onChange={(value) => setForm((current) => ({ ...current, style: value }))} required maxLength={80} />
            <TextField label="Método comercial" value={form.sales_method ?? ''} onChange={(value) => setForm((current) => ({ ...current, sales_method: value || null }))} maxLength={300} />
            <TextField label="Assinatura" value={form.signature ?? ''} onChange={(value) => setForm((current) => ({ ...current, signature: value || null }))} maxLength={160} />
          </div>
          <TextAreaField label="Descrição do negócio" value={form.company_description ?? ''} onChange={(value) => setForm((current) => ({ ...current, company_description: value || null }))} maxLength={800} />
          <div className="grid gap-4 sm:grid-cols-2">
            <ListField label="Frases preferidas" value={form.preferred_phrases} onChange={(value) => setForm((current) => ({ ...current, preferred_phrases: toList(value) }))} />
            <ListField label="Frases proibidas" value={form.forbidden_phrases} onChange={(value) => setForm((current) => ({ ...current, forbidden_phrases: toList(value) }))} />
          </div>
          <SaveFeedback error={save.error?.message} success={save.isSuccess ? 'Perfil comercial salvo.' : null} />
          <Button type="submit" disabled={save.isPending || !form.tone.trim() || !form.style.trim()}>
            <Save aria-hidden="true" className="h-4 w-4" />{save.isPending ? 'Salvando…' : 'Salvar perfil de voz'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function TextField({
  label,
  value,
  onChange,
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange'>) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      <input
        className="mt-1 h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'>) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      <textarea
        className="mt-1 min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  )
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (value: string) => void
}) {
  return (
    <TextAreaField
      label={label}
      value={listValue(value)}
      onChange={onChange}
      placeholder={LIST_FIELD_HINT}
      maxLength={1000}
    />
  )
}

function SaveFeedback({ error, success }: { error?: string; success?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}
      </p>
    )
  }
  if (success) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-success-foreground">
        <Check aria-hidden="true" className="h-4 w-4" />{success}
      </p>
    )
  }
  return null
}

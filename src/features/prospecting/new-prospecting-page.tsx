import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronDown, Hash, LoaderCircle, MapPin, Plus, Search, Sparkles, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../hooks/useAuth'
import { prospectingConfig } from '../../config/prospecting'
import {
  createProspectingJob,
  getProspectingOrganizations,
  prospectingMockMode,
  type ProspectingInput,
} from '../../services/prospecting/prospectingService'

const schema = z.object({
  organizationId: z.string().min(1, 'Selecione uma organização.'),
  segment: z.string().trim().min(2, 'Informe um segmento.').max(120),
  location: z.string().trim().min(2, 'Informe uma localização.').max(120),
  targetQuantity: z.coerce.number().int().min(prospectingConfig.minCompaniesPerJob, 'A quantidade mínima é 1.').max(prospectingConfig.maxCompaniesPerJob, `O limite é ${prospectingConfig.maxCompaniesPerJob} empresas por prospecção.`),
  keywords: z.string()
    .max(prospectingConfig.maxKeywordsPerJob * prospectingConfig.maxKeywordLength, 'As palavras-chave excedem o limite permitido.')
    .superRefine((value, context) => {
      const entries = value.split(/[\n,;]/).map((keyword) => keyword.trim()).filter(Boolean)
      if (entries.length > prospectingConfig.maxKeywordsPerJob || entries.some((keyword) => keyword.length > prospectingConfig.maxKeywordLength)) {
        context.addIssue({ code: 'custom', message: 'Informe até 10 palavras-chave, cada uma com no máximo 80 caracteres.' })
      }
    }),
})

type FormValues = z.infer<typeof schema>
type FormInput = z.input<typeof schema>

const suggestedSegments = [
  'Clínicas',
  'Dentistas',
  'Advogados',
  'Contadores',
  'Imobiliárias',
  'Restaurantes',
  'Academias',
  'Salões de beleza',
  'Oficinas',
  'Empresas B2B',
  'Escolas',
  'Profissionais liberais',
  'Hotéis',
  'Pousadas',
  'Lojas',
  'Prestadores de serviço',
]

const states = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
] as const

export function NewProspectingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stateCode, setStateCode] = useState('')
  const organizations = useQuery({
    queryKey: ['prospecting-organizations', user?.id],
    queryFn: getProspectingOrganizations,
    enabled: Boolean(user),
    retry: false,
  })
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { organizationId: '', segment: '', location: '', targetQuantity: 20, keywords: '' },
  })
  const selectedSegment = useWatch({ control: form.control, name: 'segment' })
  const selectedQuantity = useWatch({ control: form.control, name: 'targetQuantity' })
  const createJob = useMutation({
    mutationFn: createProspectingJob,
    onSuccess: (job) => navigate(`/prospecting/jobs/${job.id}`),
  })

  useEffect(() => {
    if (organizations.data?.length === 1) {
      form.setValue('organizationId', organizations.data[0].id)
    }
  }, [form, organizations.data])

  const onSubmit = form.handleSubmit((values) => {
    const city = values.location.trim()
    const location = [
      city,
      stateCode && !new RegExp(`\\b${stateCode}\\b`, 'i').test(city) ? stateCode : '',
      'Brasil',
    ].filter(Boolean).join(', ')
    const input: ProspectingInput = {
      organizationId: values.organizationId,
      segment: values.segment.trim(),
      location,
      targetQuantity: values.targetQuantity,
      keywords: values.keywords.split(/[\n,;]/).map((keyword) => keyword.trim()).filter(Boolean),
    }
    createJob.mutate(input)
  })

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Busca inteligente</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Radar de Prospecção</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Descubra empresas B2B no Google Places e avalie sinais digitais. Resultados com avaliação mínima de 4,0/5 e de 20 a 350 avaliações.
          </p>
        </div>
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Voltar ao dashboard
        </Link>
      </header>

      {organizations.isError ? (
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
          {organizations.error instanceof Error ? organizations.error.message : 'Não foi possível carregar as organizações.'}
        </Alert>
      ) : null}
      {createJob.isError ? (
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
          {createJob.error instanceof Error ? createJob.error.message : 'Não foi possível iniciar a prospecção.'}
        </Alert>
      ) : null}

      <section aria-label="Modo de prospecção" className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/70 p-2">
        <span
          role="status"
          className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${
            prospectingMockMode ? 'bg-accent text-primary' : 'text-foreground'
          }`}
        >
          {prospectingMockMode ? <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> : <Search aria-hidden="true" className="h-3.5 w-3.5" />}
          {prospectingMockMode ? 'Modo Demo' : 'Real · Google Places'}
          <span className="text-[10px] font-normal text-muted-foreground">ativo</span>
        </span>
        <p className="px-2 text-xs text-muted-foreground">
          {prospectingMockMode ? 'Os resultados são fictícios e ficam neste navegador.' : 'Pesquisa real com deduplicação e controle de custos.'}
        </p>
      </section>

      <Card className="border-border/80 bg-card/80 shadow-none">
        <CardHeader className="space-y-1.5 px-5 pb-4 pt-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin aria-hidden="true" className="h-4 w-4 text-primary" />
            Localização
          </CardTitle>
          <CardDescription>Defina a região onde deseja encontrar empresas.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          <form className="space-y-6" onSubmit={(event) => void onSubmit(event)}>
            {organizations.data && organizations.data.length > 1 ? (
              <div className="space-y-2">
                <label htmlFor="organizationId" className="text-sm font-medium text-foreground">Organização</label>
                <select
                  id="organizationId"
                  className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register('organizationId')}
                >
                  <option value="">Selecione uma organização</option>
                  {organizations.data.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
                {form.formState.errors.organizationId ? <p className="text-sm text-destructive">{form.formState.errors.organizationId.message}</p> : null}
              </div>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-semibold text-foreground">País, estado e cidade</legend>
              <div className="grid gap-3 sm:grid-cols-[0.7fr_0.8fr_1.5fr]">
                <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  País
                  <Input value="Brasil" readOnly aria-label="País" className="h-10 bg-muted/70 text-foreground" />
                </label>
                <label htmlFor="stateCode" className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Estado
                  <select
                    id="stateCode"
                    value={stateCode}
                    onChange={(event) => setStateCode(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Todos</option>
                    {states.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
                  </select>
                </label>
                <label htmlFor="location" className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Cidade
                  <Input id="location" aria-label="Localização" placeholder="Ex.: São Paulo" className="h-10" {...form.register('location')} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">O estado é opcional; informe ao menos a cidade ou região desejada.</p>
              {form.formState.errors.location ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.location.message}</p> : null}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Tag aria-hidden="true" className="h-4 w-4 text-primary" />
                Segmentos B2B
              </legend>
              <div className="flex flex-wrap gap-2">
                {suggestedSegments.map((segment) => {
                  const selected = selectedSegment.toLocaleLowerCase('pt-BR') === segment.toLocaleLowerCase('pt-BR')
                  return (
                    <button
                      key={segment}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => form.setValue('segment', segment, { shouldDirty: true, shouldValidate: true })}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? 'border-primary/50 bg-accent/60 text-primary'
                          : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/35 hover:text-foreground'
                      }`}
                    >
                      {selected ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
                      {segment}
                    </button>
                  )
                })}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="segment" className="text-[11px] font-medium text-muted-foreground">Segmento</label>
                <Input id="segment" placeholder="Ex.: clínicas veterinárias, agências de turismo..." className="h-10" {...form.register('segment')} />
                <p className="text-xs text-muted-foreground">Escolha uma sugestão ou informe um segmento B2B; consumidores finais não são pesquisados.</p>
                {form.formState.errors.segment ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.segment.message}</p> : null}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Hash aria-hidden="true" className="h-4 w-4 text-primary" />
                Quantidade de empresas
              </legend>
              <div className="flex flex-wrap gap-2">
                {[10, 20, 25, 50, prospectingConfig.maxCompaniesPerJob].filter((value, index, values) => values.indexOf(value) === index).map((quantity) => {
                  const selected = Number(selectedQuantity) === quantity
                  return (
                    <button
                      key={quantity}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => form.setValue('targetQuantity', quantity, { shouldDirty: true, shouldValidate: true })}
                      className={`min-h-9 min-w-12 rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-muted/50 text-foreground hover:border-primary/40'
                      }`}
                    >
                      {quantity}
                    </button>
                  )
                })}
                <label htmlFor="targetQuantity" className="sr-only">Quantidade personalizada</label>
                <Input
                  id="targetQuantity"
                  type="number"
                  min={prospectingConfig.minCompaniesPerJob}
                  max={prospectingConfig.maxCompaniesPerJob}
                  aria-label="Quantidade personalizada"
                  className="h-9 w-28"
                  {...form.register('targetQuantity')}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Até {prospectingConfig.maxCompaniesPerJob} empresas por busca. O total depende dos resultados disponíveis na fonte.
              </p>
              {form.formState.errors.targetQuantity ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.targetQuantity.message}</p> : null}
            </fieldset>

            <details className="group border-t border-border pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <Plus aria-hidden="true" className="h-4 w-4 text-primary" />
                  Refinar busca com palavras-chave
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-2">
                <label htmlFor="keywords" className="text-xs font-medium text-foreground">Palavras-chave <span className="font-normal text-muted-foreground">(opcional)</span></label>
                <textarea
                  id="keywords"
                  rows={2}
                  placeholder={'Implante dentário\nOrtodontia'}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register('keywords')}
                />
                {form.formState.errors.keywords ? <p role="alert" className="text-sm text-destructive">{form.formState.errors.keywords.message}</p> : null}
              </div>
            </details>

            {!prospectingMockMode ? (
              <p className="rounded-lg bg-muted/70 px-4 py-3 text-xs leading-5 text-muted-foreground">
                A busca real pode consumir chamadas do Google Places e PageSpeed. As credenciais permanecem nas Edge Functions do Supabase.
              </p>
            ) : null}

            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto sm:min-w-64"
              disabled={createJob.isPending || organizations.isLoading || organizations.isError || !organizations.data?.length}
            >
              {createJob.isPending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Search aria-hidden="true" className="h-4 w-4" />}
              {createJob.isPending ? 'Iniciando...' : prospectingMockMode ? 'Iniciar prospecção demo' : 'Iniciar prospecção'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

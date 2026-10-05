import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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

export function NewProspectingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
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
    const input: ProspectingInput = {
      organizationId: values.organizationId,
      segment: values.segment.trim(),
      location: values.location.trim(),
      targetQuantity: values.targetQuantity,
      keywords: values.keywords.split(/[\n,;]/).map((keyword) => keyword.trim()).filter(Boolean),
    }
    createJob.mutate(input)
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-sky-700">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Voltar ao dashboard
      </Link>

      <header>
        <h2 className="text-3xl font-semibold text-slate-900">Nova prospecção</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Busque empresas e profissionais em um segmento B2B e região. A prospecção não procura consumidores finais.
        </p>
      </header>

      {prospectingMockMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          Modo de demonstração ativo. Os resultados serão fictícios e ficarão apenas neste navegador; nenhuma API externa será chamada.
        </Alert>
      ) : null}

      {organizations.isError ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          {organizations.error instanceof Error ? organizations.error.message : 'Não foi possível carregar as organizações.'}
        </Alert>
      ) : null}
      {createJob.isError ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          {createJob.error instanceof Error ? createJob.error.message : 'Não foi possível iniciar a prospecção.'}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Perfil das empresas</CardTitle>
          <CardDescription>
            Serão incluídas apenas empresas com avaliação mínima de 4,0/5 e entre 20 e 350 avaliações no Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
            {organizations.data && organizations.data.length > 1 ? (
              <div className="space-y-2">
                <label htmlFor="organizationId" className="text-sm font-medium text-slate-700">Organização</label>
                <select
                  id="organizationId"
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  {...form.register('organizationId')}
                >
                  <option value="">Selecione uma organização</option>
                  {organizations.data.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
                {form.formState.errors.organizationId ? <p className="text-sm text-red-700">{form.formState.errors.organizationId.message}</p> : null}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="segment" className="text-sm font-medium text-slate-700">Segmento</label>
                <Input id="segment" placeholder="Ex.: academias, clínicas ou empresas" {...form.register('segment')} />
                <p className="text-xs text-slate-500">Informe o comprador B2B que deseja encontrar, não consumidores finais.</p>
                {form.formState.errors.segment ? <p className="text-sm text-red-700">{form.formState.errors.segment.message}</p> : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="location" className="text-sm font-medium text-slate-700">Localização</label>
                <Input id="location" placeholder="Ex.: São Paulo, SP" {...form.register('location')} />
                {form.formState.errors.location ? <p className="text-sm text-red-700">{form.formState.errors.location.message}</p> : null}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="targetQuantity" className="text-sm font-medium text-slate-700">Quantidade máxima de empresas</label>
                <Input id="targetQuantity" type="number" min={prospectingConfig.minCompaniesPerJob} max={prospectingConfig.maxCompaniesPerJob} {...form.register('targetQuantity')} />
                <p className="text-xs text-slate-500">De {prospectingConfig.minCompaniesPerJob} a {prospectingConfig.maxCompaniesPerJob}. A quantidade final depende dos resultados disponíveis na fonte.</p>
                {form.formState.errors.targetQuantity ? <p className="text-sm text-red-700">{form.formState.errors.targetQuantity.message}</p> : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="keywords" className="text-sm font-medium text-slate-700">Palavras-chave <span className="font-normal text-slate-500">(opcional)</span></label>
                <textarea
                  id="keywords"
                  rows={3}
                  placeholder={'Implante dentário\nOrtodontia'}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  {...form.register('keywords')}
                />
                {form.formState.errors.keywords ? <p className="text-sm text-red-700">{form.formState.errors.keywords.message}</p> : null}
              </div>
            </div>

            {!prospectingMockMode ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                A prospecção real pode consumir chamadas do Google Places e PageSpeed. Os secrets ficam nas Edge Functions do Supabase, nunca no navegador.
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={createJob.isPending || organizations.isLoading || organizations.isError || !organizations.data?.length}
            >
              {createJob.isPending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : prospectingMockMode ? <Sparkles aria-hidden="true" className="h-4 w-4" /> : <Search aria-hidden="true" className="h-4 w-4" />}
              {createJob.isPending ? 'Iniciando...' : prospectingMockMode ? 'Gerar dados de demonstração' : 'Iniciar prospecção'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

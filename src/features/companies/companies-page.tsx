import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Globe, MapPin, Plus, Star, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { createCompany, getCompanies, getCompanyOrganizations } from '../../services/companies/companyService'

type CompanyForm = {
  organization_id: string
  name: string
  category: string
  description: string
  email: string
  website: string
  phone: string
  address: string
  city: string
  state: string
  country: string
}

const emptyForm: CompanyForm = {
  organization_id: '',
  name: '',
  category: '',
  description: '',
  email: '',
  website: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  country: '',
}

export function CompaniesPage() {
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const organizations = useQuery({
    queryKey: ['company-organizations'],
    queryFn: getCompanyOrganizations,
    enabled: isFormOpen,
    retry: false,
  })
  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
    retry: false,
  })
  const saveCompany = useMutation({
    mutationFn: createCompany,
    onSuccess: async () => {
      setForm(emptyForm)
      setIsFormOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })

  if (companies.isLoading) {
    return <Skeleton className="h-80 w-full rounded-xl" />
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveCompany.mutate({
      ...form,
      organization_id: organizations.data?.length === 1 ? organizations.data[0].id : form.organization_id,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
    })
  }

  const toggleForm = () => {
    if (isFormOpen) setForm(emptyForm)
    saveCompany.reset()
    setIsFormOpen(!isFormOpen)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Empresas</p>
          <h2 className="text-3xl font-semibold text-foreground">Base de empresas</h2>
        </div>
        <Button type="button" onClick={toggleForm}>
          {isFormOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
          {isFormOpen ? 'Cancelar' : 'Nova empresa'}
        </Button>
      </div>

      {companies.isError ? (
        <Alert className="border-destructive/30 bg-destructive/10 text-destructive" role="alert">
          {companies.error instanceof Error ? companies.error.message : 'Não foi possível carregar as empresas.'}
        </Alert>
      ) : null}

      {isFormOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar empresa manualmente</CardTitle>
            <p className="text-sm text-muted-foreground">O cadastro adiciona a empresa à base da organização selecionada, sem criar um lead automaticamente.</p>
          </CardHeader>
          <CardContent>
            {organizations.isLoading ? <Skeleton className="h-11 w-full rounded-lg" /> : null}
            {organizations.isError ? (
              <Alert className="mb-4 border-destructive/30 bg-destructive/10 text-destructive" role="alert">
                {organizations.error instanceof Error ? organizations.error.message : 'Não foi possível carregar as organizações.'}
              </Alert>
            ) : null}
            {organizations.data?.length === 0 ? (
              <Alert className="mb-4 border-warm/30 bg-warm/10 text-warm-foreground" role="alert">
                Sua conta ainda não pertence a uma organização. Vincule-se a uma organização para cadastrar empresas.
              </Alert>
            ) : null}
            {saveCompany.isError ? (
              <Alert className="mb-4 border-destructive/30 bg-destructive/10 text-destructive" role="alert">
                {saveCompany.error instanceof Error ? saveCompany.error.message : 'Não foi possível cadastrar a empresa.'}
              </Alert>
            ) : null}
            {organizations.data?.length ? (
              <form className="space-y-5" onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {organizations.data.length > 1 ? (
                    <label className="space-y-2 text-sm font-medium text-foreground sm:col-span-2" htmlFor="company-organization">
                      Organização
                      <select
                        id="company-organization"
                        required
                        className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={form.organization_id}
                        onChange={(event) => setForm({ ...form, organization_id: event.target.value })}
                      >
                        <option value="">Selecione uma organização</option>
                        {organizations.data.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-name">
                    Nome da empresa *
                    <Input id="company-name" required maxLength={160} autoComplete="organization" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-category">
                    Segmento
                    <Input id="company-category" maxLength={120} placeholder="Ex.: academia" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-email">
                    E-mail
                    <Input id="company-email" type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-phone">
                    Telefone
                    <Input id="company-phone" type="tel" maxLength={32} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground sm:col-span-2" htmlFor="company-website">
                    Website
                    <Input id="company-website" type="url" maxLength={2048} placeholder="https://exemplo.com.br" autoComplete="url" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground sm:col-span-2" htmlFor="company-address">
                    Endereço
                    <Input id="company-address" maxLength={240} autoComplete="street-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-city">
                    Cidade
                    <Input id="company-city" maxLength={120} autoComplete="address-level2" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-state">
                    Estado
                    <Input id="company-state" maxLength={80} autoComplete="address-level1" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="company-country">
                    País
                    <Input id="company-country" maxLength={80} autoComplete="country-name" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground sm:col-span-2" htmlFor="company-description">
                    Observações
                    <textarea
                      id="company-description"
                      rows={3}
                      maxLength={1000}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                    />
                  </label>
                </div>
                <Button
                  type="submit"
                  disabled={saveCompany.isPending || !form.name.trim() || (organizations.data.length > 1 && !form.organization_id)}
                >
                  <Building2 aria-hidden="true" className="h-4 w-4" />
                  {saveCompany.isPending ? 'Salvando empresa…' : 'Salvar empresa'}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {companies.data?.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <BuildingPlaceholder />
            <h3 className="text-lg font-semibold text-foreground">Nenhuma empresa encontrada</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">A base ainda está vazia. Use o radar para encontrar novos clientes em potencial.</p>
          </CardContent>
        </Card>
      ) : companies.data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Lista de empresas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Avaliações</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Fonte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.data.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <Link to={`/companies/${company.id}`} className="font-semibold text-primary hover:underline">
                        {company.name}
                      </Link>
                    </TableCell>
                    <TableCell>{company.category}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {company.city}
                      </span>
                    </TableCell>
                    <TableCell>
                      {company.website ? (
                        <a href={company.website} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" target="_blank" rel="noreferrer">
                          <Globe aria-hidden="true" className="h-4 w-4" />
                          {company.website}
                        </a>
                      ) : <span className="text-sm text-muted-foreground">Sem website</span>}
                    </TableCell>
                    <TableCell>{company.review_count}</TableCell>
                    <TableCell>
                      <Badge variant="warning" className="gap-1">
                        <Star className="h-3 w-3" />
                        {company.rating ?? 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>{company.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function BuildingPlaceholder() {
  return (
    <div className="mb-4 rounded-full bg-secondary p-4 text-muted-foreground">
      <Building2Icon className="h-10 w-10" />
    </div>
  )
}

function Building2Icon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M4 21V7.5A1.5 1.5 0 0 1 5.5 6H9V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V6h3.5A1.5 1.5 0 0 1 20 7.5V21M8 21V10m8 11V10M8 7h8M4 11h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

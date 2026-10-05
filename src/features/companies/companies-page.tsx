import { Globe, MapPin, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { getCompanies } from '../../services/companies/companyService'
import type { Company } from '../../types'

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void getCompanies().then((nextCompanies) => {
      setCompanies(nextCompanies)
      setIsLoading(false)
    })
  }, [])

  if (isLoading) {
    return <Skeleton className="h-80 w-full rounded-xl" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-600">Empresas</p>
          <h2 className="text-3xl font-semibold text-slate-900">Base de empresas</h2>
        </div>
        <Button>
          Nova empresa
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <BuildingPlaceholder />
            <h3 className="text-lg font-semibold text-slate-900">Nenhuma empresa encontrada</h3>
            <p className="mt-2 max-w-md text-sm text-slate-500">A base ainda está vazia. Use o radar para encontrar novos clientes em potencial.</p>
          </CardContent>
        </Card>
      ) : (
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
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <Link to={`/companies/${company.id}`} className="font-semibold text-sky-700 hover:underline">
                        {company.name}
                      </Link>
                    </TableCell>
                    <TableCell>{company.category}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                        <MapPin className="h-4 w-4" />
                        {company.city}
                      </span>
                    </TableCell>
                    <TableCell>
                      <a href={company.website || '#'} className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline" target="_blank" rel="noreferrer">
                        <Globe className="h-4 w-4" />
                        {company.website || 'Sem website'}
                      </a>
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
      )}
    </div>
  )
}

function BuildingPlaceholder() {
  return (
    <div className="mb-4 rounded-full bg-slate-100 p-4 text-slate-400">
      <Building2Icon className="h-10 w-10" />
    </div>
  )
}

function Building2Icon({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M4 21V7.5A1.5 1.5 0 0 1 5.5 6H9V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V6h3.5A1.5 1.5 0 0 1 20 7.5V21M8 21V10m8 11V10M8 7h8M4 11h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

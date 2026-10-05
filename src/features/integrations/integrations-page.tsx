import { CheckCircle2, Clock3, Globe, Mail, MessageSquareText, Sparkles } from 'lucide-react'

import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

const integrations = [
  { name: 'Google Places', status: 'Configuração pendente', enabled: false, icon: Globe },
  { name: 'Google Ads', status: 'Configuração pendente', enabled: false, icon: Sparkles },
  { name: 'OpenAI', status: 'Configuração pendente', enabled: false, icon: CheckCircle2 },
  { name: 'PageSpeed', status: 'Configuração pendente', enabled: false, icon: Clock3 },
  { name: 'Email', status: 'Configuração pendente', enabled: false, icon: Mail },
  { name: 'WhatsApp', status: 'Configuração pendente', enabled: false, icon: MessageSquareText },
]

export function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Integrações</p>
        <h2 className="text-3xl font-semibold text-foreground">Conectores da plataforma</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map(({ name, status, enabled, icon: Icon }) => (
          <Card key={name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? 'Ativo' : 'Pendente'}</Badge>
              </div>
              <CardTitle className="mt-4 text-xl">{name}</CardTitle>
              <CardDescription>{status}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Arquitetura preparada para conexão segura quando a organização estiver pronta para operar em ambiente de produção.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, Mail, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../hooks/useAuth'
import { appEnv } from '../../config/env'
import { isSupabaseConfigured } from '../../lib/supabase/client'

type AuthMode = 'login' | 'register' | 'forgot-password'

type LoginFormValues = {
  email: string
  password: string
}

type RegisterFormValues = {
  fullName: string
  email: string
  password: string
}

type ResetFormValues = {
  email: string
}

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
})

const registerSchema = z.object({
  fullName: z.string().min(2, 'Informe seu nome completo.'),
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
})

const resetSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
})

export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const { signIn, signUp, resetPassword } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  const form = useForm<LoginFormValues | RegisterFormValues | ResetFormValues>({
    resolver: zodResolver(
      mode === 'register' ? registerSchema : mode === 'forgot-password' ? resetSchema : loginSchema,
    ) as never,
    defaultValues: mode === 'register'
      ? ({ email: '', password: '', fullName: '' } satisfies RegisterFormValues)
      : mode === 'forgot-password'
        ? ({ email: '' } satisfies ResetFormValues)
        : ({ email: '', password: '' } satisfies LoginFormValues),
  })

  const isRegister = mode === 'register'
  const isReset = mode === 'forgot-password'

  const onSubmit = async (values: LoginFormValues | RegisterFormValues | ResetFormValues) => {
    try {
      setError(null)
      setSuccess(null)
      setIsSubmitting(true)

      if (isReset) {
        const resetValues = values as ResetFormValues
        await resetPassword(resetValues.email)
        setSuccess('Se houver uma conta registrada, o e-mail foi enviado com instruções de recuperação.')
        return
      }

      if (isRegister) {
        const registerValues = values as RegisterFormValues
        await signUp({
          email: registerValues.email,
          password: registerValues.password,
          fullName: registerValues.fullName,
        })
        setSuccess('Conta criada com sucesso. Você já pode entrar no dashboard.')
        navigate('/dashboard')
        return
      }

      const loginValues = values as LoginFormValues
      await signIn({ email: loginValues.email, password: loginValues.password })
      navigate('/dashboard')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao processar autenticação.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <Card className="w-full max-w-lg border-slate-200 bg-white/90 shadow-soft">
        <CardHeader>
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <UserPlus className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl text-slate-900">
            {isReset ? 'Recuperar senha' : isRegister ? 'Criar conta' : 'Entrar no Lead Radar'}
          </CardTitle>
          <CardDescription>
            {isReset
              ? 'Informe o e-mail da conta para receber o link de recuperação.'
              : isRegister
                ? 'Configure sua organização e comece a prospectar com IA.'
                : 'Acesse sua workspace e continue seu pipeline.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {isRegister ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="fullName">
                  Nome completo
                </label>
                <Input id="fullName" placeholder="Maria Souza" {...form.register('fullName')} />
                {'fullName' in form.formState.errors && form.formState.errors.fullName ? (
                  <p className="text-xs text-red-600">{form.formState.errors.fullName.message}</p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <Input id="email" type="email" className="pl-10" placeholder="seu@email.com" {...form.register('email')} />
              </div>
              {'email' in form.formState.errors && form.formState.errors.email ? (
                <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
              ) : null}
            </div>

            {!isReset ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700" htmlFor="password">
                    Senha
                  </label>
                  {!isRegister ? (
                    <Link to="/forgot-password" className="text-xs text-sky-600 hover:underline">
                      Esqueci a senha
                    </Link>
                  ) : null}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={isPasswordVisible ? 'text' : 'password'}
                    className="pl-10 pr-11"
                    placeholder="••••••••"
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={isPasswordVisible}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                  >
                    {isPasswordVisible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
                {'password' in form.formState.errors && form.formState.errors.password ? (
                  <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
            ) : null}

            {error ? <Alert>{error}</Alert> : null}
            {success ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">{success}</Alert> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Aguarde...' : isReset ? 'Enviar link' : isRegister ? 'Criar conta' : 'Entrar'}
              {!isSubmitting ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
            </Button>

            {!isReset && !isRegister && appEnv.demoAuthEnabled &&
            (!isSupabaseConfigured || appEnv.prospectingMockMode) ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  form.clearErrors()
                  form.setValue('email', 'demo@lead-radar.dev')
                  form.setValue('password', '123456')
                  setError(null)
                  setSuccess('Credenciais demo preenchidas. Você pode entrar agora.')
                }}
              >
                Usar conta demo
              </Button>
            ) : null}
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
            {isRegister ? 'Já possui conta?' : 'Ainda não tem conta?'}
            <Link to={isRegister ? '/login' : '/register'} className="font-medium text-sky-600 hover:underline">
              {isRegister ? 'Entrar' : 'Criar uma conta'}
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Protegido por Supabase Auth
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

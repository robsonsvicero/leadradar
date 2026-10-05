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

type AuthMode = 'login' | 'register' | 'forgot-password' | 'set-password'

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

type SetPasswordFormValues = {
  password: string
  confirmPassword: string
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

const setPasswordSchema = z.object({
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
  confirmPassword: z.string().min(8, 'Confirme a senha.'),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'As senhas não são iguais.',
})

export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const { signIn, signUp, resetPassword, updatePassword } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  const form = useForm<LoginFormValues | RegisterFormValues | ResetFormValues | SetPasswordFormValues>({
    resolver: zodResolver(
      mode === 'register' ? registerSchema
        : mode === 'forgot-password' ? resetSchema
          : mode === 'set-password' ? setPasswordSchema
            : loginSchema,
    ) as never,
    defaultValues: mode === 'register'
      ? ({ email: '', password: '', fullName: '' } satisfies RegisterFormValues)
      : mode === 'forgot-password'
        ? ({ email: '' } satisfies ResetFormValues)
        : mode === 'set-password'
          ? ({ password: '', confirmPassword: '' } satisfies SetPasswordFormValues)
        : ({ email: '', password: '' } satisfies LoginFormValues),
  })

  const isRegister = mode === 'register'
  const isReset = mode === 'forgot-password'
  const isSetPassword = mode === 'set-password'

  const onSubmit = async (values: LoginFormValues | RegisterFormValues | ResetFormValues | SetPasswordFormValues) => {
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

      if (isSetPassword) {
        const passwordValues = values as SetPasswordFormValues
        await updatePassword(passwordValues.password)
        setSuccess('Senha definida. Redirecionando para sua organização.')
        navigate('/dashboard')
        return
      }

      if (isRegister) {
        const registerValues = values as RegisterFormValues
        const newUser = await signUp({
          email: registerValues.email,
          password: registerValues.password,
          fullName: registerValues.fullName,
        })
        if (newUser) {
          setSuccess(
            newUser.accessStatus === 'approved'
              ? 'Conta criada e aprovada. Redirecionando para o aplicativo.'
              : 'Cadastro recebido. Você poderá entrar depois que um administrador aprovar sua conta.',
          )
          if (newUser.accessStatus === 'approved') navigate('/dashboard')
        } else {
          setSuccess('Conta criada. Confirme seu e-mail; o acesso também depende da aprovação de um administrador.')
        }
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
            {isReset ? 'Recuperar senha'
              : isSetPassword ? 'Definir senha'
                : isRegister ? 'Criar conta'
                  : 'Entrar no Lead Radar'}
          </CardTitle>
          <CardDescription>
            {isReset
              ? 'Informe o e-mail da conta para receber o link de recuperação.'
              : isSetPassword
                ? 'Use o convite recebido por e-mail para cadastrar a senha da sua organização.'
                : isRegister
                  ? 'Crie sua conta. O acesso será liberado após a aprovação do administrador.'
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

            {!isSetPassword ? (
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
            ) : null}

            {!isReset ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700" htmlFor="password">
                    Senha
                  </label>
                  {!isRegister && !isSetPassword ? (
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
                    autoComplete={isRegister || isSetPassword ? 'new-password' : 'current-password'}
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
            {isSetPassword ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                  Confirmar senha
                </label>
                <Input
                  id="confirmPassword"
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...form.register('confirmPassword')}
                />
                {'confirmPassword' in form.formState.errors && form.formState.errors.confirmPassword ? (
                  <p className="text-xs text-red-600">{form.formState.errors.confirmPassword.message}</p>
                ) : null}
              </div>
            ) : null}

            {error ? <Alert>{error}</Alert> : null}
            {success ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">{success}</Alert> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Aguarde...'
                : isReset ? 'Enviar link'
                  : isSetPassword ? 'Salvar senha'
                    : isRegister ? 'Criar conta'
                      : 'Entrar'}
              {!isSubmitting ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
            </Button>

            {!isReset && !isRegister && !isSetPassword && appEnv.demoAuthEnabled &&
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
            {isRegister ? 'Já possui conta?' : isSetPassword || isReset ? 'Já possui senha?' : 'Ainda não tem conta?'}
            <Link to={isRegister || isSetPassword || isReset ? '/login' : '/register'} className="font-medium text-sky-600 hover:underline">
              {isRegister || isSetPassword || isReset ? 'Entrar' : 'Criar uma conta'}
            </Link>
          </div>
          {!isRegister && !isReset && !isSetPassword ? (
            <div className="mt-3 text-center text-sm">
              <Link to="/set-password" className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-900">
                Recebi um convite e preciso definir minha senha
              </Link>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Protegido por Supabase Auth
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

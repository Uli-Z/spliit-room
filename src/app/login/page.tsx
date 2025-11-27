'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const t = useTranslations('Login')
  const searchParams = useSearchParams()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      const callback = searchParams.get('callbackUrl') ?? '/'
      router.replace(callback)
      router.refresh()
      // Hard navigation avoids stale prefetch caches when SHARED_PASSWORD is enabled.
      window.location.assign(callback)
      return
    }

    if (res.status === 429) {
      interface LoginErrorResponse { message?: string }
      const data = await res.json() as LoginErrorResponse
      setError(data.message || t('tooManyAttempts'))
    } else {
      setError(t('wrongPassword'))
    }
    setSubmitting(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm w-full">
        <p className="text-center text-sm text-muted-foreground">{t('description')}</p>
        <Input type="password" name="password" placeholder={t('password')} required />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('redirecting')}
            </span>
          ) : (
            t('enter')
          )}
        </Button>
      </form>
    </main>
  )
}

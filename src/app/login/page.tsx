'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'

export default function LoginPage() {
  const router = useRouter()
  const t = useTranslations('Login')
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
      router.push(callback)
      router.refresh()
    } else if (res.status === 429) {
      interface LoginErrorResponse { message?: string }
      const data = await res.json() as LoginErrorResponse
      setError(data.message || t('tooManyAttempts'))
    } else {
      setError(t('wrongPassword'))
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm w-full">
        <p className="text-center text-sm text-muted-foreground">{t('description')}</p>
        <Input type="password" name="password" placeholder={t('password')} required />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" className="w-full">{t('enter')}</Button>
      </form>
    </main>
  )
}

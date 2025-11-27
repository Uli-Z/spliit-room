import { ApplePwaSplash } from '@/app/apple-pwa-splash'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ProgressBar } from '@/components/progress-bar'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { env } from '@/lib/env'
import { TRPCProvider } from '@/trpc/client'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  title: {
    default: 'Spliit · Share Expenses with Friends & Family',
    template: '%s · Spliit',
  },
  description:
    'Spliit is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
  openGraph: {
    title: 'Spliit · Share Expenses with Friends & Family',
    description:
      'Spliit is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
    images: `/banner.png`,
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@scastiel',
    site: '@scastiel',
    images: `/banner.png`,
    title: 'Spliit · Share Expenses with Friends & Family',
    description:
      'Spliit is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
  },
  appleWebApp: {
    capable: true,
    title: 'Spliit',
  },
  applicationName: 'Spliit',
  icons: [
    {
      url: '/android-chrome-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      url: '/android-chrome-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
}

export const viewport: Viewport = {
  themeColor: '#047857',
}

function Content({ children }: { children: React.ReactNode }) {
  const t = useTranslations()
  const { NEXT_PUBLIC_HEADER_TITLE, NEXT_PUBLIC_HEADER_LOGO_SECOND } = env
  const prefetchInternalLinks = !env.SHARED_PASSWORD
  return (
    <TRPCProvider>
      <header className="fixed top-0 left-0 right-0 h-16 flex justify-between items-center bg-white dark:bg-gray-950 bg-opacity-50 dark:bg-opacity-50 p-2 border-b backdrop-blur-sm z-50">
        <Link
          prefetch={prefetchInternalLinks}
          href="/"
          className="flex items-center gap-3 hover:scale-105 transition-transform"
        >
          {/* Primäres Logo, Höhe = Header-Höhe (64px) */}
          <h1 className="shrink-0">
            <Image
              src="/logo-with-text.png"
              alt="Spliit"
              width={(35 * 522) / 180}
              height={35}
              style={{ width: 'auto', height: '35px' }}
              className="object-contain"
              priority
            />
          </h1>

          {/* Sekundäres Logo, ebenfalls 64px hoch, Breite auto */}
          {NEXT_PUBLIC_HEADER_LOGO_SECOND && (
            <Image
              src={NEXT_PUBLIC_HEADER_LOGO_SECOND}
              alt=""
              width={35}
              height={35}
              style={{ width: 'auto', height: '35px' }}
              className="object-contain"
              priority
            />
          )}

          {/* Titel neben Logos */}
          {NEXT_PUBLIC_HEADER_TITLE && (
            <span className="hidden sm:block whitespace-nowrap text-[2.4rem] leading-none font-semibold">
              {NEXT_PUBLIC_HEADER_TITLE}
            </span>
          )}
        </Link>

        <nav role="navigation" aria-label="Menu" className="flex">
          <ul className="flex items-center text-sm">
            <li>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="-my-3 text-primary"
              >
                <Link prefetch={prefetchInternalLinks} href="/groups">{t('Header.groups')}</Link>
              </Button>
            </li>
            <li>
              <LocaleSwitcher />
            </li>
            <li>
              <ThemeToggle />
            </li>
          </ul>
        </nav>
      </header>

      <div className="pt-16 flex-1 flex flex-col">{children}</div>

     <footer className="sm:p-8 md:p-16 sm:mt-16 sm:text-sm md:text-base md:mt-32 bg-slate-50 dark:bg-card border-t p-6 mt-8 flex flex-col sm:flex-row sm:justify-between gap-4 text-xs [&_a]:underline">
      <div className="flex flex-col space-y-2">
        {/* Hier geändert: keine weiß-Farbe mehr, nur Unterstreichung und Standard-Textfarbe */}
        <div className="flex flex-col space-y-2 [&_a]:underline [&_a]:text-current">
          <span>{t('Footer.madeIn')}</span>

          <span>
            {t.rich('Footer.builtBy', {
              author: (txt) => (
                <a href="https://scastiel.dev" target="_blank" rel="noopener">
                  {txt}
                </a>
              ),
              source: (txt) => (
                <a
                  href="https://github.com/Uli-Z/spliit-room/graphs/contributors"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center space-x-1"
                >
                  <Image
                    src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
                    alt="GitHub logo"
                    width={16}
                    height={16}
                  />
                  <span>{txt}</span>
                </a>
              ),
            })}
          </span>

          <span>
            {t.rich('Footer.forkNotice', {
              upstream: (txt) => (
                <a href="https://spliit.app" target="_blank" rel="noopener">
                  {txt}
                </a>
              ),
            })}
          </span>

          <span className="flex items-center space-x-4">
            <a
              href="https://github.com/spliit-app/spliit"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center space-x-1"
            >
              <Image
                src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
                alt="GitHub logo"
                width={16}
                height={16}
              />
              <span>{t('Footer.originalRepo')}</span>
            </a>

            <a
              href="https://github.com/Uli-Z/spliit-room"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center space-x-1"
            >
              <Image
                src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
                alt="GitHub logo"
                width={16}
                height={16}
              />
              <span>{t('Footer.forkRepo')}</span>
            </a>
          </span>
        </div>
      </div>
    </footer>
      <Toaster />
    </TRPCProvider>
  )
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html lang={locale} suppressHydrationWarning>
      <ApplePwaSplash icon="/logo-with-text.png" color="#027756" />
      <body className="min-h-[100dvh] flex flex-col items-stretch bg-slate-50 bg-opacity-30 dark:bg-background">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Suspense>
              <ProgressBar />
            </Suspense>
            <Content>{children}</Content>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

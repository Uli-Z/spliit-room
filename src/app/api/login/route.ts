import { env } from '@/lib/env'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const MAX_ATTEMPTS = 5
const LOCKOUT_TIME_MS = 5 * 60 * 1000 // 5 minutes

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'

  let loginAttempt = await prisma.loginAttempt.findUnique({
    where: { ip },
  })

  if (loginAttempt && loginAttempt.lockoutUntil.getTime() > Date.now()) {
    return NextResponse.json({ success: false, message: 'Too many login attempts. Please try again later.' }, { status: 429 })
  }

  if (!env.SHARED_PASSWORD) {
    // If no shared password is set, allow access immediately
    // and clear any previous failed attempts for this IP
    if (loginAttempt) {
      await prisma.loginAttempt.delete({ where: { ip } })
    }
    return NextResponse.json({ success: true })
  }

  const { password } = (await request.json()) as { password?: string }
  if (password === env.SHARED_PASSWORD) {
    // Successful login, clear failed attempts for this IP
    if (loginAttempt) {
      await prisma.loginAttempt.delete({ where: { ip } })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('spliit-auth', password, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  } else {
    // Incorrect password, increment failed attempts
    const newAttemptCount = (loginAttempt ? loginAttempt.count : 0) + 1
    const newLockoutUntil = newAttemptCount >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_TIME_MS) : new Date(0) // Date(0) for no lockout

    if (loginAttempt) {
      await prisma.loginAttempt.update({
        where: { ip },
        data: {
          count: newAttemptCount,
          lastAttempt: new Date(),
          lockoutUntil: newLockoutUntil,
        },
      })
    } else {
      await prisma.loginAttempt.create({
        data: {
          ip,
          count: newAttemptCount,
          lastAttempt: new Date(),
          lockoutUntil: newLockoutUntil,
        },
      })
    }

    if (newLockoutUntil.getTime() > 0) {
      return NextResponse.json({ success: false, message: 'Too many login attempts. Please try again later.' }, { status: 429 })
    }
    return NextResponse.json({ success: false }, { status: 401 })
  }
}

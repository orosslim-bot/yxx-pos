import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyBoothSession } from '@/lib/booth-mac'

const SESSION_MAX_INACTIVE = 12 * 60 * 60 // 12 小時（秒）

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const boothId = request.cookies.get("booth_id")?.value
  const boothName = request.cookies.get("booth_name")?.value
  const boothSig = request.cookies.get("booth_sig")?.value
  const isBoothAuthenticated =
    boothId && boothName && boothSig
      ? await verifyBoothSession(boothId, boothName, boothSig)
      : false
  const isAuthenticated = !!user || isBoothAuthenticated
  const pathname = request.nextUrl.pathname

  // API 路由直接放行
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  if (pathname.startsWith('/login')) {
    if (isAuthenticated) {
      const url = request.nextUrl.clone()
      url.pathname = '/pos'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  if (pathname.startsWith('/admin') && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (!isAuthenticated) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── 12 小時閒置自動登出 ──
  const lastActiveRaw = request.cookies.get('last_active')?.value
  const lastActiveTime = lastActiveRaw ? parseInt(lastActiveRaw, 10) : null
  const now = Math.floor(Date.now() / 1000)

  if (lastActiveTime !== null && now - lastActiveTime > SESSION_MAX_INACTIVE) {
    const url = request.nextUrl.clone()
    url.pathname = '/api/force-logout'
    return NextResponse.redirect(url)
  }

  // 更新最後活動時間（滾動）
  supabaseResponse.cookies.set('last_active', String(now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_INACTIVE + 600,
    path: '/',
  })

  // 滾動更新攤位 cookie
  if (isBoothAuthenticated && boothId && boothName && boothSig) {
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: SESSION_MAX_INACTIVE,
      path: '/',
    }
    supabaseResponse.cookies.set('booth_id', boothId, cookieOpts)
    supabaseResponse.cookies.set('booth_name', boothName, cookieOpts)
    supabaseResponse.cookies.set('booth_sig', boothSig, cookieOpts)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

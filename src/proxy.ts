import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyBoothSession } from '@/lib/booth-mac'

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

  // 登入相關 API 不需要攔截
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

  if (pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  if (!isAuthenticated) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 滾動更新：每次有效請求都重設 booth cookie 到期時間（24 小時）
  if (isBoothAuthenticated && boothId && boothName && boothSig) {
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24,
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

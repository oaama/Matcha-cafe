import { NextResponse } from 'next/server';
import {
  authenticateStaffCredentials,
  createStaffSessionToken,
  hasStaffCredentials,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_DURATION_SECONDS,
} from '@/lib/staff-auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');

  if (!hasStaffCredentials()) {
    return NextResponse.json({ error: 'تسجيل دخول فريق العمل غير مُعدّ على الخادم.' }, { status: 503 });
  }

  let credentialsValid: boolean;
  try {
    credentialsValid = await authenticateStaffCredentials(email, password);
  } catch (error) {
    console.error('Unable to authenticate staff member:', error);
    return NextResponse.json({ error: 'تعذر الاتصال بخدمة تسجيل الدخول.' }, { status: 503 });
  }

  if (credentialsValid) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(STAFF_SESSION_COOKIE, createStaffSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STAFF_SESSION_DURATION_SECONDS,
    });
    return response;
  }

  return NextResponse.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' }, { status: 401 });
}

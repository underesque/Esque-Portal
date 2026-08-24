import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_ONLY_ROUTES = ["/payroll", "/employees", "/founders", "/vendors"];
// Employees get a deliberately narrow slice of the portal — their own
// scorecard, and the company holiday calendar. Everything else redirects
// them back to /my-scorecard, regardless of what ADMIN_ONLY_ROUTES allows.
const EMPLOYEE_ALLOWED_ROUTES = ["/my-scorecard", "/holidays"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!user) {
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role;

  if (isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = role === "employee" ? "/my-scorecard" : "/dashboard";
    return NextResponse.redirect(url);
  }

  if (role === "employee") {
    if (!EMPLOYEE_ALLOWED_ROUTES.some((route) => pathname.startsWith(route))) {
      const url = request.nextUrl.clone();
      url.pathname = "/my-scorecard";
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route)) && role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

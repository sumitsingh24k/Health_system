import LoginForm from "@/app/login/login-form";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const callbackParam = params?.callbackUrl;
  const callbackUrl =
    typeof callbackParam === "string" && callbackParam.startsWith("/")
      ? callbackParam
      : "/workspace";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_38%,#f1f5f9_100%)]" />
      <div className="absolute -left-20 -top-16 -z-10 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />
      <div className="absolute -bottom-20 -right-12 -z-10 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
      <LoginForm callbackUrl={callbackUrl} />
    </main>
  );
}

import { ProductShowcase } from "./product-showcase"
import { BrandMark } from "./stage"

// Sign-in, sign-up and the steps around them: the product on the left, the form in a quiet column on the right.
// Phones get the form alone, under the logo that the product panel otherwise carries.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <ProductShowcase />
      <div className="flex min-w-0 flex-col px-6 pt-6 pb-10 sm:px-10 lg:px-14">
        <header className="lg:hidden">
          <BrandMark />
        </header>
        <main id="main-content" className="flex flex-1 flex-col justify-center py-12">
          <div className="mx-auto w-full max-w-[22.5rem]">{children}</div>
        </main>
      </div>
    </div>
  )
}

// A page's title and its one line of context, rising in as the page opens.
export function AuthPage({
  title,
  description,
  children
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:ease-out">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance">{title}</h1>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// The line under a form that offers the other way in, such as "New to Copacker? Create an account".
export function AuthSwitch({ prompt, href, children }: { prompt: string; href: string; children: React.ReactNode }) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {prompt}{" "}
      <a href={href} className="focus-ring rounded-sm font-medium text-foreground underline-offset-4 hover:underline">
        {children}
      </a>
    </p>
  )
}

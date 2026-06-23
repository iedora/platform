export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-heading text-[clamp(28px,7vw,40px)] font-bold">
        Menu not found<span className="text-primary">.</span>
      </h1>
      <p className="text-sm text-muted-foreground">
        The restaurant you&rsquo;re looking for doesn&rsquo;t exist.
      </p>
    </main>
  )
}

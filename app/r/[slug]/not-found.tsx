export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Menu not found</h1>
      <p className="text-sm text-muted-foreground">
        The restaurant you&rsquo;re looking for either doesn&rsquo;t exist or hasn&rsquo;t
        published their menu yet.
      </p>
    </main>
  )
}

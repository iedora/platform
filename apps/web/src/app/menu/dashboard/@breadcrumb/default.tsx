// Required fallback for the @breadcrumb parallel-route slot. The catch-all
// page handles every dashboard route, so this only renders if the slot can't
// match — in which case we show nothing.
export default function BreadcrumbDefault() {
  return null
}

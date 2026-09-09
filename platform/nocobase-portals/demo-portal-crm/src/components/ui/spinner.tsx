import { useTranslate } from "@refinedev/core"
import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const translate = useTranslate()
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={translate("ui.spinner.loading", "Loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }

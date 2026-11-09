import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-edge bg-transparent px-3 py-2 text-md text-ink transition-[border-color] outline-none placeholder:text-faint focus-visible:border-ink disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

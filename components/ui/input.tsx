import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-none border-0 border-b border-edge bg-transparent px-0 py-1 text-md text-ink transition-[border-color] outline-none selection:bg-ink selection:text-paper file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ink",
        "aria-invalid:border-red",
        className
      )}
      {...props}
    />
  )
}

export { Input }

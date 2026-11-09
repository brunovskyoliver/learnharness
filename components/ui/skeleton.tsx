"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-shelf motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** The lift (120ms) and the late ink (360ms + 240ms cap) with margin. */
const SWAP_MS = 1000

/**
 * Feature 028, row 29 (and rows 13, 15's late arrival): where a skeleton
 * held the place, the content replaces it and the skeleton lifts away over
 * it (120ms, out of the flow, so nothing shifts). When the data lands after
 * the page's own arrival has ended, the content inks in too: its
 * `[data-row-order]` rows in reading order, otherwise as one (280ms). While
 * the page's arrival still runs, that arrival carries the content.
 */
function SkeletonLift({ ready, skeleton, children, className, ...props }: { ready: boolean; skeleton: ReactNode; children: ReactNode } & Omit<ComponentProps<"div">, "children">) {
  const ref = useRef<HTMLDivElement>(null)
  const was = useRef(ready)
  const [swap, setSwap] = useState<{ late: boolean } | null>(null)
  useIsoLayoutEffect(() => {
    if (ready && !was.current) setSwap({ late: !ref.current?.parentElement?.closest("[data-lh-arrive]") })
    was.current = ready
  }, [ready])
  useEffect(() => {
    if (!swap) return
    const timer = window.setTimeout(() => setSwap(null), SWAP_MS)
    return () => window.clearTimeout(timer)
  }, [swap])
  return (
    <div ref={ref} {...props} className={cn("lh-skeleton-swap", className)} data-lh-late={swap?.late ? "" : undefined}>
      {ready ? children : skeleton}
      {ready && swap && <div className="lh-skeleton-leaving" aria-hidden="true" inert>{skeleton}</div>}
    </div>
  )
}

export { Skeleton, SkeletonLift }

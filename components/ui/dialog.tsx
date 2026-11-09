"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

/** The open state, for the content's focus return (feature 028, R7). */
const DialogOpenContext = React.createContext<boolean | undefined>(undefined)

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogOpenContext.Provider value={props.open}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogOpenContext.Provider>
  )
}

/**
 * Feature 028 (R7, FR-005): the dialog lifts away for 120ms, but focus goes
 * back at once. Radix returns focus when the content unmounts, after its exit
 * animation; this returns it as the dialog closes, through the caller's
 * `onCloseAutoFocus` when it has one, else to the element that had focus as
 * it opened. A passive effect: the focus trap lets go in its own effect
 * cleanup, which runs first (a discrete close flushes both before the next
 * frame). The unmount's own return is then skipped; a dialog its owner
 * unmounts outright (no close first) keeps Radix's return.
 */
function useCloseFocusNow(
  open: boolean | undefined,
  onCloseAutoFocus: ((event: Event) => void) | undefined
) {
  const opener = React.useRef<Element | null>(null)
  const content = React.useRef<HTMLDivElement | null>(null)
  const wasOpen = React.useRef(false)
  const returned = React.useRef(false)
  const handler = React.useRef(onCloseAutoFocus)
  handler.current = onCloseAutoFocus
  React.useLayoutEffect(() => {
    if (open && !wasOpen.current) opener.current = document.activeElement
  }, [open])
  React.useEffect(() => {
    if (open === undefined) return
    if (open) {
      wasOpen.current = true
      returned.current = false
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    returned.current = true
    // A layer that opened as this one closed keeps the focus it took.
    const now = document.activeElement
    if (now && now !== document.body && !content.current?.contains(now)) return
    const event = new Event("lh.closeAutoFocus", { cancelable: true })
    handler.current?.(event)
    const back = opener.current
    if (!event.defaultPrevented && back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus()
  }, [open])
  // Uncontrolled dialogs keep Radix's own return.
  const onClose = open === undefined
    ? onCloseAutoFocus
    : (event: Event) => {
        const lost = document.activeElement === null || document.activeElement === document.body
        if (!returned.current) return handler.current?.(event)
        event.preventDefault()
        // Back already, unless focus went into the closing dialog since (it is gone now).
        const back = opener.current
        if (lost && back instanceof HTMLElement && back.isConnected) back.focus()
      }
  return { content, onCloseAutoFocus: onClose }
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "lh-layer-scrim fixed inset-0 z-50 bg-backdrop",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const open = React.useContext(DialogOpenContext)
  const { content, onCloseAutoFocus: closeAutoFocus } = useCloseFocusNow(open, onCloseAutoFocus)
  const { ref: givenRef, ...contentProps } = props as typeof props & { ref?: React.Ref<HTMLDivElement> }
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "lh-dialog-grain lh-layer-dialog fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl bg-paper p-6 text-ink shadow-lift outline-none sm:max-w-lg",
          className
        )}
        {...contentProps}
        ref={(node: HTMLDivElement | null) => {
          content.current = node
          if (typeof givenRef === "function") givenRef(node)
          else if (givenRef) (givenRef as React.RefObject<HTMLDivElement | null>).current = node
        }}
        onCloseAutoFocus={closeAutoFocus}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-full text-faint transition-colors hover:bg-shelf hover:text-ink pointer-coarse:top-1.5 pointer-coarse:right-1.5 pointer-coarse:size-11 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl font-medium tracking-title text-ink", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-md text-graphite", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

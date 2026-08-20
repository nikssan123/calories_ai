"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-2 border-border p-0.5 transition-colors outline-none",
        "bg-muted data-[checked]:border-[var(--calories-deep)] data-[checked]:bg-[var(--calories)]",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-[22px] rounded-full bg-white shadow-[0_2px_0_0_rgba(49,38,30,0.2)] ring-0",
          "transition-transform duration-[var(--dur-quick)] ease-[var(--ease-pop)] data-[checked]:translate-x-[22px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

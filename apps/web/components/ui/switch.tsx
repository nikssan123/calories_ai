"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 transition-colors outline-none",
        "bg-muted data-[checked]:bg-[var(--calories)]",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-[21px] rounded-full bg-white shadow-sm ring-0",
          "transition-transform duration-[var(--dur-quick)] data-[checked]:translate-x-[18px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

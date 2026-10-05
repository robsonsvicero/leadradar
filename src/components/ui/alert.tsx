import * as React from 'react'

import { cn } from '../../lib/utils'

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn('rounded-xl border border-warm/30 bg-warm/10 p-4 text-sm text-warm-foreground', className)}
      {...props}
    />
  ),
)
Alert.displayName = 'Alert'

export { Alert }

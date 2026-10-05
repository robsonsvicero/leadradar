# Dark Radar

## Visual identity

The interface is a focused B2B prospecting workspace: electric cyan signals the next useful action, deep petroleum-blue surfaces keep long work sessions calm, and warm score colors make lead priority immediately scannable.

The app uses the same dark palette in the default root and `.dark` theme. All foundational colors are HSL custom properties in `src/index.css` and are exposed as semantic Tailwind colors in `tailwind.config.js`.

## Color tokens

| Role | Token | HSL |
|---|---|---|
| Canvas | `background` | `222 47% 6%` |
| Primary text | `foreground` | `210 40% 96%` |
| Card | `card` | `222 40% 9%` |
| Popover | `popover` | `222 44% 8%` |
| Primary action | `primary` | `187 95% 52%` |
| Primary action text | `primary-foreground` | `222 47% 6%` |
| Secondary surface | `secondary` | `222 30% 14%` |
| Muted surface | `muted` | `222 30% 13%` |
| Secondary text | `muted-foreground` | `215 20% 60%` |
| Accent | `accent` | `187 80% 18%` |
| Destructive | `destructive` | `0 84% 60%` |
| Success | `success` | `160 70% 45%` |
| Hot lead | `hot` | `12 85% 58%` |
| Warm lead | `warm` | `38 92% 50%` |
| Cold lead | `cold` | `215 25% 45%` |

The sidebar and five chart series have dedicated tokens alongside border, input and focus-ring tokens in the CSS root.

Sidebar tokens:

| Token | HSL |
|---|---|
| `sidebar-background` | `222 50% 5%` |
| `sidebar-foreground` | `210 40% 90%` |
| `sidebar-primary` / `sidebar-ring` | `187 95% 52%` |
| `sidebar-primary-foreground` | `222 47% 6%` |
| `sidebar-accent` | `222 30% 12%` |
| `sidebar-accent-foreground` | `187 95% 60%` |
| `sidebar-border` | `222 30% 14%` |

Chart tokens, in order: `chart-1` cyan (`187 95% 52%`), `chart-2` green (`160 70% 45%`), `chart-3` amber (`38 92% 50%`), `chart-4` orange (`12 85% 58%`), and `chart-5` purple (`280 65% 60%`).

## Application

- Use semantic Tailwind classes (`bg-background`, `text-foreground`, `border-border`, `bg-primary`) instead of literal colors.
- Keep success, warning, destructive, and lead-score states distinct; use the `hot`, `warm`, and `cold` badge variants for lead classification.
- Charts and default pipeline stages read chart and status tokens so they follow the same palette. User-defined pipeline stages retain their own configured color.
- Inputs, selects, browser selection, focus rings, overlays, and the sidebar use the same dark theme.
- Maintain readable contrast on dark surfaces; the cold-score color is an accent/border, not small body text.

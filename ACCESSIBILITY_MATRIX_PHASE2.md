# Accessibility Matrix Phase 2

Date: 2026-02-22
Scope: Launcher, Client Onboarding, Project Management, Sprints, Realtime Sync
Standard target: WCAG 2.2 AA baseline

## Keyboard Matrix

| Area | Tab Reachable | Enter/Space Works | Focus Visible | Notes |
| --- | --- | --- | --- | --- |
| Launcher app badges | Yes | Yes | Yes | Focus ring now consistent via shared tokens. |
| Panel toggle buttons | Yes | Yes | Yes | Chevron state remains tied to `aria-expanded`. |
| Primary/ghost/danger buttons | Yes | Yes | Yes | Shared focus ring standardized. |
| Form fields (input/select/textarea) | Yes | N/A | Yes | Shared focus border + ring standardized. |
| Details/Summary controls | Yes | Yes | Yes | Summary focus styles now explicit. |

## Contrast Review (Quick Pass)

| Pattern | Approx Result | Status |
| --- | --- | --- |
| Body text on panel backgrounds | >= 4.5:1 | Pass |
| Muted helper text on light panels | Around 4.5:1 | Pass (monitor) |
| Brand green on white for UI accents | >= 4.5:1 in core usage | Pass |
| Red/Orange/Green status chips text on tint backgrounds | Varies by chip; generally >= 4.5:1 | Pass (spot-check per future palette changes) |

## Motion/Interaction Safety

- `prefers-reduced-motion` fallback is active in shared tokens.
- Focus ring is visible for keyboard interaction on links/buttons/summary + form controls.
- Toggle controls retain minimum 32x32 hit target.
- Local automation available via `node scripts/a11y-smoke.mjs`.
- CI workflow available via `/.github/workflows/ui-a11y.yml` (Playwright + axe + smoke checks).

## Outstanding Work (Phase 3 Candidate)

1. Automated accessibility audits in CI (axe/playwright).
2. Full color contrast sampling with a tooling report for all status permutations.
3. Landmark refinement and skip-link pattern for faster keyboard navigation.
4. Screen-reader walkthrough on board and detail-heavy pages.

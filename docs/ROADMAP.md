# Roadmap

## Tiered plans (planned monetisation)

Free and Premium plans are a planned future feature. **During the demo all
features are free**: no account is limited, and nothing is charged.

What exists today:

- `User.accountType` (`FREE` / `PREMIUM`) is kept in the schema, and the admin
  can still set it, but nothing is gated on it.
- The Free caps (5 AI parses per day, 2 generated courses) are still defined in
  `shared/validation.ts` and switched off by `TIER_LIMITS_ENABLED = false`.
  `tierLimit()` in `backend/src/lib/tier.ts` is the single decision point; the
  `402 UPGRADE_REQUIRED` gates in the AI and courses controllers are dormant.
- The **Premium** page is a preview of planned features, labelled as not yet
  available, with no tier switch.
- AI cost is bounded by the per-user rate limit (`AI_RATE_LIMIT_PER_HOUR`,
  default 200/hour), which is an abuse guard, not a plan limit.

Planned for Premium (subject to change):

- A paid monthly plan with real billing.
- Higher AI parsing and course-generation allowances once Free plan limits
  return.
- Priority access to new features as they ship.

To turn the plans on later: add billing, set `TIER_LIMITS_ENABLED = true`,
restore an upgrade action on the Premium page, and show an upgrade prompt on a
`402 UPGRADE_REQUIRED` response (`ApiError.upgradeRequired` in
`frontend/src/lib/api.ts` already detects it).

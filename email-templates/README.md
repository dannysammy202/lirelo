# Lirelo authentication email templates

**Supabase project**: Struct (`phkejehwadwzxvtjmesq`). The project is shared, so **do not replace a template without backing up its current HTML and subject**.

Lirelo does not require a purchased domain to style the email. Delivery remains via the project's current Supabase sender. Without custom SMTP, Supabase limits delivery to authorised organisation/team email addresses and throttles sending. For public account creation, a verified sending domain and custom SMTP must eventually be configured.

## Configure without changing Struct's email appearance

1. Visit https://supabase.com/dashboard/project/phkejehwadwzxvtjmesq/auth/templates.
2. Open **Confirm sign up**; copy its current subject and HTML into a separate backup file.
3. Open `confirm-signup.html`. The `{{ if eq .RedirectTo "https://lirelo-sooty.vercel.app" }}` branch is the Lirelo design; the `{{ else }}` branch contains a default-style fallback.
4. **Replace the entire `{{ else }}` body with the exact previously saved content of the existing shared-project template**, preserving its Go placeholders. Do not paste a whole existing `if`/`else` wrapper into another wrapper without checking syntax.
5. Keep the existing email **subject** unchanged because that setting is shared between apps. Paste the conditional HTML into the Body field; save and test a Lirelo signup and a Struct signup before proceeding.
6. Repeat with **Reset password** and `reset-password.html` once signup confirms that messages route to the correct template. Other templates are optional and should be installed only if those flows are in use.

Optional files: `magic-link.html`, `invite-user.html`, `change-email.html`, `reauthentication.html`. Template names correspond to Supabase's Authentication > Email Templates sections.

**Why the conditional works**: Lirelo sends an explicit `redirect_to=https://lirelo-sooty.vercel.app` for sign-up and recovery. Supabase Go templates expose that parameter as `.RedirectTo`. For any other redirect, the `else` branch runs. **Changing Supabase Site URL alone does not distinguish apps**: always send explicit `redirect_to` in each app.

Keep `{{ .ConfirmationURL }}` unchanged in link buttons and `{{ .Token }}` for reauthentication codes. The HTML previews are non-functional visual samples, never use them as actual Supabase templates. A link may be consumed by some email scanners; an OTP-based confirmation flow would be a separate security enhancement.

## Settings not modified automatically

The connected Supabase integration has no method to update hosted Auth email templates safely. These HTML files are prepared and included in GitHub, but **are not active until pasted into the dashboard**. Sending identity and sender domain have not been changed.
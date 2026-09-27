# CallLeah booking setup

The demo scheduler has been removed. `get-started.html` now uses the supplied real Cal.com inline embed for the `alihaa-kalsoomm113-mojs5c/30min` event.

## What works in the site

- Required form validation
- International phone input and validation
- Real Cal.com availability
- Name/email prefilled into Cal.com
- CallLeah form data passed as Cal.com booking metadata
- Real Cal.com booking-success event handling
- Confirmation screen using the real booking UID/start time/video URL when Cal.com provides them
- Mobile-friendly Cal.com embed

## Cal.com setup

In Cal.com, configure the `30min` event with:

1. Your real availability.
2. Your connected Google/Outlook/iCloud calendar.
3. A real meeting location such as Google Meet, Zoom, Microsoft Teams, or Cal Video.
4. Attendee confirmation emails.
5. Optional booking questions if you want the phone number collected as a native Cal.com field.

Cal.com is the source of truth for availability and bookings. The website does not generate slots.

## Admin email

The included `netlify/functions/cal-webhook.mjs` is a Netlify Function that verifies Cal.com's `X-Cal-Signature-256` webhook signature and sends a booking notification through Resend.

In Netlify, go to Site settings → Environment variables and set:

- `CAL_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ADMIN_EMAIL=aleehakalsoom999@gmail.com`

Deploy the project to Netlify, then in Cal.com create a webhook for the `30min` event:

- Trigger: `BOOKING_CREATED`
- Subscriber URL: `https://YOUR-DOMAIN.netlify.app/.netlify/functions/cal-webhook`
- Secret: use the same value as `CAL_WEBHOOK_SECRET`

Cal.com already sends the attendee's normal booking confirmation according to the event's notification settings. The webhook is for the custom CallLeah admin notification.

## Important

A static HTML file cannot securely send email using a private email API key. The webhook endpoint is therefore kept server-side. Do not put Resend or Cal.com secrets into frontend JavaScript.

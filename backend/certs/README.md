# Supabase database certificate authority

`supabase-prod-ca-2021.crt` is the **public** Supabase production root CA certificate. It contains no private key or project credential. Downloaded October 22, 2026 from the production URL configured in [Supabase Studio's official source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json):

`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`

Set `DATABASE_SSL_CA=certs/supabase-prod-ca-2021.crt` when running the backend from its directory on Railway. For local operator commands, use the certificate's absolute path. The PostgreSQL driver still verifies the server certificate and hostname. See [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

Refresh this asset from the official source when Supabase rotates its CA or before expiry; do not disable certificate verification to bypass a TLS failure. Other PostgreSQL providers may require their own CA configuration.

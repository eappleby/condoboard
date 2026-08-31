// Condo Board configuration.
//
// 1. Create a free project at https://supabase.com
// 2. In the Supabase dashboard: Project Settings -> API
// 3. Copy "Project URL" and the "anon / public" key below.
//
// While these are empty, the app runs in DEMO MODE with sample data
// (nothing is saved). See README.md for the full setup guide.

window.CONDOBOARD_CONFIG = {
  SUPABASE_URL: "https://wnmvehzatnclhogihlnx.supabase.co",       // e.g. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXZlaHphdG5jbGhvZ2lobG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNDQ3ODMsImV4cCI6MjEwMzcyMDc4M30.H_sdBIfaOiF5V0IdCl_e_nB2i1rH_TTHBAXIsil54As",  // the long "anon public" key
  BUILDING_NAME: "Condo Board",  // shown in the header

  // Password screen shown before the app loads. Set to "" to turn it off.
  // Note: this keeps casual visitors out if the link gets shared around, but
  // it is not real security — the password is readable in this file, which
  // the browser downloads. See "Security" in README.md.
  SITE_PASSWORD: "essex",
};

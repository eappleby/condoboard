-- The Settings tab no longer asks who receives the email, so the address is
-- set here. Change it with an update, or add the field back to the site.

update reminder_settings
   set digest_email = '37212th@gmail.com', updated_at = now()
 where id = 1
   and digest_email is null;

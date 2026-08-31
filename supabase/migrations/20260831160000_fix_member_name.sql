-- Correct the spelling of a board member's surname.
-- Recorded as O'Boye from the original roster, confirmed as O'Boyle.

update board_members
   set name = 'Meredith O''Boyle'
 where lower(email) = 'oboyleme@gmail.com';

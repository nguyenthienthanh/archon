-- Aura Frog - Supabase Bootstrap
-- Run this ONCE in Supabase SQL Editor to enable automatic schema setup
-- Then run: ./scripts/supabase/setup.sh

CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Verify it works
SELECT exec_sql('SELECT 1');

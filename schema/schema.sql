-- TABLES
DROP TABLE IF EXISTS pgdm_tables CASCADE;
CREATE TABLE pgdm_tables (
  table_view TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  delete_view BOOLEAN
);

DROP TABLE IF EXISTS pgdm_source CASCADE;
CREATE TABLE source (
  source_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  table_view text REFERENCES pgdm_tables (table_view)
);

-- FUNCTION GETTER
CREATE OR REPLACE FUNCTION get_source_id(source_name text) RETURNS INTEGER AS $$   
DECLARE
  sid integer;
BEGIN
  select source_id into sid from pgdm_source where name = source_name;

  if (sid is NULL) then
    RAISE EXCEPTION 'Unknown pgdm source: %', source_name;
  END IF;
  
  RETURN sid;
END ; 
$$ LANGUAGE plpgsql;
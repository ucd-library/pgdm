-- TABLES
DROP TABLE IF EXISTS tables CASCADE;
CREATE TABLE tables (
  table_view TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  name TEXT NOT NULL
);

DROP TABLE IF EXISTS source CASCADE;
CREATE TABLE source (
  source_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  table_view text REFERENCES tables
);

-- FUNCTION GETTER
CREATE OR REPLACE FUNCTION get_source_id(source_name text) RETURNS INTEGER AS $$   
DECLARE
  sid integer;
BEGIN
  select source_id into sid from source where name = source_name;

  if (sid is NULL) then
    RAISE EXCEPTION 'Unknown source: %', source_name;
  END IF;
  
  RETURN sid;
END ; 
$$ LANGUAGE plpgsql;
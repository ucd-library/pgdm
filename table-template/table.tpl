-- TABLE
DROP TABLE IF EXISTS {{tableName}} CASCADE;
CREATE TABLE {{tableName}} (
  {{tableName}}_id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES source NOT NULL,
);

-- VIEW
CREATE OR REPLACE VIEW {{tableName}}_view AS
  SELECT
    {{tableLetter}}.{{tableName}}_id as {{tableName}}_id,
{{viewStarter}}
    sc.name as source_name
  FROM
    {{tableName}} {{tableLetter}}
LEFT JOIN source sc ON {{tableLetter}}.source_id = sc.source_id;

-- FUNCTIONS
CREATE OR REPLACE FUNCTION insert_{{tableName}} (
{{viewInsertMethodSig}}
  source_name text) RETURNS void AS $$   
DECLARE
  source_id INTEGER;
BEGIN

  select get_source_id(source_name) into source_id;

  INSERT INTO {{tableName}} (
    {{viewInsertSql}}source_id
  ) VALUES (
    {{viewInsertSql}}source_id
  );

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_{{tableName}} (
  {{tableName}}_id_in INTEGER,
{{viewUpdateMethodSig}}) RETURNS void AS $$   
DECLARE

BEGIN

  UPDATE {{tableName}} SET (
    {{viewInsertSql}}
  ) = (
    test {{viewUpdateSql}}
  ) WHERE
    {{tableName}}_id = {{tableName}}_id_in;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

-- FUNCTION TRIGGERS
CREATE OR REPLACE FUNCTION insert_{{tableName}}_from_trig() 
RETURNS TRIGGER AS $$   
BEGIN
  PERFORM insert_{{tableName}}(
{{trigInsertMethodSig}}
    source_name := NEW.source_name
  );
  RETURN NEW;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_{{tableName}}_from_trig() 
RETURNS TRIGGER AS $$   
BEGIN
  PERFORM update_{{tableName}}(
    {{tableName}}_id_in := NEW.{{tableName}}_id,
{{trigUpdateMethodSig}}
  );
  RETURN NEW;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

-- FUNCTION GETTER
CREATE OR REPLACE FUNCTION get_{{tableName}}_id() RETURNS INTEGER AS $$   
DECLARE
  {{tableLetter}}id integer;
BEGIN

  select 
    {{tableName}}_id into {{tableLetter}}id 
  from 
    {{tableName}} {{tableLetter}} 
  where  

  if ({{tableLetter}}id is NULL) then
    RAISE EXCEPTION 'Unknown {{tableName}}: ', ;
  END IF;
  
  RETURN {{tableLetter}}id;
END ; 
$$ LANGUAGE plpgsql;

-- RULES
CREATE TRIGGER {{tableName}}_insert_trig
  INSTEAD OF INSERT ON
  {{tableName}}_view FOR EACH ROW 
  EXECUTE PROCEDURE insert_{{tableName}}_from_trig();

CREATE TRIGGER {{tableName}}_update_trig
  INSTEAD OF UPDATE ON
  {{tableName}}_view FOR EACH ROW 
  EXECUTE PROCEDURE update_{{tableName}}_from_trig();
-- TABLE
DROP TABLE IF EXISTS {{tableName}} CASCADE;
CREATE TABLE {{tableName}} (
  {{tableName}}_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID REFERENCES source NOT NULL,
);

-- VIEW
CREATE OR REPLACE VIEW {{tableName}}_view AS
  SELECT
    {{tableLetter}}.{{tableName}}_id AS {{tableName}}_id,
{{viewStarter}}
    sc.name AS source_name
  FROM
    {{tableName}} {{tableLetter}}
LEFT JOIN source sc ON {{tableLetter}}.source_id = sc.source_id;

-- FUNCTIONS
CREATE OR REPLACE FUNCTION insert_{{tableName}} (
  {{tableName}}_id UUID,
{{viewInsertMethodSig}}
  source_name TEXT) RETURNS void AS $$   
DECLARE
  {{tableLetter}}id UUID;
  source_id UUID;
BEGIN

  IF( {{tableName}}_id IS NULL ) THEN
    SELECT uuid_generate_v4() INTO {{tableName}}_id;
  END IF;
  SELECT get_source_id(source_name) INTO source_id;

  INSERT INTO {{tableName}} (
    {{tableName}}_id, {{viewInsertSql}}source_id
  ) VALUES (
    {{tableName}}_id, {{viewInsertSql}}source_id
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
    {{viewUpdateSql}}
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
    {{tableName}}_id := NEW.{{tableName}}_id,
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
CREATE OR REPLACE FUNCTION get_{{tableName}}_id() RETURNS UUID AS $$   
DECLARE
  {{tableLetter}}id UUID;
BEGIN

  SELECT 
    {{tableName}}_id INTO {{tableLetter}}id 
  FROM 
    {{tableName}} {{tableLetter}} 
  WHERE  

  IF ({{tableLetter}}id IS NULL) THEN
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
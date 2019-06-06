# PGDM Table Schema

Below is the required schema to use PGDM as well as overview documentation.

# Tables

There are two tables that are required to be in your database; `source` and `tables`.

## Tables

The `tables` table stores information about tables that PGDM can interact with. It also provides instructive deletes including

 - table_view: name of the table view to perform INSERT/UPDATE operations on
 - uid: name of the uid column for the table
 - name: name of the actual table
 - delete_view: Should DELETEs happen against the view or the table itself? More about this below.

```sql
CREATE TABLE tables (
  table_view TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  delete_view BOOLEAN
);
```

#### delete_view

The delete_view is a boolean column which indicates if DELETE operations should happen against
the table or the view.  The default is to delete against the table but some delete operations require additional work.  If this is the cause you should mark the column is TRUE.  If the column is TRUE you will need to wire up a DELETE trigger to the view as well as INSERT/UPDATE triggers.

## Source

The source table stores the names and unqiue id for all spreadsheets in the database.

```sql
-- TABLE
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
```

# Wire Table For PGDM

Here is an example of wiring up triggers to a view.

```sql
-- TABLE
DROP TABLE IF EXISTS crop CASCADE;
CREATE TABLE crop (
  crop_id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES source NOT NULL,
  name TEXT UNIQUE NOT NULL
);

-- VIEW
CREATE OR REPLACE VIEW crop_view AS
  SELECT
    c.crop_id as crop_id,
    sc.name as source_name,
    c.name as name
  FROM
    crop c,
    source sc
  WHERE
    c.source_id = sc.source_id;

-- FUNCTIONS
CREATE OR REPLACE FUNCTION insert_crop (
  name text,
  source_name text) RETURNS void AS $$   
DECLARE
  source_id INTEGER;
BEGIN

  select get_source_id(source_name) into source_id;

  INSERT INTO crop (
    source_id, name
  ) VALUES (
    source_id, name
  );

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_crop (
  name_in TEXT,
  crop_id_in INTEGER) RETURNS void AS $$   
DECLARE

BEGIN

  UPDATE crop SET 
    name = name_in
  WHERE
    crop_id = crop_id_in;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

-- FUNCTION TRIGGERS
CREATE OR REPLACE FUNCTION insert_crop_from_trig() 
RETURNS TRIGGER AS $$   
BEGIN
  PERFORM insert_crop(
    name := NEW.name,
    source_name := NEW.source_name
  );
  RETURN NEW;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_crop_from_trig() 
RETURNS TRIGGER AS $$   
BEGIN
  PERFORM update_crop(
    name_in := NEW.name,
    crop_id_in := NEW.crop_id
  );
  RETURN NEW;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;

-- FUNCTION GETTER
CREATE OR REPLACE FUNCTION get_crop_id(name_in text) RETURNS INTEGER AS $$   
DECLARE
  cid integer;
BEGIN

  select 
    crop_id into cid 
  from 
    crop c 
  where  
    name = name_in;

  if (cid is NULL) then
    RAISE EXCEPTION 'Unknown crop: %', name_in;
  END IF;
  
  RETURN cid;
END ; 
$$ LANGUAGE plpgsql;

-- RULES
CREATE TRIGGER crop_insert_trig
  INSTEAD OF INSERT ON
  crop_view FOR EACH ROW 
  EXECUTE PROCEDURE insert_crop_from_trig();

CREATE TRIGGER crop_update_trig
  INSTEAD OF UPDATE ON
  crop_view FOR EACH ROW 
  EXECUTE PROCEDURE update_crop_from_trig();
```
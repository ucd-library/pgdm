# pgdm-table-template

For most tables in a PGDM editable schema there will be a lot of under-the-hood plumbing required.  Every table will require at minimum a:

 - TABLE
 - VIEW
 - Insert function
 - Update function
 - Insert trigger function
 - Update trigger function
 - Insert trigger
 - Update trigger

And many tables will require

 - getter function

Finally some tables that perform INSERTs/UPDATEs on more than one table will require

 - Delete function
 - Delete trigger function
 - Delete trigger

... hopefully you see the pattern here.

To help generate a lot of the boilerplate code for a table there is the ```pgdm-table-template``` command line utility.  This utility will take a table name as well as column names/types you want in the view and then generate a .sql file with a LOT of the code required to create a table that works with PGDM. Additionally the ```pgdm-table-template``` command line utility is a good resource when you are getting started to see how the view/functions/trigger should look and operate for a table.

## Install

```pgdm-table-template``` is a NodeJS command line utility so NodeJS is required just like the ```pgdm``` cli.

To install run:

```npm install -g @ucd-lib/pgdm-table-template```

## Usage

```
> pgdm-table-template <table-name> [column=type] [column=type] ...
```

## Example Usage

To create the [crop table from the schema documentation](./schema#wire-table-for-pgdm) run:

```
> pgdm-table-template crop name=text
```

This will generate a crop.sql file.  Below we will investigate what each section does and what needs to be edited.

### TABLE

The ```pgdm-table-template``` makes no assumptions about your table schema, only the view that will be used to interact with it.  So your table will only contain a crop_id primary key and a source_id foreign key.  The source_id is required for all tables.

```sql
DROP TABLE IF EXISTS crop CASCADE;
CREATE TABLE crop (
  crop_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID REFERENCES source NOT NULL,
  -- for this example you add:
  -- name TEXT UNIQUE NOT NULL
);
CREATE INDEX crop_source_id_idx ON crop(source_id);
```

### VIEW

The view will always have the names of the view columns based on information provided when you ran the command.  It is up to you to join any additional tables as well as provide the table.column_name the view column came from.

```sql
CREATE OR REPLACE VIEW crop_view AS
  SELECT
    c.crop_id AS crop_id,
      as name,
    -- change above to
    -- c.name as name,
    sc.name AS source_name
  FROM
    crop c
LEFT JOIN source sc ON c.source_id = sc.source_id;
```

### INSERT function

The function that will be called via the trigger on view insert.

```sql
CREATE OR REPLACE FUNCTION insert_crop (
  crop_id UUID,
  name TEXT,
  -- most likely you don't need to do anything here
  source_name TEXT) RETURNS void AS $$   
DECLARE
  source_id UUID;
BEGIN

  -- we allow crop_id to be pre-populated if porting from one
  -- pgdm db to another other wise generate new uuid.
  IF( crop_id IS NULL ) THEN
    SELECT uuid_generate_v4() INTO crop_id;
  END IF;
  SELECT get_source_id(source_name) INTO source_id;

  -- you might do some additional getter function work if you have 
  -- other foreign key relations for this table other than source
  -- but you follow the same pattern, use getter function to lookup uid.

  INSERT INTO crop (
    crop_id, name, source_id
  ) VALUES (
    crop_id, name, source_id
  );

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;
```

### UPDATE function

The function that will be called via the trigger on view update.

```sql
CREATE OR REPLACE FUNCTION update_crop (
  crop_id_in UUID,
  name_in TEXT) RETURNS void AS $$   
DECLARE

BEGIN

  UPDATE crop SET (
    name, 
    -- if you need additional variables add them, otherwise remove the comma
  ) = (
    name_in
  ) WHERE
    crop_id = crop_id_in;

  -- NOTE:
  -- if you are only setting one column value, just like this example you
  -- the above syntax won't work. You actually need to call:
  -- 
  -- UPDATE crop SET 
  --   name = name_in
  -- WHERE
  ---  crop_id = crop_id_in;

EXCEPTION WHEN raise_exception THEN
  RAISE;
END; 
$$ LANGUAGE plpgsql;
```

### Function Triggers

These *should* be pretty close to what you need from the start.  These
functions map the NEW column to the insert/update function variable names.
The trigger functions then return a TRIGGER that can be wired up in the
trigger rule below.

```sql
CREATE OR REPLACE FUNCTION insert_crop_from_trig() 
RETURNS TRIGGER AS $$   
BEGIN
  PERFORM insert_crop(
    crop_id := NEW.crop_id,
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
```

### Getter Function

This is not required if no external table as a foreign key relation to the
primary key on this table.  The getter function should take in whatever
parameters are required to lookup a unique row in the table and return
the primary key.

```sql
CREATE OR REPLACE FUNCTION get_crop_id(name_in text) RETURNS UUID AS $$   
DECLARE
  cid UUID;
BEGIN

  select 
    crop_id into cid 
  from 
    crop c 
  where  
    name = name_in;

  -- Note the custom exception here!  These make debugging data issues
  -- a low easier and are highly recommended.
  if (cid is NULL) then
    RAISE EXCEPTION 'Unknown crop: %', name_in;
  END IF;
  
  RETURN cid;
END ; 
$$ LANGUAGE plpgsql;
```

### Tiggers

These rules should be ready out of the box and not require any modification.
The rules tell postgres to call the [insert/update trigger](function-triggers) functions when
the view is modified.

```sql
CREATE TRIGGER crop_insert_trig
  INSTEAD OF INSERT ON
  crop_view FOR EACH ROW 
  EXECUTE PROCEDURE insert_crop_from_trig();

CREATE TRIGGER crop_update_trig
  INSTEAD OF UPDATE ON
  crop_view FOR EACH ROW 
  EXECUTE PROCEDURE update_crop_from_trig();
```

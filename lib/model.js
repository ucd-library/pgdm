const fs = require('fs');
const path = require('path');
const source = require('./source');
const pg = require('./pg');
const config = require('./config');
const csv = require('./csv');
const EventEmitter = require('events');

class Model extends EventEmitter {

  async loadUids() {
    let pks = await pg.query(`select * from ${config.TABLES.PK}`);
    for( let row of pks ) {
      config.uids[row.table_view] = row.uid;
      config.tables[row.table_view] = row.name; 
    }
  }

  async exportCsv(sourceName, filepath) {
    let s = await source.getSource(sourceName);
    if( s === null ) throw new Error('Unknown source: '+source.getSourceName(sourceName));
  
    let revision = s.revision;
    let uid = config.uids[s.table_view];

    let result = await pg.query(`SELECT * FROM ${s.table_view} WHERE source_name = $1`, [sourceName], true);
    result.rows = result.rows.map(row => {
      delete row.source_name
      return row;
    });

    let columns = result.fields.map(field => ({key: field.name}))
      .filter(col => col.key !== 'source_name');


    await csv.export(filepath, result.rows, columns, revision, uid);

    return {
      rows : result.rows,
      source : s,
      revision,
      filepath
    }
  }

  list(source, view) {
    source = (source || '%').replace(/\*/g, '%');
    view = (view || '%').replace(/\*/g, '%');
    return pg.query(`SELECT * FROM ${config.TABLES.SOURCE} where name like $1 and table_view like $2`, [source, view]);
  }

  /**
   * @method insert
   * @description insert a new sheet into database
   * 
   * @param {String} filename 
   * @param {String} sheetname 
   * @param {String} table table or view to insert into
   * @param {Array} data Array of objects
   * 
   * @returns {Promise} 
   */
  async insert(filename, sheetname, table, data) {
    let s = await source.getSource(filename, sheetname);
    if( s !== null ) throw new Error('Source already exists: '+source.getSourceName(filename, sheetname));

    try {
      await pg.query('BEGIN');
      await source.insertSource(filename, sheetname, table);

      this.emit('start');

      let c = 1;
      for( let row of data ) {
        let p1 = [];
        let p2 = [];
        let params = [];
        for( let key in row ) {
          p1.push(key);
          p2.push('$'+p1.length);
          params.push(row[key] === "" ? null : row[key]);
        }

        p1.push('source_name');
        p2.push('$'+p1.length);
        params.push(source.getSourceName(filename, sheetname));

        let stmt = `INSERT INTO ${table} (${p1.join(',')}) VALUES (${p2.join(',')})`;
        await pg.query(stmt, params);
        this.emit('insert', {total: data.length, current: c++});
      }

      this.emit('end');
      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }
  }

  /**
   * @method update
   * @description update table/view from sheet.  db uid required
   * 
   * @param {String} filename
   * @param {String} sheetname Optional.  Excel only
   * @param {Array} data Array of objects to insert
   * 
   * @returns {Promise} 
   */
  async update(analyzeInfo) {
    let table = config.tables[analyzeInfo.source.table_view];
    let uid = analyzeInfo.uid;
    let count = 0;
    let total = analyzeInfo.updates.length+analyzeInfo.inserts.length+analyzeInfo.deletes.length;

    try {
      this.emit('start', {length: total});
      await pg.query('BEGIN');

      // UPDATE
      for( let row of analyzeInfo.updates ) {
        row = row.new;
        let pk = row[uid];
        let params = [];
        let keys = [];

        for( let key in row ) {
          if( key === uid ) continue;
          keys.push([key, keys.length+1].join(' = $'));
          params.push(row[key] === "" ? null : row[key]);
        }
        params.push(pk);

        let stmt = `UPDATE ${analyzeInfo.source.table_view} SET ${keys.join(', ')} WHERE ${uid} = $${params.length}`;
        console.log(stmt, params);
        console.log(await pg.query(stmt, params));
        this.emit('update', {total: total, current: count++});
      }

      // INSERT
      for( let row of analyzeInfo.inserts ) {
        let params = [analyzeInfo.source.name];
        let keys = [['source_name', 1]];

        for( let key in row ) {
          keys.push([key, keys.length+1]);
          params.push(row[key] === "" ? null : row[key]);
        }

        let stmt = `INSERT INTO ${analyzeInfo.source.table_view} (${keys.map(v => v[0]).join(',')}) VALUES (${keys.map(v => '$'+v[1]).join(',')})`;
        await pg.query(stmt, params);
        this.emit('update', {total: total, current: count++});
      }

      // DELETE
      if( analyzeInfo.deletes.length ) {
        let uids = analyzeInfo.deletes.map(row => row[uid]);
        let stmt = `DELETE from ${table} where ${uid} in (${uids.map((v,i) => '$'+(i+1)).join(',')})`;
        await pg.query(stmt, uids);
        this.emit('update', {total: total, current: count++});
      }

      // update source revision
      await pg.query(`UPDATE source SET revision = revision + 1 WHERE name = $1`, [analyzeInfo.source.name]);

      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }
  }

  /**
   * @method analyzeUpdate
   * @description update table/view from sheet.  db uid required
   * 
   * @param {String} filename
   * @param {String} sheetname Optional.  Excel only
   * @param {Array} data Array of objects to insert
   * 
   * @returns {Promise} 
   */
  async analyzeUpdate(filename, sheetname, data, revision) {
    let s = await source.getSource(filename, sheetname);
    if( s === null ) throw new Error('Unknown source: '+source.getSourceName(filename, sheetname));

    // TODO: check revision id
    if( s.revision !== revision ) throw new Error(`Invalid revision: ${revision}, database is currently at ${s.revision}. please export source data again`);

    let uid = config.uids[s.table_view];
    if( !uid ) throw new Error(`Unknown table ${s.table_view} pk: Please specify in ${config.TABLES.PK} table`);

    let result = {
      uid,
      inserts : [],
      updates : [],
      deletes : [],
      errors : [],
      source : s
    }

    let uuids = {};
    let currentData = await this._getCurrentData(s.table_view, source.getSourceName(filename, sheetname), uid);

    for( let row of data ) {
      let uidValue = row[uid];

      if( uidValue ) {
        uuids[uidValue] = true;
        let cRow = currentData[uidValue];

        if( !cRow ) {
          result.errors.push(`Unknown ${uid} ${uidValue}`);
        } else if( JSON.stringify(row) !== JSON.stringify(cRow) ) {
          result.updates.push({old: row, new: cRow});
        }
      } else {
        result.inserts.push(row);
      }
    }

    for( let key in currentData ) {
      let cRow = currentData[key];
      if( !uuids[cRow[uid]] ) result.deletes.push(cRow);
    }

    currentData = null;

    return result;
  }

  async _getCurrentData(table, source, uid) {
    let stmt = `SELECT * from ${table} where source_name = $1`;
    let rows = await pg.query(stmt, [source]);
    let data = {};
    rows.forEach(item => {
      delete item.source_name;
      for( let key in item ) {
        if( typeof item[key] === 'number' ) item[key] = item[key].toString();
        else if( item[key] instanceof Date ) item[key] = item[key].toISOString().replace(/T.*/, '');
        else if( item[key] === null ) item[key] = '';
      }

      data[item[uid]] = item
    });
    return data;
  }

  /**
   * @method delete
   * 
   * @param {String} filename 
   * @param {String} sheetname 
   */
  async delete(filename, sheetname) {
    let s = source.getSource(filename, sheetname);
    if( s === null ) throw new Error('Unknown source: '+source.getSourceName(filename, sheetname));

    let uid = config.uids[table];
    if( !uid ) throw new Error(`Unknown table ${table} pk: Please specify in ${this.TABLES.PK} table`);

    try {
      await pg.query('BEGIN');
      let stmt = `DELETE from ${s.table_view} where source_id = $1 CASCADE`;
      await pg.query(stmt, [s.source_id]);

      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }
  }

  checkAndGetFilename(file) {
    if( !fs.existsSync(file) ) {
      throw new Error(`Unknown file: ${file}`);
    }

    let fileInfo = path.parse(file);
    if( fileInfo.ext !== '.xlsx' &&
        fileInfo.ext !== '.csv') {
      throw new Error(`Unsupported file type ${fileInfo.ext}.  Supported types are: xlsx, csv`);
    }

    return fileInfo.name+fileInfo.ext;
  }

}

module.exports = new Model();
const fs = require('fs-extra');
const path = require('path');
const source = require('./source');
const pg = require('./pg');
const config = require('./config');
const csv = require('./csv');
const EventEmitter = require('events');

class Model extends EventEmitter {

  constructor() {
    super();
    // we batch INSERTS/UPDATES because cloud manged data is SLOWWWWW to connect
    this.BATCH_SIZE = 100;
    this.setMaxListeners(10000);
  }

  /**
   * @method loadUids
   * @description load table information
   * 
   * @return {Promise}
   */
  async loadUids() {
    let pks = await pg.query(`select * from ${config.TABLES.PK}`);
    
    config.uids = {};
    config.tables = {};
    
    for( let row of pks ) {
      config.uids[row.table_view] = row.uid;
      config.tables[row.table_view] = row.name; 
    }
    return pks;
  }

  async exportAll(folderPath) {
    await fs.mkdirp(folderPath);
    let emptied = {};

    let sheets = await pg.query(`SELECT * FROM ${config.TABLES.SOURCE}`);
    for( let sheet of sheets ) {
      let viewPath = path.join(folderPath, sheet.table_view);
      if( !emptied[viewPath] ) {
        await fs.emptyDir(viewPath);
        emptied[viewPath] = true;
      }

      let result = await this.exportCsv(sheet.name, path.join(folderPath, sheet.table_view, sheet.name));
      console.log(`${result.rows.length} rows exported into ${sheet.table_view}/${sheet.name}.csv from table: ${result.source.table_view}`);
    }
  }

  /**
   * @method exportCsv
   * @description export csv file
   * 
   * @param {String} sourceName name of sheet to export
   * @param {String} filepath file with path to export sheet to
   * 
   * @returns {Object} export information
   */
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

  /**
   * @method list 
   * @description list sheets filtering by sheetname or table view.  Will match
   * to any part of provided sheetname or view name text.
   * 
   * @param {String} source soure name text to filter on
   * @param {String} view view name text to filter on
   * 
   * @returns {Promise}
   */
  list(source='', view='') {
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
  async insert(filename, sheetname, table, data, options={}) {
    let s = await source.getSource(filename, sheetname);
    if( s !== null ) throw new Error('Source already exists: '+source.getSourceName(filename, sheetname));

    try {
      await pg.query('BEGIN');
      
      await source.insertSource(filename, sheetname, table, options.revision);
      this.emit('insert-start', {total:data.length});

      let stmts = this._groupInserts(data, table, (keys, values) => {
        keys.push('source_name');
        values.push('$$'+source.getSourceName(filename, sheetname)+'$$')
      });

      for( let stmt of stmts ) {
        await pg.query(stmt.stmt);
        this.emit('insert-update', {total: data.length, current: stmt.row});
      }

      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }

    this.emit('insert-end');

    return;
  }

  /**
   * @method _groupInserts
   * @description group insert statments into batch size for given data
   * 
   * @param {Array} data 
   * @param {String} table 
   * @param {Function} customFn custom function to append key/values to each row
   * 
   * @return {Array}
   */
  _groupInserts(data, table, customFn) {
    let stmts = [];
    let c = 0;
    let stmt = '';

    for( let row of data ) {
      let keys = [];
      let values = [];

      for( let key in row ) {
        keys.push(key);
        values.push(row[key] === "" ? 'null' : "$$"+row[key]+"$$");
        if( row[key] === 'HRS' ) console.log(key, row[key]);
      }

      if( customFn ) customFn(keys, values);

      stmt += `INSERT INTO ${table} ("${keys.join('","')}") VALUES (${values.join(',')});`

      if( c % this.BATCH_SIZE === 0 ) {
        let row = c;
        stmts.push({stmt, row});
        stmt = '';
      }

      c++;
    }

    if( stmt ) stmts.push({stmt, row: c});
    return stmts;
  }

  /**
   * @method update
   * @description update table/view from sheet.  db uid required
   * 
   * @param {Object} analyzeInfo object returned from analyze method
   * 
   * @returns {Promise} 
   */
  async update(analyzeInfo) {
    let table = config.tables[analyzeInfo.source.table_view];
    let uid = analyzeInfo.uid;
    let count = 0;
    let total = analyzeInfo.updates.length+analyzeInfo.inserts.length+analyzeInfo.deletes.length;

    this.emit('update-start', {length: total});

    try {
      await pg.query('BEGIN');

      // UPDATE
      let stmt = '';
      for( let row of analyzeInfo.updates ) {
        row = row.new;
        let pk = row[uid];
        let params = [];

        for( let key in row ) {
          if( key === uid ) continue;

          let val = row[key] === "" ? null : `$$${row[key]}$$`;
          params.push(`"${key}" = ${val}`);
        }

        stmt += `UPDATE ${analyzeInfo.source.table_view} SET ${params.join(', ')} WHERE ${uid} = ${pk};`;
        
        if( count % this.BATCH_SIZE === 0 ) {
          let row = count;
          await pg.query(stmt);
          this.emit('update-update', {total, current: row, op: 'update'});
          stmt = '';
        }
      }

      if( stmt ) {
        await pg.query(stmt);
        this.emit('update-update', {total, current: count, op: 'update'});
      }


      // INSERT
      let stmts = this._groupInserts(analyzeInfo.inserts, analyzeInfo.source.table_view, (keys, values) => {
        keys.push('source_name');
        values.push('$$'+analyzeInfo.source.name+'$$')
      }, {type:'update', offset: count, total, op: 'insert'});

      for( let stmt of stmts ) {
        count += stmt.row;
        let row = count;
        await pg.query(stmt.stmt);
        this.emit('update-update', {total: analyzeInfo.inserts.length, current: row, op: 'insert'});
      }

      // DELETE
      if( analyzeInfo.deletes.length ) {
        let uids = analyzeInfo.deletes.map(row => row[uid]);
        let stmt = `DELETE from ${analyzeInfo.source.delete_view ? analyzeInfo.source.table_view : table} where ${uid} in (${uids.map((v,i) => '$'+(i+1)).join(',')})`;
        await pg.query(stmt, uids);
        this.emit('update-update', {total: total, current: count++, op: 'delete'});
      }

      // update source revision
      await pg.query('UPDATE source SET revision = revision + 1 WHERE name = $1', [analyzeInfo.source.name]);
    
      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }

    this.emit('insert-end');
  }

  /**
   * @method analyzeUpdate
   * @description update table/view from sheet.  db uid required
   * 
   * @param {String} filename filename of sheet
   * @param {String} sheetname leave null
   * @param {Array} data Array of objects to insert
   * @param {Number} revision current revision
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
    let currentData = await this._getSheetCurrentData(s.table_view, source.getSourceName(filename, sheetname), uid);

    for( let row of data ) {
      let uidValue = row[uid];

      if( uidValue ) {
        uuids[uidValue] = true;
        let cRow = currentData[uidValue];

        if( !cRow ) {
          result.errors.push(`Unknown ${uid} ${uidValue} for source`);
        } else if( JSON.stringify(row) !== JSON.stringify(cRow) ) {
          result.updates.push({old: cRow, new: row});
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

  /**
   * @method _getSheetCurrentData
   * @description get the current data for a sheet
   * 
   * @param {String} table table/view to query
   * @param {String} source sheet name
   * @param {String} uid table/view uid column
   * 
   * @returns {Promise}
   */
  async _getSheetCurrentData(table, source, uid) {
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
   * @param {String} sourceName name of sheet to remove 
   * 
   * @return {Promise}
   */
  async delete(sourceName) {
    let s = await source.getSource(sourceName);
    if( s === null ) throw new Error('Unknown source: '+sourceName);

    let table = config.tables[s.table_view];
    if( !table ) throw new Error(`Unknown table ${table}: Please specify in ${config.TABLES.PK} table`);

    try {
      await pg.query('BEGIN');
      let stmt = `DELETE from ${s.delete_view ? s.table_view : table} where source_id = $1`;
      await pg.query(stmt, [s.source_id]);

      stmt = `DELETE from source where source_id = $1`;
      await pg.query(stmt, [s.source_id]);

      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }
  }

  /**
   * @method replace
   * @description delete and replace all sheet data.  This function will uptick the revision
   * number as well.  For this reason the replace function should always be used over DELETE/INSERT.
   * 
   * @param {String} sourceName sheet name
   * @param {String} data sheet data
   * 
   * @returns {Promise}
   */
  async replace(sourceName, data) {
    let s = await source.getSource(sourceName);
    if( s === null ) throw new Error('Unknown source: '+sourceName);

    let table = config.tables[s.table_view];
    if( !table ) throw new Error(`Unknown table ${table}: Please specify in ${config.TABLES.PK} table`);


    this.emit('replace-start');

    try {
      await pg.query('BEGIN');

      // DELETE current
      await pg.query(`DELETE from ${s.delete_view ? s.table_view : table} where source_id = $1`, [s.soure_id]);


      // INSERT new
      let stmts = this._groupInserts(data, table, (keys, values) => {
        keys.push('source_name');
        values.push('$$'+sourceName+'$$')
      });

      for( let stmt of stmts ) {
        await pg.query(stmt.stmt);
        this.emit('replace-update', {total: data.length, current: stmt.row});
      }

      // UPDATE source revision
      await pg.query('UPDATE source SET revision = revision + 1 WHERE source_id = $1', [s.soure_id]);

      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');
      throw e;
    }

    this.emit('replace-end');
  }

  /**
   * @method analyzeDelete
   * @description analyze what will happen if a sheet is deleted, basically returns number of rows
   * associated with a spreadsheet
   * 
   * @param {String} sourceName name of sheet
   * 
   * @returns {Promise}
   */
  async analyzeDelete(sourceName) {
    let s = await source.getSource(sourceName);
    if( s === null ) throw new Error('Unknown source: '+source.getSourceName(sourceName));

    let uid = config.uids[s.table_view];
    if( !uid ) throw new Error(`Unknown table ${s.table} pk: Please specify in ${config.TABLES.PK} table`);

    let table = config.tables[s.table_view];

    let stmt = `select count(*) as count from ${table} where source_id = $1`;
    let rows = await pg.query(stmt, [s.source_id]);
    return {
      table : s.table_view,
      count : rows[0].count
    }
  }

  /**
   * @method analyzeFile
   * @description for a provided file (full path), invesitgate if this file is a:
   *  - new file
   *  - revision
   *  - replacement
   * This is mostly used for GUI applications
   * 
   * @param {String} file full path to csv file
   * 
   * @returns {Promise} resolves to object
   */
  async analyzeFile(file) {
    let fileinfo = path.parse(file);

    if( fileinfo.ext.toLowerCase() !== '.csv' ) {
      throw new Error('Invalid file extension: '+fileinfo.ext+'. File must be of type csv.');
    }

    let sourceName = fileinfo.name;
    let s = await source.getSource(sourceName);
    let data = await csv.getData(file);

    if( s === null ) return {
      type: 'new',
      revision: data.revision,
      headers: data.headers,
      data : data.records,
      sourceName
    };

    let uid = config.uids[s.table_view];
    s.uid = uid;

    if( data.revision === null ) {
      return {
        type: 'replacement', 
        source: s,
        revision: data.revision,
        headers: data.headers,
        data: data.records,
        sourceName
      };
    }

    if( data.revision !== s.revision ) {
      throw new Error(`Invalid revision file revision r${data.revision}.  Please export lastest sheet, then reupload`);
    }

    return {
      type: 'revision', 
      source: s, 
      headers: data.headers,
      data : data.records,
      revision: data.revision,
      sourceName
    }
  }

  /**
   * @method checkAndGetFilename
   * @description helper for file type checking.  Throws error if file does not exist
   * or is not .csv
   * 
   * @param {String} file full or partial file path
   * 
   * @returns {String} filename
   */
  checkAndGetFilename(file) {
    if( !fs.existsSync(file) ) {
      throw new Error(`Unknown file: ${file}`);
    }

    let fileInfo = path.parse(file);
    if( fileInfo.ext.toLowerCase() !== '.csv') {
      throw new Error(`Unsupported file type ${fileInfo.ext}.  Supported type is: csv`);
    }

    return fileInfo.name+fileInfo.ext;
  }

}





module.exports = new Model();
const fs = require('fs');
const path = require('path');
const source = require('./source');
const pg = require('./pg');
const config = require('./config');
const csv = require('./csv');
const EventEmitter = require('events');
const {PgRunner, PgError} = require('./pg-runner');

class Model extends EventEmitter {

  constructor() {
    super();
    this.BATCH_SIZE = 100;
    this.setMaxListeners(10000);
  }

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

    let cmds = [];

    cmds.push(() => source.insertSource(filename, sheetname, table));
    cmds.push(() => this.emit('insert-start', {total:data.length}));

    this._appendInserts(cmds, data, table, (keys, values) => {
      keys.push('source_name');
      values.push('$$'+source.getSourceName(filename, sheetname)+'$$')
    });

    cmds.push(() => this.emit('insert-end'));

    let cmdRunner = new PgRunner(options);
    try {
      await cmdRunner.run(cmds);
    } catch(e) {
      if( options.proceedOnError !== true ) {
        throw e;
      }
    }

    return cmdRunner.errors;
  }

  _appendInserts(cmds, data, table, customFn, options) {
    let stmt = '';
    let c = options.offset || 1;

    for( let row of data ) {
      let keys = [];
      let values = [];

      for( let key in row ) {
        keys.push(key);
        values.push(row[key] === "" ? 'null' : "$$"+row[key]+"$$");
      }

      if( customFn ) customFn(keys, values);

      stmt += `INSERT INTO ${table} ("${keys.join('","')}") VALUES (${values.join(',')});`

      if( c % this.BATCH_SIZE === 0 ) {
        let row = c;
        cmds.push({stmt, params:[], row: c, table});
        cmds.push(() => this.emit(`${option.type || 'insert'}-update`, {total: options.total || data.length, current: row}));
        stmt = '';
      }

      c++;
    }

    if( stmt ) {
      cmds.push(() => this.emit(`${option.type || 'insert'}-update`, {total: options.total || data.length, current: c-1}));
      cmds.push({stmt, params:[], row: c, table});
    }

    return c;
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
    let cmds = [];

    cmds.push(() => this.emit('update-start', {length: total}));

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
        cmds.push({stmt, params:[], row, table: analyzeInfo.source.table_view});
        cmds.push(() => this.emit('update-update', {total, current: row}));
        stmt = '';
      }
    }

    if( stmt ) {
      cmds.push({stmt, params:[], row: count, table: analyzeInfo.source.table_view});
      cmds.push(() => this.emit('update-update', {total, current: coutn}));
    }


    // INSERT
    count = this._appendInserts(cmds, analyzeInfo.inserts, table, (keys, values) => {
      keys.push('source_name');
      values.push('$$'+analyzeInfo.source.name+'$$')
    }, {type:'update', offset: count, total});

    // DELETE
    if( analyzeInfo.deletes.length ) {
      let uids = analyzeInfo.deletes.map(row => row[uid]);
      let stmt = `DELETE from ${analyzeInfo.source.delete_view ? analyzeInfo.source.table_view : table} where ${uid} in (${uids.map((v,i) => '$'+(i+1)).join(',')})`;
      await pg.query(stmt, uids);
      this.emit('update', {total: total, current: count++});
    }

    // update source revision
    cmds.push({stmt: `UPDATE source SET revision = revision + 1 WHERE name = $1`, params: [analyzeInfo.source.name]});

    let cmdRunner = new PgRunner(options);
    try {
      await cmdRunner.run(cmds);
    } catch(e) {
      if( options.proceedOnError !== true ) {
        throw e;
      }
    }

    return cmdRunner.errors;
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

  async replace(sourceName, filename, sheetname, data) {
    let s = await source.getSource(sourceName);
    if( s === null ) throw new Error('Unknown source: '+sourceName);

    let table = config.tables[s.table_view];
    if( !table ) throw new Error(`Unknown table ${table}: Please specify in ${config.TABLES.PK} table`);


    let cmds = [];
    cmds.push(() => this.emit('replace-start'));

    let stmt = `DELETE from ${s.delete_view ? s.table_view : table} where source_id = $1`;
    cmds.push({stmt, params: [s.source_id]});

    stmt = `DELETE from source where source_id = $1`;
    cmds.push({stmt, params: [s.source_id]});

    cmds.push(() => source.insertSource(filename, sheetname, table));

    this._appendInserts(cmds, data, table, (keys, values) => {
      keys.push('source_name');
      values.push('$$'+source.getSourceName(filename, sheetname)+'$$')
    },{type: 'replace'});

    cmds.push(() => this.emit('replace-end'));

    let cmdRunner = new PgRunner(options);
    try {
      await cmdRunner.run(cmds);
    } catch(e) {
      if( options.proceedOnError !== true ) {
        throw e;
      }
    }

    return cmdRunner.errors;
  }

  async analyzeDelete(sourceName) {
    let s = await source.getSource(sourceName);
    if( s === null ) throw new Error('Unknown source: '+source.getSourceName(sourceName));

    let uid = config.uids[s.table_view];
    if( !uid ) throw new Error(`Unknown table ${s.table} pk: Please specify in ${config.TABLES.PK} table`);

    let stmt = `select count(*) as count from ${s.name} where source_id = $1`;
    let rows = await pg.query(stmt, [s.source_id]);
    return {
      table : s.table,
      count : rows[0].count
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
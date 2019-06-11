const pg = require('./pg');
const Cursor = require('pg-cursor');
const path = require('path');

class SourceController {

  getSourceName(filename, sheetname) {
    filename = path.parse(filename).name;
    if( sheetname ) return filename+'.'+sheetname;
    return filename;
  }
  
  getSource(filename, sheetname) {
    let name = this.getSourceName(filename, sheetname);
    return pg.querySingle(`select * from source where name = $1`, [name]);
  }

  insertSource(filename, sheetname, table, revision) {
    if( revision === undefined ) revision = 0;
    else revision += 1;

    return pg.query(
      'INSERT INTO source (name, table_view, revision) values ($1, $2, $3)',
      [this.getSourceName(filename, sheetname), table, revision]
    );
  }
  
  async getSourceRows(filename, sheetname, callback, done) {
    let source = await this.getSource(filename, sheetname);
    if( !source ) throw new Error('Unknown Source: '+this.getSourceName(filename, sheetname));

    this._readRow(
      client.query(new Cursor(`select * from ${source.table_view} where source_id = $1`), source.source_id),
      callback, done
    );
  }

  _readRow(cursor, callback, done) {
    cursor.read(1, (err, rows) => {
      if( err ) done(err);
      if( rows.length === 0 ) return done();
      callback(rows[0]);
      this._readRow(cursor, callback, done);
    });
  }
}

module.exports = new SourceController();
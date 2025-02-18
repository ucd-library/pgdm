const pg = require('./pg');
const Cursor = require('pg-cursor');
const path = require('path');
const config = require('./config');

class SourceController {

  getSourceName(filename, sheetname) {
    filename = path.parse(filename).name;
    if( sheetname ) return filename+'.'+sheetname;
    return filename;
  }
  
  getSource(filename, sheetname) {
    let name = this.getSourceName(filename, sheetname);
    return pg.querySingle(`select * from ${config.TABLES.SOURCE} where name = $1`, [name]);
  }

  /**
   * @method insertSource
   * @description insert a new source file.  If no revision is given, it is
   * set to 0.  Otherwise you can pass in the current revision of the file.
   */
  insertSource(filename, sheetname, table, revision) {
    if( !revision ) revision = 0;
    // else revision += 1;

    return pg.query(
      'INSERT INTO '+config.TABLES.SOURCE+' (name, table_view, revision) values ($1, $2, $3)',
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
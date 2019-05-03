const pg = require('./pg');

class PgRunner {

  constructor(options={}) {
    this.errors = [];
    this.options = options;
  }

  async run(cmds) {
    let rolledback = false;

    try {
      await pg.query('BEGIN');

      for( let cmd of cmds ) {
        await this._runCmd(cmd);
      }
      
      await pg.query('COMMIT');
    } catch(e) {
      await pg.query('ROLLBACK');

      rolledback = true;
      this.errors.push(e);
      if( this.options.proceedOnError !== true ) {
        throw e;
      }
    }

    if( !rolledback && this.errors.length ) {
      await pg.query('ROLLBACK');
    }
  }

  async _runCmd(cmd) {
    try {
      if( typeof cmd === 'function' ) {
        return await cmd();
      } else {
        return await pg.query(cmd.stmt, cmd.params);
      }
    } catch(e) {
      let info = {};
      if( typeof cmd === 'object' ) {
        info.table = cmd.table;
        info.params = cmd.params;
        info.row = cmd.row;
        info.uid = cmd.uid;
      }
      e = new PgRunnerError(e, info);

      this.errors.push(e);
      if( this.options.proceedOnError !== true ) {
        throw e;
      }
    }
  }

}

class PgRunnerError extends Error {
  constructor(error, info={}) {
    super(error.message);
    this.originalError = error;
    this.info = info;
  }
}

module.exports = {PgRunnerError, PgRunner};
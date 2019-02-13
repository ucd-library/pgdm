const {Client} = require('pg');
const ini = require('multi-ini');
const path = require('path');
const fs = require('fs');

class PG {

  async connect(config) {
    if( config.service ) {
      config = this.getConfig(config.service);
    }

    this.client = new Client({
      user: config.user,
      host: config.host,
      database: config.dbname,
      password: config.password || '',
      port: parseInt(config.port) || 5432,
      ssl : config.ssl || false
    });

    return this.client.connect();
  }
  

  getConfig(service) {
    let configPath = path.resolve(getUserHome(), '.pg_service.conf');
    if( !fs.existsSync(configPath) ) {
      console.log(configPath+' does not exist');
      process.exit(-1);
    }

    let config = ini.read(configPath);
    if( !config[service] ) {
      console.log(`Service ${service} does not exist`);
      process.exit(-1);
    }

    return config[service];
  }

  async querySingle(stmt, params) {
    let rows = await this.query(stmt, params);
    if( !rows ) return null;
    if( rows.length === 0 ) return null;
    return rows[0];
  }

  async query(stmt, params) {
    let resp = await this.client.query(stmt, params);
    return resp.rows;
  }

}

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

module.exports = new PG();
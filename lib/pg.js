const {Client} = require('pg');
const ini = require('multi-ini');
const path = require('path');
const fs = require('fs');
const os = require('os');
const clone = require('clone');

class PG {

  async connect(config={}) {
    if( config.service ) {
      config = Object.assign(config, this.getConfig(config.service));
    }

    this.client = new Client({
      user: config.user,
      host: config.host,
      database: config.dbname,
      password: config.password || '',
      port: parseInt(config.port) || 5432,
      ssl : config.sslmode === 'require' ? true : false
    });

    await this.client.connect();
    return this.client;
  }

  getServiceFilePath() {
    return path.resolve(os.homedir(), '.pg_service.conf');
  }

  /**
   * @method getServices
   * @description return services listed in ~/.pg_service.conf file
   * 
   * @returns {Object}
   */
  getServices() {
    let configPath = this.getServiceFilePath();
    if( !fs.existsSync(configPath) ) {
      return null;
    }
    return ini.read(configPath);
  }
  

  /**
   * @method getConfig
   * @description get connection config by name from ~/.pg_service.conf file
   * 
   * @returns {Object}
   */
  getConfig(service) {
    let config = this.getServices();

    if( !config ) return null;
    if( !config[service] ) return null;

    return config[service];
  }

  saveConfig(name, config, replace) {
    let services = this.getServices() || {};
    config = clone(config);
    services[name] = config;

    if( typeof config.sslmode === 'boolean' ) {
      if( config.sslmode ) config.sslmode = 'require';
      else delete config.sslmode;
    }

    for( let key in config ) {
      if( typeof config[key] !== 'string' ) {
        config[key] = config[key].toString();
      } else if( !config[key] ) {
        delete config[key];
      }
    }

    if( replace && services[replace] ) {
      delete services[replace] 
    }

    this._saveServices(services);
  }

  removeConfig(name) {
    let services = this.getServices() || {};
    if( services[name] ) delete services[name];

    this._saveServices(services);
  }

  _saveServices(services) {
    let serializer = new ini.Serializer({keep_quotes: true});
    let content = serializer.serialize(services);
    content = content.replace(/(^|\n|\r)(\[.*\])(\n|\r)/g, os.EOL+'$1$2$3');
    fs.writeFileSync(this.getServiceFilePath(), content);
  }

  async querySingle(stmt, params) {
    let rows = await this.query(stmt, params);
    if( !rows ) return null;
    if( rows.length === 0 ) return null;
    return rows[0];
  }

  async query(stmt, params, allinfo=false) {
    let resp = await this.client.query(stmt, params);
    if( allinfo ) return resp;
    return resp.rows;
  }

}

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

module.exports = new PG();
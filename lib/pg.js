const {Client} = require('pg');
const ini = require('multi-ini');
const path = require('path');
const fs = require('fs');
const os = require('os');
const clone = require('clone');
const gconfig = require('./config');

class PG {

  constructor() {
    this.schema = '';
    this.idle_in_transaction_session_timeout = 30000;
  }

  async connect(config={}) {
    if( config.service ) {
      config = Object.assign({}, this.getConfig(config.service), config);
    } else if( !config.ignoreServiceEnv && process.env.PGSERVICE && this.getConfig(process.env.PGSERVICE)) {
      config.service = process.env.PGSERVICE;
      config = Object.assign({}, this.getConfig(config.service), config);
    }
    if( !config.pgdm ) config.pgdm = {};

    if( config.dmsourcetable ) {
      config.pgdm.source = config.dmsourcetable;
      gconfig.TABLES.SOURCE = config.dmsourcetable;
      delete config.dmsourcetable;
    }
    if( config.dmlisttable ) {
      config.pgdm.table = config.dmlisttable;
      gconfig.TABLES.PK = config.dmlisttable;
      delete config.dmlisttable;
    }

    this.client = new Client({
      user: config.user,
      host: config.host,
      database: config.dbname || config.database,
      password: config.password || '',
      port: parseInt(config.port) || 5432,
      ssl : config.sslmode === 'require' ? true : false
    });

    await this.client.connect();

    // TODO: figure out how to handle notices
    // this.client.on('notice', (notice) => {
    //   console.log('NOTICE:', notice.message);
    // });

    this.schema = config.schema || config.pgdm.schema || 'public';
    if( config.schema || config.pgdm.schema ) {
      await this.client.query(`SET search_path TO ${config.schema || config.pgdm.schema},public`);
    }
    await this.client.query(`SET SESSION idle_in_transaction_session_timeout = ${this.idle_in_transaction_session_timeout}`);

    process.on('exit', async () => {
      try {
        await this.client.end();
      } catch(e) {}
      console.log('ending pg client connection');
    });
    process.on('SIGINT', async () => {
      try {
        await this.client.end();
      } catch(e) {}
      console.log('SIGINT: ending pg client connection');
    });
    

    return this.client;
  }

  getServiceFilePath() {
    return path.resolve(os.homedir(), '.pg_service.conf');
  }

  getPgdmConfFilePath() {
    return path.resolve(os.homedir(), '.pgdm.conf');
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

    let services = ini.read(configPath);

    // if there is the additional pgdm config
    configPath = this.getPgdmConfFilePath();
    if( fs.existsSync(configPath) ) {
      let extra = ini.read(configPath);

      for( let name in services ) {
        if( !extra[name] ) continue;
        services[name].pgdm = extra[name];
      }
    }

    return services;
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

    let extras = {};
    for( let name in services ) {
      if( !services[name].pgdm ) continue;
      extras[name] = services[name].pgdm;
      delete services[name].pgdm;
    }

    config = clone(config);
    services[name] = config;

    if( config.pgdm ) {
      extras[name] = config.pgdm;
      delete config.pgdm;
    }

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
      delete services[replace];
    }
    if( replace && extras[replace] ) {
      delete extras[replace];
    }

    this._saveServices(services);
    this._savePgdmConfig(extras);
  }

  removeConfig(name) {
    let services = this.getServices() || {};
    
    let extras = {};
    for( let name in services ) {
      if( !services[name].pgdm ) continue;
      extras[name] = services[name].pgdm;
      delete services[name].pgdm;
    }

    if( services[name] ) delete services[name];
    if( extras[name] ) delete extras[name];

    this._saveServices(services);
    this._savePgdmConfig(extras);
  }

  _saveServices(services) {
    let serializer = new ini.Serializer({keep_quotes: true});
    let content = serializer.serialize(services);
    content = content.replace(/(^|\n|\r)(\[.*\])(\n|\r)/g, os.EOL+'$1$2$3');
    fs.writeFileSync(this.getServiceFilePath(), content);
  }

  _savePgdmConfig(extras) {
    let serializer = new ini.Serializer({keep_quotes: true});
    let content = serializer.serialize(extras);
    content = content.replace(/(^|\n|\r)(\[.*\])(\n|\r)/g, os.EOL+'$1$2$3');
    fs.writeFileSync(this.getPgdmConfFilePath(), content);
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
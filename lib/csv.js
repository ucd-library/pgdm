const parse = require('csv-parse');
const stringify = require('csv-stringify');
const fs = require('fs');

class CSV {

  constructor() {
    this.REVISION_REGEX = /:r\d+$/;
  }

  /**
   * @method getData
   * @description read in csv file return records, current revision and headers
   * 
   * @param {String} file file with path
   * 
   * @returns {Promise} 
   */
  getData(file) {
    let data = fs.readFileSync(file);

    return new Promise((resolve, reject) => {
      parse(data, (err, records) => {
        if( err ) return reject(err);
        let headers = records.shift();

        let revision = null;
        let oldKey, newKey;
        if( headers.length && headers[0].match(this.REVISION_REGEX) ) {
          oldKey = headers[0];
          newKey = headers[0].replace(this.REVISION_REGEX, '');
          revision = parseInt(headers[0].match(this.REVISION_REGEX)[0].replace(/^:r/, ''));
        }

        records = records.map(row => {
          let obj = {};
          headers.forEach((key, i) => {
            // replace revision header
            if( revision !== undefined && key === oldKey ) {
              key = newKey;
            }
            obj[key] = row[i];
          });
          return obj;
        });
        
        if( err ) reject(err);
        else resolve({records,revision,headers});
      });
    });
  }

  /**
   * @method export
   * @description export a csv file
   * 
   * @param {String} filename filename (with path) to export to
   * @param {Array} data sheet data
   * @param {Array} columns sheet column headers
   * @param {Number} revision current sheet revision
   * @param {String} uid uid property name
   * 
   * @return {Promise}
   */
  async export(filename, data, columns, revision, uid) {
    if( revision !== undefined ) {
      let ruid = uid+':r'+revision;
      data = data.map(item => {
        item[ruid] = item[uid];
        delete item[uid];
        return item;
      });
      columns.forEach(col => {
        if( col.key === uid ) col.key = ruid;
      });

      uid = ruid;
    }

    let str = await this.stringify(data, columns);
    fs.writeFileSync(filename+'.csv', str);
  }

  /**
   * @method stringify
   * @description helper method for generating csv from sheet data
   * and column headers
   * 
   * @param {Array} data 
   * @param {Array} columns
   * 
   * @return {Promise} 
   */
  stringify(data, columns) {
    return new Promise((resolve, reject) => {
      stringify(data, 
        {
          columns,
          header: true,
          cast : {
            date : v => v.toISOString().replace(/T.*/, ''),
            boolean : v => v ? 'TRUE' : 'FALSE'
          }
        }, 
        (err, data) => {
          if( err ) reject(err);
          else resolve(data);
        }
      )
    });
  }

}

module.exports = new CSV();
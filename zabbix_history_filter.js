const fs = require('fs');
const Promise = require('promise');
const request = require('request');

let tokenAuth = null;
let zabbixData = {};
let metrics = {};

let username = null;
let password = null;
let timeFrom = null;
let timeUntil = null;
let zabbixHost = null;

getTokenAuth = function() {
  let zabbixApiURL = 'https://' + zabbixHost + '/api_jsonrpc.php';
  return new Promise((resolve, reject)=>{
    request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'user.login',
        params: {
          user: username,
          password: password,
        },
        id: 1,
        auth: null,
      },
    },
    (error, response, body)=>{
      if (error) {
        reject(error);
      } else {
        resolve(body.result);
      }
    });
  });
};

getDevicesData = function() {
  let zabbixApiURL = 'https://' + zabbixHost + '/api_jsonrpc.php';

  return new Promise((resolve, reject)=>{
    request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'template.get',
        params: {
          output: 'shorten',
          filter: {
            host: ['Template Openwrt'],
          },
          selectHosts: ['hostid', 'name'],
        },
        auth: tokenAuth,
        id: 1,
      },
    },
    (error, response, body)=>{
      if (error) {
        reject(error);
        return;
      }
      if (!body.result) {
        reject('No results in body: ' + body.toString());
      }
      resolve(body.result);
    });
  });
};

getDeviceData = function(device) {
  let zabbixApiURL = 'https://' + zabbixHost + '/api_jsonrpc.php';
  return new Promise((resolve, reject)=>{
    request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'host.get',
        params: {
          output: 'shorten',
          selectItems: ['itemid', 'key_', 'name'],
          hostids: device.hostid,
        },
        id: 2,
        auth: tokenAuth,
      },
    },
    (error, response, body)=>{
      if (error) {
        console.log('\nWARNING! Error on request for device data:');
        console.log('Device: ' + device.name);
        console.log(error + '\n');
        resolve();
        return;
      }
      if (!body.result) {
        console.log('\nWARNING! Error on request for device data:');
        console.log('Device ID: ' + device.hostid);
        console.log('Device Name: ' + device.name);
        console.log('No results in body: ' + body.toString() + '\n');
        resolve();
        return;
      }
      parseDeviceData(body.result, device).then(resolve, reject);
    });
  });
};

parseDeviceData = function(result, device) {
  let items = result[0].items;
  let promises = [];
  items.forEach((item, i)=>{
    if (!item.key_.match(/dhcpd.hosts.tx/)) {
      metrics[item.key_] = true;
    }
    zabbixData[device.name][item.key_] = {'name': item.name};
    promises.push(getDataHistory(device, item));
  });
  return Promise.all(promises);
};

getDataHistory = function(device, item) {
  let zabbixApiURL = 'https://' + zabbixHost + '/api_jsonrpc.php';
  return new Promise((resolve, reject)=>{
    request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'history.get',
        params: {
          output: 'extend',
          hostids: device.hostid,
          itemids: item.itemid,
          time_from: timeFrom,
          time_till: timeUntil,
        },
        auth: tokenAuth,
        id: 1,
      },
    },
    (error, response, body)=>{
      if (error) {
        console.log('\nWARNING! Error on request for data history:');
        console.log('Device ID: ' + device.hostid);
        console.log('Device Name: ' + device.name);
        console.log('Item: ' + item.name);
        console.log(error + '\n');
        resolve();
        return;
      }
      parseDataHistory(body.result, device, item);
      resolve();
    });
  });
};

parseDataHistory = function(results, device, item) {
  if (typeof results === 'undefined') return;
  results.forEach((result, i)=>{
    zabbixData[device.name][item.key_][result.clock] = result.value;
  });
};

writeCSVFiles = function(metrics, data, targetDir) {
  for (let metric in metrics) {
    if (!Object.prototype.hasOwnProperty.call(metrics, metric)) continue;
    let fsMetric = metric.replace(/\[/g, '(');
    fsMetric = fsMetric.replace(/\]/g, ')');
    fsMetric = fsMetric.replace(/\//g, ';');
    let file = fs.createWriteStream(targetDir + '/' + fsMetric + '.csv');
    file.once('open', ()=>{
      file.write('mac,timestamp,value\n');
      for (let mac in data) {
        if (!Object.prototype.hasOwnProperty.call(data, mac)) continue;
        if (!(metric in data[mac])) continue;
        for (let clock in data[mac][metric]) {
          if (clock === 'name') continue;
          if (Object.prototype.hasOwnProperty.call(data[mac][metric], clock)) {
            file.write(mac+','+clock+','+data[mac][metric][clock]+'\n');
          }
        }
      }
      file.end();
    });
  }
  let file = fs.createWriteStream('output/dhcp-hosts.csv');
  file.once('open', ()=>{
    file.write('mac,lease_name,lease_mac,timestamp,tx_value\n');
    for (let mac in data) {
      if (!Object.prototype.hasOwnProperty.call(data, mac)) continue;
      for (let key in data[mac]) {
        if (!Object.prototype.hasOwnProperty.call(data[mac], key)) continue;
        if (!key.match(/dhcpd.hosts.tx/)) continue;
        for (let clock in data[mac][key]) {
          if (Object.prototype.hasOwnProperty.call(data[mac][key], clock)) {
            if (clock === 'name') continue;
            file.write(mac + ',');
            file.write(data[mac][key]['name'] + ',');
            file.write(key.substr(15, 17) + ',');
            file.write(clock + ',');
            file.write(data[mac][key][clock] + '\n');
          }
        }
      }
    }
  });
};

main = function() {
  if (process.argv.length !== 8) {
    console.log('Usage: node zabbix_history_filter.js ' +
                '<hostname> <user> <passwrd> <day> <month> <year>');
    console.log(process.argv);
    return;
  }
  zabbixHost = process.argv[2];
  username = process.argv[3];
  password = process.argv[4];
  let day = parseInt(process.argv[5]);
  let month = parseInt(process.argv[6]);
  let year = parseInt(process.argv[7]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    console.log('Error: Day, month and year must be numbers');
    return;
  }
  timeFrom = new Date(year, month-1, day, 0, 0, 0).getTime() / 1000;
  timeUntil = new Date(year, month-1, day, 23, 59, 59).getTime() / 1000;
  let targetDir = './' + year + '-' + month + '-' + day;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir);
  }

  process.on('unhandledRejection', (reason)=>{
    console.log(reason);
  });

  getTokenAuth()
  .then((token)=>{
    tokenAuth = token;
    return getDevicesData();
  })
  .then((result)=>{
    let hosts = result[0].hosts;
    return hosts.reduce((p, host, i)=>{
      zabbixData[host.name] = {};
      return p.then(() => getDeviceData(host));
    }, Promise.resolve());
  })
  .then((results)=>{
    console.log('Writing result to file...');
    fs.writeFile(targetDir + '/resultData.json',
                 JSON.stringify(zabbixData), (err)=>{
      if (err) console.log(err);
    });
    console.log('Writing csv files...');
    writeCSVFiles(metrics, zabbixData, targetDir);
    console.log('Done');
  }, (reason)=>{
    console.log(reason);
  });
};

// Run
main();

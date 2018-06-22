const fs = require('fs');
const shelljs = require('shelljs');
const Promise = require('promise');
const request = require('request');
const metricToHistory = require('./metric_to_history');

let tokenAuth = null;
let zabbixData = {};
let metrics = new Set();

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
      metrics.add(item.key_);
    }
    zabbixData[device.name][item.key_] = {'name': item.name};
    promises.push(getDataHistory(device, item));
  });
  return Promise.all(promises);
};

getDataHistory = function(device, item) {
  let zabbixApiURL = 'https://' + zabbixHost + '/api_jsonrpc.php';
  let historyParam = (Object.keys(metricToHistory).includes(item.key_)) ?
                     metricToHistory[item.key_] :
                     3;
  return new Promise((resolve, reject)=>{
    request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'history.get',
        params: {
          output: 'extend',
          history: historyParam,
          filter: {
            host: [device.hostid],
            itemid: [item.itemid],
          },
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

writeCSVFile = function(metric, data, targetDir) {
  return new Promise((resolve, reject)=>{
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
      resolve();
    });
  });
};

writeCSVFiles = function(metrics, data, targetDir) {
  return metrics.reduce((p, metric, i)=>{
    return p.then(() => {
      console.log('Writing CSV file %d / %d', i, metrics.length - 1);
      return writeCSVFile(metric, data, targetDir);
    });
  }, Promise.resolve()).then((result) => {
    return new Promise((resolve, reject)=>{
      let file = fs.createWriteStream(targetDir + '/dhcp-hosts.csv');
      file.once('open', ()=>{
        file.write('mac,lease_name,lease_mac,timestamp,tx_value\n');
        let count = Object.keys(data).length;
        let i = j = k = 0;
        let macList = Object.keys(data);
        let keyList = null;
        let clockList = null;
        let lastPrint = -1;
        const writerFunc = function() {
          let result = true;
          for (; i < count; i++) {
            if (i > lastPrint) {
              lastPrint = i;
              console.log('Writing dhcp data for client %d / %d', i, count - 1);
            }
            keyList = Object.keys(data[macList[i]]);
            for (; j < keyList.length; j++) {
              if (!keyList[j].match(/dhcpd.hosts.tx/)) continue;
              clockList = Object.keys(data[macList[i]][keyList[j]]);
              for (; k < clockList.length; k++) {
                if (clockList[k] === 'name') continue;
                if (!result) break;
                result &= file.write(macList[i] + ',');
                result &= file.write(
                  data[macList[i]][keyList[j]]['name'] + ','
                );
                result &= file.write(keyList[j].substr(15, 17) + ',');
                result &= file.write(clockList[k] + ',');
                result &= file.write(
                  data[macList[i]][keyList[j]][clockList[k]] + '\n'
                );
              }
              if (!result) break;
              k = 0;
            }
            if (!result) break;
            j = 0;
          }
          if (result) {
            file.end();
            resolve();
          } else {
            file.once('drain', writerFunc);
          }
        };
        writerFunc();
      });
    });
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
  let targetDir = './out/' + year + '-' + month + '-' + day;
  if (!fs.existsSync(targetDir)) {
    shelljs.mkdir('-p', targetDir);
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
      return p.then(() => {
        console.log('Fetching data for client %d / %d', i, hosts.length - 1);
        return getDeviceData(host);
      });
    }, Promise.resolve());
  })
  .then((results)=>{
    // console.log('Writing result to file...');
    // try {
    //   fs.writeFileSync(targetDir + '/resultData.json',
    //                    JSON.stringify(zabbixData));
    // } catch (err) {
    //   console.log(err);
    // }
    console.log('Writing csv files...');
    metrics = Array.from(metrics);
    return writeCSVFiles(metrics, zabbixData, targetDir);
  })
  .then((results)=>{
    console.log('Done');
  }, (reason)=>{
    console.log(reason);
  });
};

// Run
main();

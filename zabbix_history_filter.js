const Promise = require('promise');
const request = require('request');

let zabbixHost = 'zabbixgui.gigalink.net.br';
let tokenAuth = null;
let zabbixData = {};

let timeFrom = new Date(2018, 4, 4, 0, 0, 0).getTime() / 1000;
let timeUntil = new Date(2018, 4, 4, 23, 59, 59).getTime() / 1000;

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
          user: 'admin',
          password: 'gigalink',
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
        console.log('Device: ' + device.name);
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
        console.log('Device: ' + device.name);
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

main = function() {
  process.on('unhandledRejection', (reason)=>{
    console.log(reason);
  });

  getTokenAuth()
  .then((token)=>{
    tokenAuth = token;
    return getDevicesData();
  })
  .then((result)=>{
    let promises = [];
    let hosts = result[0].hosts;
    hosts.forEach((host, i)=>{
      if (host.hostid == '10301' || host.hostid == '10302') {
        zabbixData[host.name] = {};
        promises.push(getDeviceData(host));
      }
    });
    return Promise.all(promises);
  })
  .then((results)=>{
    console.log('Done');
    console.log(zabbixData);
  }, (reason)=>{
    console.log(reason);
  });
};

// Run
main();

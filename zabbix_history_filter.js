
const request = require('request');

let zabbixHost = 'zabbixgui.gigalink.net.br';

let timeFrom = new Date(2018, 4, 4, 0, 0, 0).getTime() / 1000;
let timeUntil = new Date(2018, 4, 4, 23, 59, 59).getTime() / 1000;

getTokenAuth = function(host, callback) {
  let zabbixApiURL = 'https://' + host + '/api_jsonrpc.php';

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
    function(error, response, body) {
      if (error) {
        console.log(error);
      } else {
        let tokenAuth = body.result;
        callback(tokenAuth);
      }
    }
  );
};

getDevicesZabbixData = function(host, tokenAuth) {
  let zabbixApiURL = 'https://' + host + '/api_jsonrpc.php';

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
    function(error, response, body) {
      if (error) {
        console.log(error);
      } else {
        let deviceHosts = body.result[0].hosts;
        deviceHosts.forEach((deviceHost, i)=>{
          if (deviceHost.hostid == '10301') {
            let deviceData = {hostname: deviceHost.name};
            getDeviceZabbixData(host, tokenAuth, deviceHost.hostid, deviceData);
          }
        });
      }
    }
  );
};

getDeviceZabbixData = function(host, tokenAuth, deviceId, deviceData) {
  let zabbixApiURL = 'https://' + host + '/api_jsonrpc.php';

  request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'host.get',
        params: {
          output: 'shorten',
          selectItems: ['itemid', 'key_', 'name'],
          hostids: deviceId,
        },
        id: 2,
        auth: tokenAuth,
      },
    },
    function(error, response, body) {
      if (error) {
        console.log(error);
      } else {
        if (body.result) {
          let deviceItems = body.result[0].items;
          deviceItems.forEach((deviceItem, i)=>{
            deviceData[deviceItem.key_] = {};
            getZabbixDataHistory(host, tokenAuth, deviceId, deviceItem,
                                 deviceData);
          });
        }
      }
    }
  );
};

getZabbixDataHistory = function(host, tokenAuth, deviceId, item, deviceData) {
  let zabbixApiURL = 'https://' + host + '/api_jsonrpc.php';
  request({
      url: zabbixApiURL,
      method: 'POST',
      json: {
        jsonrpc: '2.0',
        method: 'history.get',
        params: {
          output: 'extend',
          hostids: deviceId,
          itemids: item.itemid,
          time_from: timeFrom,
          time_till: timeUntil,
        },
        auth: tokenAuth,
        id: 1,
      },
    },
    function(error, response, body) {
      if (error) {
        console.log(error);
      } else {
        let itemValues = body.result;
        if (typeof itemValues === 'undefined') return;
        itemValues.forEach((itemValue)=>{
          deviceData[item.key_][itemValue.clock] = itemValue.value;
        });
      }
    }
  );
};

main = function() {
  getTokenAuth(zabbixHost, function(tokenAuth) {
    getDevicesZabbixData(zabbixHost, tokenAuth);
  });
};

// Run
main();

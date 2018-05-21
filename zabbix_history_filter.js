
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
          password: 'gigalink'
        },
        id: 1,
        auth: null
      }
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
            host: ['Template Openwrt']
          },
          selectHosts : ["hostid","name"]
        },
        auth: tokenAuth,
        id: 1
      }
    },
    function(error, response, body) {
      if (error) {
        console.log(error);  
      } else {
        let deviceHosts = body.result[0].hosts;
        for (idx in deviceHosts) {
          let deviceOutData = {hostname: deviceHosts[idx].name};
          getDeviceZabbixData(host, tokenAuth,
                              deviceHosts[idx].hostid, deviceOutData);
        }
      }
    }
  );
};

getDeviceZabbixData = function(host, tokenAuth, deviceId, deviceOutData) {
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
          hostids: deviceId
        },
        id: 2,
        auth: tokenAuth
      }
    },
    function(error, response, body) {
      if (error) {
        console.log(error);  
      } else {
        if (body.result) {
          let deviceItems = body.result[0].items;
          for (idx in deviceItems) {
            deviceOutData[deviceItems[idx].key_] = {};
            getZabbixDataHistory(host, tokenAuth,
                                 deviceId, deviceItems[idx], deviceOutData);
          }
        } 
      }
    }
  );
};

getZabbixDataHistory = function(host, tokenAuth, deviceId, item, deviceOutData) {
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
          time_till: timeUntil
        },
        auth: tokenAuth,
        id: 1
      }
    },
    function(error, response, body) {
      if (error) {
        console.log(error);  
      } else {
        let itemValues = body.result;
        for (idx in itemValues) {
          let sample = itemValues[idx];
          deviceOutData[item.key_][sample.clock] = sample.value;
        }
        console.log(deviceOutData);
      }
    }
  );
};

main = function() {
  getTokenAuth(zabbixHost, function(tokenAuth){
    getDevicesZabbixData(zabbixHost, tokenAuth);
  });
}

// Run
main();

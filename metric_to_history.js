// Possible values:
// 0 - numeric float
// 1 - character
// 2 - log
// 3 - numeric unsigned
// 4 - text
// https://www.zabbix.com/documentation/2.0/manual/appendix/api/history/get

let metricToHistory = {
  'active.burst.ping.avg': 0,
  'active.burst.ping.loss': 3,
};

module.exports = metricToHistory;

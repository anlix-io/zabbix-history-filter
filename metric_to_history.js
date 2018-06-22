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
  'system.cpu.load[percpu,avg1]': 0,
  'system.cpu.util[,system]': 0,
  'system.cpu.util[,user]': 0,
  'wifi.iwinfo.snr[wlan0]': 0,
  'wifi.iwinfo.noise[wlan0]': 0,
  'wifi.iwinfo.signal[wlan0]': 0,
};

module.exports = metricToHistory;

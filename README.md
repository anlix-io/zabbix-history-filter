# README #

Helper tool to export Zabbix OpenWRT template data to CSV and JSON

### SETUP ###

Install dependencies with:

```
npm install
```

Please include this tool on your crontab as follows to generate CSV and JSON using yesterday date

```
node zabbix_history_filter.js <ZABBIX FQDN HOST> <ZABBIX USER> <ZABBIX PASSWORD> $(date --date="yesterday" +%d) $(date --date="yesterday" +%m) $(date --date="yesterday" +%Y)
```

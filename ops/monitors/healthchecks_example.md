### Healthchecks.io / cron examples

Ready check (every minute):
```
curl -fsS http://YOUR_HOST:8080/ready >/dev/null || echo "not ready"
```

Status keyword check (every 5 minutes):
```
curl -fsS http://YOUR_HOST:8080/status?verbose=1 | grep -q slo || echo "missing slo"
```



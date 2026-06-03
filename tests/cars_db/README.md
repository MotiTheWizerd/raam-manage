# SLPR / Cars DB Probe

Small read-only tests for discovering how the SLPR/My Park data source works.

Run from the project root:

```powershell
node tests\cars_db\probe-slpr.mjs
```

The script reads:

```text
C:\SLPR\data\Local.properties
```

It checks:

- whether the configured DB host/port is reachable
- whether the configured HTTP URL responds
- whether the DB port exposes an obvious protocol banner

It does not write to the SLPR system or to this app's database.

